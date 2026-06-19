import type { PluginRunner } from "../types.js";
import { TimeoutError } from "../../utils/errors.js";
import { assertJsonSafe } from "./serializer.js";
import { isRemoteOutboundDecision, type RemoteOutboundDecision, type RpcRequestEnvelope } from "./protocol.js";

export class RemotePluginRpcClient {
  private readonly runner: PluginRunner;
  private readonly timeoutMs: number;

  public constructor(runner: PluginRunner, timeoutMs: number) {
    this.runner = runner;
    this.timeoutMs = timeoutMs;
  }

  public async connect(envelope: RpcRequestEnvelope): Promise<RemoteOutboundDecision> {
    assertJsonSafe(envelope);
    const response = await this.withTimeout(this.runner.invoke(envelope), envelope.outboundType);
    if (!isRemoteOutboundDecision(response)) {
      throw new Error(`remote plugin "${this.runner.tag}" returned an invalid outbound decision`);
    }
    return response;
  }

  private async withTimeout<T>(promise: Promise<T>, outboundType: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new TimeoutError(`remote plugin "${this.runner.tag}" outbound "${outboundType}" timed out after ${this.timeoutMs}ms`));
          }, this.timeoutMs);
          timer.unref();
        })
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
