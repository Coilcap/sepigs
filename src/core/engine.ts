import type { AddressInfo } from "node:net";
import type {
  DashboardConfig,
  InboundConfig,
  MetricsServerConfig,
  OutboundConfig,
  SepigsConfig
} from "../config/types.js";
import { SystemDnsResolver } from "../dns/resolver.js";
import type { DNSGenerationStoreMetrics } from "../dns/generationStore.js";
import { DashboardServer } from "../dashboard/server.js";
import type { Inbound, InboundContext } from "../inbound/inbound.js";
import { inboundConfigsChanged, reloadInbounds } from "../inbound/reload.js";
import { createInboundFromRegistry, registerInboundFactory } from "../inbound/registry.js";
import { Logger } from "../logger/logger.js";
import { EventLoopMonitor } from "../observability/eventLoop.js";
import { GcMonitor } from "../observability/gc.js";
import { renderPrometheusMetrics } from "../observability/metrics.js";
import { PrometheusMetricsServer } from "../observability/prometheus.js";
import type { Outbound } from "../outbound/outbound.js";
import { OutboundGeneration } from "../outbound/generation.js";
import { createOutboundFromRegistry, registerOutboundFactory, unregisterOutboundFactory } from "../outbound/registry.js";
import {
  OutboundRuntimeRegistry,
  type OutboundRuntimeReference,
  type OutboundRuntimeRegistrySnapshot
} from "../outbound/runtimeRegistry.js";
import { PluginManager } from "../plugin/plugin.js";
import { WasmExtensionManager, type WasmExtensionSnapshot } from "../plugin/wasm.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import type { OutboundHealthSnapshot, RoutingPolicySnapshot } from "../router/policy.js";
import {
  RoutingGenerationRuntime,
  createRoutingGenerationPair
} from "../router/generation.js";
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
import { UdpSessionManager } from "./udpSessionManager.js";
import { ReloadMetrics, type ReloadMetricsSnapshot } from "../reload/metrics.js";
import {
  RuntimeReloadIntegration,
  type RuntimeReloadOutcome
} from "../reload/runtimeIntegration.js";

export class Engine {
  private config: SepigsConfig;
  private readonly logger: Logger;
  private dnsResolver: SystemDnsResolver;
  private readonly routingRuntime: RoutingGenerationRuntime;
  private connectionPool: TcpConnectionPool;
  private quicTransport: UnavailableQuicTransport;
  private readonly outbounds = new Map<string, Outbound>();
  private outboundRegistry: OutboundRuntimeRegistry | undefined;
  private readonly inbounds = new Map<string, Inbound>();
  private readonly lifecycle = new LifecycleManager();
  private readonly stats = new StatsTracker();
  private readonly leakDetector: LeakDetector;
  private readonly timeoutManager: TimeoutManager;
  private readonly resourceLimiter: ResourceLimiter;
  private readonly connectionManager: ConnectionManager;
  private readonly udpSessionManager: UdpSessionManager;
  private readonly wasmExtensions: WasmExtensionManager;
  private readonly workerPool: WorkerPool;
  private readonly pluginManager: PluginManager;
  private readonly eventLoopMonitor = new EventLoopMonitor();
  private readonly gcMonitor = new GcMonitor();
  private metricsServer: PrometheusMetricsServer;
  private dashboardServer: DashboardServer;
  private readonly reloadMetrics = new ReloadMetrics("runtime-control-0");
  private readonly runtimeReloadIntegration: RuntimeReloadIntegration;
  private configReloader: (() => Promise<void>) | undefined;
  private leakReportTimer: ManagedTimer | undefined;
  private runtimeLoaded = false;
  private componentsBuilt = false;
  private started = false;

  public constructor(config: SepigsConfig, logger = new Logger(config.log.level)) {
    this.config = config;
    this.logger = logger.child("engine");
    this.dnsResolver = new SystemDnsResolver(config.dns, this.logger.child("dns"), this.stats);
    this.routingRuntime = new RoutingGenerationRuntime(createRoutingGenerationPair({
      idPrefix: "runtime-routing-0",
      sequence: 0,
      route: config.route,
      outboundTags: new Set(config.outbounds.map((outbound) => outbound.tag))
    }));
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
    this.udpSessionManager = new UdpSessionManager(
      config.limits.maxUdpSessions ?? 4_096,
      config.limits.udpIdleTimeoutMs ?? 60_000,
      this.stats,
      this.logger.child("udp-sessions")
    );
    this.lifecycle.register(this.udpSessionManager);
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
    this.dashboardServer = this.createDashboardServer(config);
    this.runtimeReloadIntegration = new RuntimeReloadIntegration(
      {
        currentMetricsServer: () => this.metricsServer,
        createMetricsServer: (metricsConfig) => this.createMetricsServerFromConfig(metricsConfig),
        replaceMetricsServer: (server) => {
          this.metricsServer = server;
        },
        currentDashboardServer: () => this.dashboardServer,
        createDashboardServer: (dashboardConfig) => this.createDashboardServerFromConfig(dashboardConfig),
        replaceDashboardServer: (server) => {
          this.dashboardServer = server;
        },
        routingRuntime: () => this.routingRuntime,
        outboundTags: (candidate) => new Set(
          (candidate?.outbounds ?? this.config.outbounds).map((outbound) => outbound.tag)
        ),
        outboundRuntimeRegistry: () => this.requireOutboundRegistry(),
        currentOutboundConfigs: () => this.config.outbounds,
        currentOutboundHealthSnapshot: () =>
          this.routingRuntime.active().policyManager.getHealthSnapshots(),
        createRuntimeOutbound: (outboundConfig, candidate) =>
          this.createOutbound(outboundConfig, candidate),
        dnsGenerationStore: () => this.dnsResolver.generationStore(),
        dnsFailureCountersSnapshot: () => {
          const stats = this.stats.snapshot();
          return {
            queries: stats.dnsQueriesTotal,
            failures: stats.dnsFailuresTotal
          };
        },
        runtimeStarted: () => this.started,
        commitRuntimeConfig: (nextConfig) => {
          this.config = nextConfig;
        }
      },
      this.reloadMetrics,
      this.logger.child("transactional-reload")
    );
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
      await this.dashboardServer.start();
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
    this.udpSessionManager.closeAll();
    this.leakReportTimer?.clear();
    this.leakReportTimer = undefined;
    await this.dashboardServer.stop();
    await this.metricsServer.stop();
    this.eventLoopMonitor.stop();
    this.gcMonitor.stop();
    await this.outboundRegistry?.stopAll();
    this.outboundRegistry = undefined;
    await this.lifecycle.stopAll(this.config.limits.shutdownTimeoutMs);
    this.connectionPool.closeAll();
    this.dnsResolver.stop();
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

  public getDashboardAddress(): AddressInfo | string | null {
    return this.dashboardServer.address();
  }

  public getReloadMetricsSnapshot(): ReloadMetricsSnapshot {
    return this.runtimeReloadIntegration.snapshot();
  }

  public getLastRuntimeReloadOutcome(): RuntimeReloadOutcome | undefined {
    return this.runtimeReloadIntegration.latestOutcome();
  }

  public async allocateFakeIp(domain: string): Promise<string> {
    return await this.dnsResolver.resolveForClient(domain);
  }

  public async resolveDns(host: string): Promise<string> {
    return await this.dnsResolver.resolve(host);
  }

  public setConfigReloader(reloader: () => Promise<void>): void {
    this.configReloader = reloader;
  }

  public getRoutingPolicies(): readonly RoutingPolicySnapshot[] {
    return this.routingRuntime.active().policyManager.getPolicySnapshots();
  }

  public getOutboundHealth(): readonly OutboundHealthSnapshot[] {
    return this.routingRuntime.active().policyManager.getHealthSnapshots();
  }

  public getActiveRouterGeneration(): { readonly id: string; readonly sequence: number } {
    const generation = this.routingRuntime.active().router;
    return { id: generation.id, sequence: generation.sequence };
  }

  public getActivePolicyGeneration(): { readonly id: string; readonly sequence: number } {
    const generation = this.routingRuntime.active().policy;
    return { id: generation.id, sequence: generation.sequence };
  }

  public getActiveDnsGeneration(): {
    readonly id: string;
    readonly sequence: number;
    readonly cacheEntries: number;
    readonly negativeCacheEntries: number;
    readonly inFlight: number;
    readonly drainingGenerations: number;
  } {
    const store = this.dnsResolver.generationStore();
    const generation = store.active();
    return {
      id: generation.id,
      sequence: generation.sequence,
      cacheEntries: generation.positiveCacheSize,
      negativeCacheEntries: generation.negativeCacheSize,
      inFlight: generation.inFlight,
      drainingGenerations: store.draining().length
    };
  }

  public getDnsReloadMetricsSnapshot(): DNSGenerationStoreMetrics {
    return this.dnsResolver.generationStore().metrics();
  }

  public getOutboundRuntimeSnapshot(): OutboundRuntimeRegistrySnapshot {
    return this.requireOutboundRegistry().snapshot();
  }

  public acquireOutboundRuntimeRef(
    tag: string,
    generationId?: string
  ): OutboundRuntimeReference | undefined {
    return this.requireOutboundRegistry().acquireOutboundRef(tag, generationId);
  }

  public async releaseOutboundRuntimeRef(
    reference: OutboundRuntimeReference
  ): Promise<void> {
    await this.requireOutboundRegistry().releaseOutboundRef(reference);
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
      if (config.reload.mode === "transactional-experimental") {
        await this.runtimeReloadIntegration.reload(this.config, config);
      } else {
        await this.applyReloadConfig(config);
      }
      this.stats.recordHotReload(true);
    } catch (error) {
      this.stats.recordHotReload(false);
      throw error;
    }
  }

  private async applyReloadConfig(config: SepigsConfig): Promise<void> {
    const previousConfig = this.config;
    const metricsChanged = JSON.stringify(previousConfig.observability.metrics) !== JSON.stringify(config.observability.metrics);
    const dashboardChanged = JSON.stringify(previousConfig.dashboard) !== JSON.stringify(config.dashboard);
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

    const activeRouting = this.routingRuntime.active();
    const routingSequence = Math.max(
      activeRouting.router.sequence,
      activeRouting.policy.sequence
    ) + 1;
    this.routingRuntime.replaceLegacy(createRoutingGenerationPair({
      idPrefix: `runtime-routing-${String(routingSequence)}`,
      sequence: routingSequence,
      route: config.route,
      outboundTags: new Set(config.outbounds.map((outbound) => outbound.tag)),
      healthSnapshot: activeRouting.policyManager.getHealthSnapshots()
    }));
    this.config = config;
    this.dnsResolver = new SystemDnsResolver(
      config.dns,
      this.logger.child("dns"),
      this.stats,
      this.dnsResolver.fakeIpForReload(config.dns)
    );
    this.connectionPool.closeAll();
    this.connectionPool = new TcpConnectionPool(config.connectionPool, this.logger.child("pool"));
    this.quicTransport = new UnavailableQuicTransport(config.transport.quic, this.logger.child("quic"));
    if (metricsChanged) {
      await this.metricsServer.stop();
      this.metricsServer = this.createMetricsServer(config);
      if (this.started) await this.metricsServer.start();
    }
    if (dashboardChanged) {
      await this.dashboardServer.stop();
      this.dashboardServer = this.createDashboardServer(config);
      if (this.started) await this.dashboardServer.start();
    }

    if (this.runtimeLoaded) {
      await this.wasmExtensions.loadAll(config.plugins.wasm);
      await this.pluginManager.loadAll(config.plugins.modules);
    }
    if (this.componentsBuilt) {
      await this.reloadOutbounds();
    }
    if (reloadedInbounds !== undefined) {
      for (const inbound of this.inbounds.values()) {
        this.lifecycle.unregister(inbound);
      }
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
    const routingHandle = this.routingRuntime.acquire();
    const routing = routingHandle.generation;
    try {
    const routedRequest = this.restoreFakeIpDestination(request);
    const route = routing.router.match(routedRequest);
    this.stats.recordRouteMatch();
    const selection = routing.policyManager.select(route.outboundTag);
    let lastError: unknown;

    for (const outboundTag of selection.candidates) {
      const outboundReference = this.outboundRegistry?.acquireOutboundRef(outboundTag);
      const outbound = outboundReference?.outbound ?? this.outbounds.get(outboundTag);
      if (outbound === undefined) {
        lastError = new ConfigError(`route selected missing outbound "${outboundTag}"`);
        routing.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }

      try {
        const startedAt = performance.now();
        const established = await outbound.connect(routedRequest);
        if (outboundReference !== undefined) {
          this.bindOutboundReference(established, outboundReference);
        }
        const latencyMs = performance.now() - startedAt;
        routing.policyManager.recordSuccess(outboundTag, latencyMs);
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
        if (outboundReference !== undefined) {
          await this.outboundRegistry?.releaseOutboundRef(outboundReference);
        }
        lastError = error;
        routing.policyManager.recordFailure(outboundTag);
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
    } finally {
      routingHandle.release();
    }
  }

  private async sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    const routingHandle = this.routingRuntime.acquire();
    const routing = routingHandle.generation;
    try {
    const routedRequest = this.restoreFakeIpDestination(request);
    const route = routing.router.match(routedRequest);
    this.stats.recordRouteMatch();
    const selection = routing.policyManager.select(route.outboundTag);
    let lastError: unknown;

    for (const outboundTag of selection.candidates) {
      const outbound = this.outbounds.get(outboundTag);
      if (outbound === undefined) {
        lastError = new ConfigError(`route selected missing outbound "${outboundTag}"`);
        routing.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }
      if (outbound.sendUdp === undefined) {
        lastError = new ConfigError(`outbound "${outbound.tag}" does not support UDP`);
        routing.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
        continue;
      }

      const startedAt = performance.now();
      try {
        const response = await outbound.sendUdp(routedRequest, payload);
        routing.policyManager.recordSuccess(outboundTag, performance.now() - startedAt);
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
        routing.policyManager.recordFailure(outboundTag);
        this.stats.recordOutboundFailure();
      }
    }

      throw lastError instanceof Error ? lastError : new ConfigError(`route selected no usable UDP outbound for "${route.outboundTag}"`);
    } finally {
      routingHandle.release();
    }
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
    this.outboundRegistry = this.createOutboundRuntimeRegistry(
      this.config,
      this.outbounds
    );

    const inboundContext = this.createInboundContext(this.config);
    for (const inboundConfig of this.config.inbounds) {
      const inbound = this.createInbound(inboundConfig, inboundContext);
      this.inbounds.set(inbound.tag, inbound);
      this.lifecycle.register(inbound);
    }
    this.componentsBuilt = true;
  }

  private async reloadOutbounds(): Promise<void> {
    if (this.outboundRegistry !== undefined) {
      await this.outboundRegistry.stopAll();
      this.outboundRegistry = undefined;
    } else {
      await Promise.all(
        [...this.outbounds.values()].map(async (outbound) => {
          await outbound.stop();
          this.lifecycle.unregister(outbound);
        })
      );
    }
    this.outbounds.clear();
    for (const outboundConfig of this.config.outbounds) {
      const outbound = this.createOutbound(outboundConfig);
      this.outbounds.set(outbound.tag, outbound);
      this.lifecycle.register(outbound);
    }
    this.outboundRegistry = this.createOutboundRuntimeRegistry(
      this.config,
      this.outbounds
    );
  }

  private createInboundContext(config: SepigsConfig): InboundContext {
    return {
      limits: config.limits,
      logger: this.logger,
      stats: this.stats,
      connectionManager: this.connectionManager,
      udpSessionManager: this.udpSessionManager,
      openTcp: async (request) => await this.openTcp(request),
      sendUdp: async (request, payload) => await this.sendUdp(request, payload)
    };
  }

  private restoreFakeIpDestination(request: ProxyRequest): ProxyRequest {
    const domain = this.dnsResolver.reverseFakeIp(request.destination.host);
    if (domain === undefined) {
      return request;
    }
    return {
      ...request,
      destination: { host: domain, port: request.destination.port, addressType: "domain" }
    };
  }

  private createInbound(config: InboundConfig, context: InboundContext): Inbound {
    return createInboundFromRegistry(config, context, this.logger.child(`inbound:${config.tag}`));
  }

  private bindOutboundReference(
    connection: TcpOutboundConnection,
    reference: OutboundRuntimeReference
  ): void {
    const registry = this.requireOutboundRegistry();
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      void registry.releaseOutboundRef(reference).catch((error: unknown) => {
        this.logger.warn("failed to release outbound generation reference", {
          generationId: reference.generationId,
          tag: reference.tag,
          error: errorMessage(error)
        });
      });
    };
    connection.socket.once("close", release);
    if (connection.socket.destroyed) queueMicrotask(release);
  }

  private createOutboundRuntimeRegistry(
    config: SepigsConfig,
    outbounds: ReadonlyMap<string, Outbound>
  ): OutboundRuntimeRegistry {
    const generation = new OutboundGeneration({
      id: "runtime-outbound-0",
      outbounds: config.outbounds,
      defaultOutbound: config.route.defaultOutbound,
      policies: config.route.policies,
      healthSnapshot: this.routingRuntime.active().policyManager.getHealthSnapshots(),
      state: "active"
    });
    return new OutboundRuntimeRegistry(generation, outbounds, {
      onActivate: (outbound) => {
        this.lifecycle.register(outbound);
      },
      onRetire: (outbound) => {
        this.lifecycle.unregister(outbound);
      }
    });
  }

  private requireOutboundRegistry(): OutboundRuntimeRegistry {
    if (this.outboundRegistry === undefined) {
      throw new ConfigError("outbound runtime registry is unavailable before Engine start");
    }
    return this.outboundRegistry;
  }

  private createOutbound(
    config: OutboundConfig,
    sourceConfig: SepigsConfig = this.config
  ): Outbound {
    return createOutboundFromRegistry(config, {
      limits: sourceConfig.limits,
      logger: this.logger.child(`outbound:${config.tag}`),
      dnsResolver: this.dnsResolver
    });
  }

  private createMetricsServer(config: SepigsConfig): PrometheusMetricsServer {
    return this.createMetricsServerFromConfig(config.observability.metrics);
  }

  private createMetricsServerFromConfig(config: MetricsServerConfig): PrometheusMetricsServer {
    return new PrometheusMetricsServer(
      config,
      () =>
        renderPrometheusMetrics({
          stats: this.stats.snapshot(),
          leaks: this.leakDetector.snapshot(),
          eventLoop: this.eventLoopMonitor.snapshot(),
          gc: this.gcMonitor.snapshot(),
          memory: process.memoryUsage(),
          ...(this.config.reload.mode === "transactional-experimental"
            ? {
                reload: this.reloadMetrics.snapshot(),
                routingGenerations: {
                  router: this.routingRuntime.active().router.sequence,
                  policy: this.routingRuntime.active().policy.sequence
                },
                dnsGenerations: this.dnsResolver.generationStore().metrics(),
                ...(this.outboundRegistry === undefined
                  ? {}
                  : { outboundGenerations: this.outboundRegistry.snapshot() })
              }
            : {})
        }),
      this.logger.child("metrics")
    );
  }

  private metricsText(): string {
    return renderPrometheusMetrics({
      stats: this.stats.snapshot(),
      leaks: this.leakDetector.snapshot(),
      eventLoop: this.eventLoopMonitor.snapshot(),
      gc: this.gcMonitor.snapshot(),
      memory: process.memoryUsage(),
      ...(this.config.reload.mode === "transactional-experimental"
        ? {
            reload: this.reloadMetrics.snapshot(),
            routingGenerations: {
              router: this.routingRuntime.active().router.sequence,
              policy: this.routingRuntime.active().policy.sequence
            },
            dnsGenerations: this.dnsResolver.generationStore().metrics(),
            ...(this.outboundRegistry === undefined
              ? {}
              : { outboundGenerations: this.outboundRegistry.snapshot() })
          }
        : {})
    });
  }

  private createDashboardServer(config: SepigsConfig): DashboardServer {
    return this.createDashboardServerFromConfig(config.dashboard);
  }

  private createDashboardServerFromConfig(config: DashboardConfig): DashboardServer {
    return new DashboardServer(
      config,
      {
        stats: () => this.stats.snapshot(),
        resources: () => this.resourceLimiter.snapshot(),
        leaks: () => this.leakDetector.snapshot(),
        connections: () => this.connectionManager.listActive(),
        closeConnection: (id) => this.connectionManager.closeConnection(id, "dashboard request"),
        metrics: () => this.metricsText(),
        outbounds: () => ({
          policies: this.routingRuntime.active().policyManager.getPolicySnapshots(),
          health: this.routingRuntime.active().policyManager.getHealthSnapshots()
        }),
        config: () => this.config,
        logs: () => this.logger.records(),
        reload: async () => {
          if (this.configReloader === undefined) {
            throw new ConfigError("dashboard reload is unavailable without a config file loader");
          }
          await this.configReloader();
        },
        recordRequest: (ok) => {
          this.stats.recordDashboardRequest(ok);
        }
      },
      this.logger.child("dashboard")
    );
  }
}
