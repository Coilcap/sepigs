import type { ExtensionType, PluginOutboundConfig } from "../../config/types.js";
import type { OutboundFactoryContext } from "../../outbound/registry.js";
import type { Outbound } from "../../outbound/outbound.js";
import type { ProxyRequest, TcpOutboundConnection } from "../../protocol/types.js";
import { connectTcp } from "../../utils/net.js";
import { OutboundBlockedError } from "../../utils/errors.js";
import type { PluginRunner } from "../types.js";
import { RemotePluginRpcClient } from "./client.js";
import { serializeProxyRequest } from "./protocol.js";

export const createRemoteOutboundFactory = (
  type: ExtensionType,
  runner: PluginRunner,
  timeoutMs: number
): ((config: PluginOutboundConfig, context: OutboundFactoryContext) => Outbound) => {
  return (config, context) => new RemoteRpcOutbound(type, config, context, runner, timeoutMs);
};

class RemoteRpcOutbound implements Outbound {
  public readonly tag: string;
  public readonly type: ExtensionType;
  private readonly config: PluginOutboundConfig;
  private readonly context: OutboundFactoryContext;
  private readonly rpc: RemotePluginRpcClient;

  public constructor(type: ExtensionType, config: PluginOutboundConfig, context: OutboundFactoryContext, runner: PluginRunner, timeoutMs: number) {
    this.tag = config.tag;
    this.type = type;
    this.config = config;
    this.context = context;
    this.rpc = new RemotePluginRpcClient(runner, timeoutMs);
  }

  public async connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    const decision = await this.rpc.connect({
      rpcVersion: 1,
      kind: "outbound.connect",
      outboundType: this.type,
      request: serializeProxyRequest(request)
    });
    if (decision.action === "block") {
      throw new OutboundBlockedError(decision.reason ?? `blocked by remote plugin outbound ${this.type}`);
    }
    const host = await this.context.dnsResolver.resolve(request.destination.host);
    const timeoutMs = this.config.connectTimeoutMs ?? this.context.limits.connectTimeoutMs;
    const socket = await connectTcp(host, request.destination.port, timeoutMs, this.context.logger);
    return { socket, outboundTag: this.tag };
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}
