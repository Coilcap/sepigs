import net from "node:net";
import type { AddressInfo } from "node:net";
import type { ShadowsocksInboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { decodeSocksAddress } from "../protocol/address.js";
import { createShadowsocksCryptoContext, createShadowsocksServerStream } from "../protocol/shadowsocks.js";
import type { ProxyRequest, TcpStream } from "../protocol/types.js";
import { errorMessage, ProtocolError } from "../utils/errors.js";
import { closeSocket, pipeSockets } from "../utils/net.js";
import type { Inbound, InboundContext } from "./inbound.js";
import { socketSource } from "./inbound.js";

export class ShadowsocksInbound implements Inbound {
  public readonly type = "shadowsocks" as const;
  public readonly tag: string;
  private server: net.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  private readonly crypto;

  public constructor(private readonly config: ShadowsocksInboundConfig, private readonly context: InboundContext, private readonly logger: Logger) {
    this.tag = config.tag;
    this.crypto = createShadowsocksCryptoContext(config.method, config.password);
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) return;
    const server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
      void this.handle(socket);
    });
    this.server = server;
    await listen(server, this.config.port, this.config.listen);
    this.logger.info("shadowsocks inbound listening", { tag: this.tag, listen: this.config.listen, port: boundPort(server) });
  }

  public async stop(): Promise<void> {
    const server = this.server; this.server = undefined;
    for (const socket of this.sockets) closeSocket(socket);
    if (server !== undefined) await closeServer(server);
  }

  public async drain(): Promise<void> { const server = this.server; this.server = undefined; if (server !== undefined) server.close(); await Promise.resolve(); }
  public address(): AddressInfo | string | null { return this.server?.address() ?? null; }

  private async handle(raw: net.Socket): Promise<void> {
    const source = socketSource(raw);
    const connection = this.context.connectionManager.accept({ inboundTag: this.tag, protocol: "shadowsocks", network: "tcp", ...(source === undefined ? {} : { source }), clientSocket: raw, handshakeTimeoutMs: this.context.limits.handshakeTimeoutMs, idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs });
    if (connection === undefined) { closeSocket(raw); return; }
    const stream = createShadowsocksServerStream(raw, this.crypto);
    try {
      const first = await readAddress(stream, this.context.limits.handshakeTimeoutMs, this.config.maxHeaderBytes ?? this.context.limits.maxHeaderBytes);
      connection.setDestination(first.destination);
      const request: ProxyRequest = { id: connection.id, inboundTag: this.tag, protocol: "shadowsocks", network: "tcp", destination: first.destination, ...(source === undefined ? {} : { source }), startedAt: Date.now() };
      const remote = (await this.context.openTcp(request)).socket;
      connection.attachRemoteSocket(remote);
      connection.markEstablished();
      if (first.remainder.byteLength > 0) { remote.write(first.remainder); connection.addUploadBytes(first.remainder.byteLength); }
      pipeSockets(stream, remote, { connectionId: connection.id, idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs, logger: this.logger, onBytesClientToRemote: (bytes) => { connection.addUploadBytes(bytes); }, onBytesRemoteToClient: (bytes) => { connection.addDownloadBytes(bytes); }, onClose: (failed, reason) => { connection.close(failed, reason); } });
    } catch (error) {
      this.logger.debug("shadowsocks inbound failed", { connectionId: connection.id, error: errorMessage(error) });
      connection.close(true, "shadowsocks inbound failure");
    }
  }
}

const readAddress = async (stream: TcpStream, timeoutMs: number, maxBytes: number): Promise<{ destination: ReturnType<typeof decodeSocksAddress>["destination"]; remainder: Buffer }> => await new Promise((resolve, reject) => {
  const chunks: Buffer[] = []; let total = 0;
  const cleanup = (): void => { clearTimeout(timer); stream.removeListener("data", onData); stream.removeListener("error", onError); };
  const onError = (error: Error): void => { cleanup(); reject(error); };
  const onData = (chunk: Buffer): void => {
    chunks.push(chunk); total += chunk.byteLength;
    if (total > maxBytes) { cleanup(); reject(new ProtocolError("Shadowsocks request header exceeds limit")); return; }
    const data = Buffer.concat(chunks, total);
    try { const decoded = decodeSocksAddress(data, 0); cleanup(); stream.pause(); resolve({ destination: decoded.destination, remainder: data.subarray(decoded.offset) }); }
    catch (error) { if (error instanceof ProtocolError && error.message.startsWith("truncated")) return; cleanup(); reject(error instanceof Error ? error : new Error(String(error))); }
  };
  const timer = setTimeout(() => { cleanup(); reject(new ProtocolError("Shadowsocks handshake timeout")); }, timeoutMs); timer.unref();
  stream.on("data", onData); stream.once("error", onError);
});

const listen = async (server: net.Server, port: number, host: string): Promise<void> => { await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.removeListener("error", reject); resolve(); }); }); };
const closeServer = async (server: net.Server): Promise<void> => { await new Promise<void>((resolve) => server.close(() => { resolve(); })); };
const boundPort = (server: net.Server): number => { const address = server.address(); return typeof address === "object" && address !== null ? address.port : 0; };
