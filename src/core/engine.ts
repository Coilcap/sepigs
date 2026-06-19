import type { AddressInfo } from "node:net";
import type { InboundConfig, OutboundConfig, SepigsConfig } from "../config/types.js";
import { SystemDnsResolver } from "../dns/resolver.js";
import type { Inbound, InboundContext } from "../inbound/inbound.js";
import { inboundConfigsChanged, reloadInbounds } from "../inbound/reload.js";
import { createInboundFromRegistry, registerInboundFactory } from "../inbound/registry.js";
import { Logger } from "../logger/logger.js";
import { EventLoopMonitor } from "../observability/eventLoop.js";
import { GcMonitor } from "../observability/gc.js";
import { renderPrometheusMetrics } from "../observability/metrics.js";
import { PrometheusMetricsServer } from "../observability/prometheus.js";
import type { Outbound } from "../outbound/outbound.js";
import { createOutboundFromRegistry, registerOutboundFactory, unregisterOutboundFactory } from "../outbound/registry.js";
import { PluginManager } from "../plugin/plugin.js";
import { WasmExtensionManager, type WasmExtensionSnapshot } from "../plugin/wasm.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import { RoutingPolicyManager, type OutboundHealthSnapshot, type RoutingPolicySnapshot } from "../router/policy.js";
import { Router } from "../router/router.js";
import { UnavailableQuicTransport } from "../transport/quic.js";
import { ConfigError, errorMessage } from "../utils/errors.js";
import { WorkerPool } from "../workers/workerPool.js";
import { ConnectionManager, type ConnectionSnapshot } from "./connectionManager.js";
import { TcpConnectionPool, type ConnectionPoolSnapshot } from "./connectionPool.js";
import { LeakDetector, type LeakDetectorSnapshot } from "./leakDetector.js";
import { LifecycleManager } from "./lifecycle.js";
import { ResourceLimiter, type ResourceLimiterSnapshot } from "./resourceLimiter.js";
import { StatsTracker, type StatsSnapshot } from "./stats.js";
import { TimeoutManager, type ManagedTimer } from "./timeout.js";

export class Engine {
  private config: SepigsConfig;
  private readonly logger: Logger;
  private router: Router;
  private dnsResolver: SystemDnsResolver;
  private policyManager: RoutingPolicyManager;
  private connectionPool: TcpConnectionPool;
  private quicTransport: UnavailableQuicTransport;
  private readonly outbounds = new Map<string, Outbound>();
  private readonly inbounds = new Map<string, Inbound>();
  private readonly lifecycle = new LifecycleManager();
  private readonly stats = new StatsTracker();
  private readonly leakDetector: LeakDetector;
  private readonly timeoutManager: TimeoutManager;
  private readonly resourceLimiter: ResourceLimiter;
  private readonly connectionManager: ConnectionManager;
  private readonly wasmExtensions: WasmExtensionManager;
  private readonly workerPool: WorkerPool;
  private readonly pluginManager: PluginManager;
  private readonly eventLoopMonitor = new EventLoopMonitor();
  private readonly gcMonitor = new GcMonitor();
  private metricsServer: PrometheusMetricsServer;
  private leakReportTimer: ManagedTimer | undefined;
  private runtimeLoaded = false;
  private componentsBuilt = false;
  private started = false;

  public constructor(config: SepigsConfig, logger = new Logger(config.log.level)) {
    this.config = config;
    this.logger = logger.child("engine");
    this.router = new Router(config.route);
    this.dnsResolver = new SystemDnsResolver(config.dns, this.logger.child("dns"), this.stats);
    this.policyManager = new RoutingPolicyManager(config.route.policies);
    this.connectionPool = new TcpConnectionPool(config.connectionPool, this.logger.child("pool"));
    this.quicTransport = new UnavailableQuicTransport(config.transport.quic, this.logger.child("quic"));
    this.leakDetector = new LeakDetector(this.logger.child("leaks"));
    this.timeoutManager = new TimeoutManager(this.leakDetector);
    this.resourceLimiter = new ResourceLimiter(config.limits.maxConnections);
    this.connectionManager = new ConnectionManager(
      this.stats,
      this.resourceLimiter,
      this.leakDetector,
      this.timeoutManager,
      this.logger.child("connections")
    );
    this.wasmExtensions = new WasmExtensionManager(this.logger.child("wasm"));
    this.workerPool = new WorkerPool(config.workers, this.logger.child("workers"));
    this.pluginManager = new PluginManager(this.logger.child("plugins"), {
      workerPool: this.workerPool,
      wasmExtensions: this.wasmExtensions,
      registerInboundFactory,
      registerOutboundFactory,
      unregisterOutboundFactory
    }, config.plugins.isolation);
    this.metricsServer = this.createMetricsServer(config);
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    try {
      await this.ensureRuntimeLoaded();
      await this.workerPool.start();
      await this.pluginManager.start();
      this.buildComponents();
      this.lifecycle.markStarted();
      for (const inbound of this.inbounds.values()) {
        await inbound.start();
      }
      this.eventLoopMonitor.start();
      this.gcMonitor.start();
      await this.metricsServer.start();
      this.leakReportTimer = this.timeoutManager.setInterval("leak-report", this.config.limits.leakReportIntervalMs, () => {
        this.leakDetector.report();
      });
      this.started = true;
      this.logger.info("sepigs engine started", { inbounds: this.inbounds.size, outbounds: this.outbounds.size });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.connectionManager.closeAll("engine stop");
    this.leakReportTimer?.clear();
    this.leakReportTimer = undefined;
    await this.metricsServer.stop();
    this.eventLoopMonitor.stop();
    this.gcMonitor.stop();
    await this.lifecycle.stopAll(this.config.limits.shutdownTimeoutMs);
    this.connectionPool.closeAll();
    await this.quicTransport.close();
    await this.pluginManager.stop();
    await this.workerPool.stop();
    this.timeoutManager.clearAll();
    const wasStarted = this.started;
    this.started = false;
    if (wasStarted) {
      this.logger.info("sepigs engine stopped", this.stats.snapshot());
    }
  }

  public getStats(): StatsSnapshot {
    return this.stats.snapshot();
  }

  public getActiveConnections(): readonly ConnectionSnapshot[] {
    return this.connectionManager.listActive();
  }

  public closeConnection(id: string, reason = "forced close"): boolean {
    return this.connectionManager.closeConnection(id, reason);
  }

  public getLeakSnapshot(): LeakDetectorSnapshot {
    return this.leakDetector.snapshot();
  }

  public getResourceSnapshot(): ResourceLimiterSnapshot {
    return this.resourceLimiter.snapshot();
  }

  public getInboundAddress(tag: string): AddressInfo | string | null {
    return this.inbounds.get(tag)?.address() ?? null;
  }

  public getMetricsAddress(): AddressInfo | string | null {
    return this.metricsServer.address();
  }

  public getRoutingPolicies(): readonly RoutingPolicySnapshot[] {
    return this.policyManager.getPolicySnapshots();
  }

  public getOutboundHealth(): readonly OutboundHealthSnapshot[] {
    return this.policyManager.getHealthSnapshots();
  }

  public getWasmExtensions(): readonly WasmExtensionSnapshot[] {
    return this.wasmExtensions.list();
  }

  public getWorkerSnapshot(): { readonly enabled: boolean; readonly size: number; readonly pendingTasks: number } {
    return this.workerPool.snapshot();
  }

  public getConnectionPoolSnapshot(): ConnectionPoolSnapshot {
    return this.connectionPool.snapshot();
  }

  public async reloadConfig(config: SepigsConfig): Promise<void> {
    try {
      await this.applyReloadConfig(config);
      this.stats.recordHotReload(true);
    } catch (error) {
      this.stats.recordHotReload(false);
      throw error;
    }
  }

  private async applyReloadConfig(config: SepigsConfig): Promise<void> {
    const previousConfig = this.config;
    let reloadedInbounds: Map<string, Inbound> | undefined;
    if (this.componentsBuilt && inboundConfigsChanged(previousConfig.inbounds, config.inbounds)) {
      const inboundContext = this.createInboundContext(config);
      const result = await reloadInbounds({
        current: this.inbounds,
        previousConfigs: previousConfig.inbounds,
        nextConfigs: config.inbounds,
        logger: this.logger.child("inbound-reload"),
        createInbound: (inboundConfig) => this.createInbound(inboundConfig, inboundContext)
      });
      if (!result.reloaded) {
        throw new ConfigError("inbound hot reload failed; existing listeners were kept");
      }
      reloadedInbounds = result.inbounds;
    }

    this.config = config;
    this.router = new Router(config.route);
    this.dnsResolver = new SystemDnsResolver(config.dns, this.logger.child("dns"), this.stats);
    this.policyManager.reload(config.route.policies);
    this.connectionPool.closeAll();
    this.connectionPool = new TcpConnectionPool(config.connectionPool, this.logger.child("pool"));
    this.quicTransport = new UnavailableQuicTransport(config.transport.quic, this.logger.child("quic"));
    await this.metricsServer.stop();
    this.metricsServer = this.createMetricsServer(config);
    if (this.started) {
      await this.metricsServer.start();
    }

    if (this.runtimeLoaded) {
      await this.wasmExtensions.loadAll(config.plugins.wasm);
      await this.pluginManager.loadAll(config.plugins.modules);
    }
    if (this.componentsBuilt) {
      await this.reloadOutbounds();
    }
    if (reloadedInbounds !== undefined) {
      this.inbounds.clear();
      for (const inbound of reloadedInbounds.values()) {
        this.inbounds.set(inbound.tag, inbound);
        this.lifecycle.register(inbound);
      }
    }

    this.logger.info("sepigs config hot reloaded", {
      rules: config.route.rules.length,
      policies: config.route.policies.length,
      outbounds: this.outbounds.size
    });
  }

  private async openTcp(request: ProxyRequest): Promise<TcpOutboundConnection> {
    const route = this.router.match(request);
    this.stats.recordRouteMatch();
    const selection = this.policyManager.select(route.outboundTag);
    let lastError: unknown;

    for (const outboundTag of selection.candidates) {
      const outbound = this.outbounds.get(outboundTag);
      if (outbound === undefined) {
        lastError = new ConfigError(`route selected missing outbound "${outboundTag}"`);
        this.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }

      try {
        const startedAt = performance.now();
        const established = await outbound.connect(request);
        const latencyMs = performance.now() - startedAt;
        this.policyManager.recordSuccess(outboundTag, latencyMs);
        this.logger.debug("route selected", {
          connectionId: request.id,
          destination: `${request.destination.host}:${request.destination.port}`,
          requestedOutboundTag: route.outboundTag,
          policyTag: selection.policyTag,
          outboundTag: outbound.tag,
          ruleTag: route.ruleTag,
          matched: route.matched,
          connectLatencyMs: latencyMs
        });
        return established;
      } catch (error) {
        lastError = error;
        this.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        this.logger.debug("outbound candidate failed", {
          connectionId: request.id,
          outboundTag,
          requestedOutboundTag: route.outboundTag,
          error: errorMessage(error)
        });
      }
    }

    throw lastError instanceof Error ? lastError : new ConfigError(`route selected no usable outbound for "${route.outboundTag}"`);
  }

  private async sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    const route = this.router.match(request);
    this.stats.recordRouteMatch();
    const selection = this.policyManager.select(route.outboundTag);
    let lastError: unknown;

    for (const outboundTag of selection.candidates) {
      const outbound = this.outbounds.get(outboundTag);
      if (outbound === undefined) {
        lastError = new ConfigError(`route selected missing outbound "${outboundTag}"`);
        this.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }
      if (outbound.sendUdp === undefined) {
        lastError = new ConfigError(`outbound "${outbound.tag}" does not support UDP`);
        this.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }

      const startedAt = performance.now();
      try {
        const response = await outbound.sendUdp(request, payload);
        this.policyManager.recordSuccess(outboundTag, performance.now() - startedAt);
        this.logger.debug("udp route selected", {
          connectionId: request.id,
          destination: `${request.destination.host}:${request.destination.port}`,
          requestedOutboundTag: route.outboundTag,
          policyTag: selection.policyTag,
          outboundTag: outbound.tag,
          ruleTag: route.ruleTag,
          matched: route.matched
        });
        return response;
      } catch (error) {
        lastError = error;
        this.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
      }
    }

    throw lastError instanceof Error ? lastError : new ConfigError(`route selected no usable UDP outbound for "${route.outboundTag}"`);
  }

  private async ensureRuntimeLoaded(): Promise<void> {
    if (this.runtimeLoaded) {
      return;
    }
    await this.wasmExtensions.loadAll(this.config.plugins.wasm);
    await this.pluginManager.loadAll(this.config.plugins.modules);
    this.runtimeLoaded = true;
  }

  private buildComponents(): void {
    if (this.componentsBuilt) {
      return;
    }

    for (const outboundConfig of this.config.outbounds) {
      const outbound = this.createOutbound(outboundConfig);
      this.outbounds.set(outbound.tag, outbound);
      this.lifecycle.register(outbound);
    }

    const inboundContext = this.createInboundContext(this.config);
    for (const inboundConfig of this.config.inbounds) {
      const inbound = this.createInbound(inboundConfig, inboundContext);
      this.inbounds.set(inbound.tag, inbound);
      this.lifecycle.register(inbound);
    }
    this.componentsBuilt = true;
  }

  private async reloadOutbounds(): Promise<void> {
    await Promise.all(
      [...this.outbounds.values()].map(async (outbound) => {
        await outbound.stop();
      })
    );
    this.outbounds.clear();
    for (const outboundConfig of this.config.outbounds) {
      const outbound = this.createOutbound(outboundConfig);
      this.outbounds.set(outbound.tag, outbound);
      this.lifecycle.register(outbound);
    }
  }

  private createInboundContext(config: SepigsConfig): InboundContext {
    return {
      limits: config.limits,
      logger: this.logger,
      stats: this.stats,
      connectionManager: this.connectionManager,
      openTcp: async (request) => await this.openTcp(request),
      sendUdp: async (request, payload) => await this.sendUdp(request, payload)
    };
  }

  private createInbound(config: InboundConfig, context: InboundContext): Inbound {
    return createInboundFromRegistry(config, context, this.logger.child(`inbound:${config.tag}`));
  }

  private createOutbound(config: OutboundConfig): Outbound {
    return createOutboundFromRegistry(config, {
      limits: this.config.limits,
      logger: this.logger.child(`outbound:${config.tag}`),
      dnsResolver: this.dnsResolver
    });
  }

  private createMetricsServer(config: SepigsConfig): PrometheusMetricsServer {
    return new PrometheusMetricsServer(
      config.observability.metrics,
      () =>
        renderPrometheusMetrics({
          stats: this.stats.snapshot(),
          leaks: this.leakDetector.snapshot(),
          eventLoop: this.eventLoopMonitor.snapshot(),
          gc: this.gcMonitor.snapshot(),
          memory: process.memoryUsage()
        }),
      this.logger.child("metrics")
    );
  }
}
