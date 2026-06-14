import dgram from "node:dgram";
import type { LimitConfig, ShadowsocksOutboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { decodeSocksAddress, encodeSocksAddress } from "../protocol/address.js";
import {
  createShadowsocksCryptoContext,
  decryptUdpPacket,
  encryptUdpPacket,
  ShadowsocksTcpStream
} from "../protocol/shadowsocks.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import { connectTcp } from "../utils/net.js";
import type { Outbound } from "./outbound.js";

export class ShadowsocksOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "shadowsocks" as const;
  private readonly config: ShadowsocksOutboundConfig;
  private readonly limits: LimitConfig;
  private readonly logger: Logger;
  private readonly cryptoContext;

  public constructor(config: ShadowsocksOutboundConfig, limits: LimitConfig, logger: Logger) {
    this.tag = config.tag;
    this.config = config;
    this.limits = limits;
    this.logger = logger;
    this.cryptoContext = createShadowsocksCryptoContext(config.method, config.password);
  }

  public async connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    const timeoutMs = this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs;
    const rawSocket = await connectTcp(this.config.serverHost, this.config.serverPort, timeoutMs, this.logger);
    const stream = new ShadowsocksTcpStream(rawSocket, this.cryptoContext, encodeSocksAddress(request.destination));
    return { socket: stream, outboundTag: this.tag };
  }

  public async sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    const packet = encryptUdpPacket(Buffer.concat([encodeSocksAddress(request.destination), payload]), this.cryptoContext);
    const response = await this.sendUdpToServer(packet, this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs);
    const decrypted = decryptUdpPacket(response, this.cryptoContext);
    const decoded = decodeSocksAddress(decrypted, 0);
    return {
      source: decoded.destination,
      payload: decrypted.subarray(decoded.offset)
    };
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }

  private async sendUdpToServer(packet: Buffer, timeoutMs: number): Promise<Buffer> {
    const socket = dgram.createSocket("udp4");
    return await new Promise<Buffer>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.removeListener("message", onMessage);
        socket.removeListener("error", onError);
        socket.close();
      };

      const onMessage = (message: Buffer): void => {
        cleanup();
        resolve(message);
      };

      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`shadowsocks UDP timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("message", onMessage);
      socket.once("error", onError);
      socket.send(packet, this.config.serverPort, this.config.serverHost, (error) => {
        if (error !== null) {
          onError(error);
        }
      });
    });
  }
}
