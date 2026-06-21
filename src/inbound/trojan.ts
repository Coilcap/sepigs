import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import net from "node:net";
import type { AddressInfo } from "node:net";
import tls from "node:tls";
import type { TrojanInboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { decodeSocksAddress } from "../protocol/address.js";
import type { ProxyRequest } from "../protocol/types.js";
import { errorMessage, ProtocolError } from "../utils/errors.js";
import { closeSocket, pipeSockets } from "../utils/net.js";
import type { Inbound, InboundContext } from "./inbound.js";
import { socketSource } from "./inbound.js";

export class TrojanInbound implements Inbound {
  public readonly type = "trojan" as const;
  public readonly tag: string;
  private server: net.Server | tls.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  private readonly expectedHash: Buffer;

  public constructor(private readonly config: TrojanInboundConfig, private readonly context: InboundContext, private readonly logger: Logger) {
    this.tag = config.tag;
    this.expectedHash = Buffer.from(createHash("sha224").update(config.password).digest("hex"), "ascii");
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) return;
    const accept = (socket: net.Socket): void => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); void this.handle(socket); };
    const server = this.config.tls.enabled ? tls.createServer({ cert: await readFile(this.config.tls.certPath ?? ""), key: await readFile(this.config.tls.keyPath ?? "") }, accept) : net.createServer(accept);
    this.server = server;
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(this.config.port, this.config.listen, () => { server.removeListener("error", reject); resolve(); }); });
    this.logger.info("trojan inbound listening", { tag: this.tag, listen: this.config.listen, port: boundPort(server), tls: this.config.tls.enabled });
  }

  public async stop(): Promise<void> { const server = this.server; this.server = undefined; for (const socket of this.sockets) closeSocket(socket); if (server !== undefined) await new Promise<void>((resolve) => server.close(() => { resolve(); })); }
  public async drain(): Promise<void> { const server = this.server; this.server = undefined; if (server !== undefined) server.close(); await Promise.resolve(); }
  public address(): AddressInfo | string | null { return this.server?.address() ?? null; }

  private async handle(client: net.Socket): Promise<void> {
    const source = socketSource(client);
    const connection = this.context.connectionManager.accept({ inboundTag: this.tag, protocol: "trojan", network: "tcp", ...(source === undefined ? {} : { source }), clientSocket: client, handshakeTimeoutMs: this.context.limits.handshakeTimeoutMs, idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs });
    if (connection === undefined) { closeSocket(client); return; }
    try {
      const handshake = await readTrojanHandshake(client, this.expectedHash, this.context.limits.handshakeTimeoutMs, this.config.maxHeaderBytes ?? this.context.limits.maxHeaderBytes);
      connection.setDestination(handshake.destination);
      const request: ProxyRequest = { id: connection.id, inboundTag: this.tag, protocol: "trojan", network: "tcp", destination: handshake.destination, ...(source === undefined ? {} : { source }), startedAt: Date.now() };
      const remote = (await this.context.openTcp(request)).socket;
      connection.attachRemoteSocket(remote); connection.markEstablished();
      if (handshake.remainder.byteLength > 0) { remote.write(handshake.remainder); connection.addUploadBytes(handshake.remainder.byteLength); }
      pipeSockets(client, remote, { connectionId: connection.id, idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs, logger: this.logger, onBytesClientToRemote: (bytes) => { connection.addUploadBytes(bytes); }, onBytesRemoteToClient: (bytes) => { connection.addDownloadBytes(bytes); }, onClose: (failed, reason) => { connection.close(failed, reason); } });
    } catch (error) { this.logger.debug("trojan inbound failed", { connectionId: connection.id, error: errorMessage(error) }); connection.close(true, "trojan inbound failure"); }
  }
}

const readTrojanHandshake = async (socket: net.Socket, expectedHash: Buffer, timeoutMs: number, maxBytes: number): Promise<{ destination: ReturnType<typeof decodeSocksAddress>["destination"]; remainder: Buffer }> => await new Promise((resolve, reject) => {
  const chunks: Buffer[] = []; let total = 0;
  const cleanup = (): void => { clearTimeout(timer); socket.removeListener("data", onData); socket.removeListener("error", onError); };
  const fail = (error: Error): void => { cleanup(); reject(error); };
  const onError = (error: Error): void => { fail(error); };
  const onData = (chunk: Buffer): void => {
    chunks.push(chunk); total += chunk.byteLength;
    if (total > maxBytes) { fail(new ProtocolError("Trojan request header exceeds limit")); return; }
    const data = Buffer.concat(chunks, total); const lineEnd = data.indexOf("\r\n");
    if (lineEnd < 0) return;
    const passwordHash = data.subarray(0, lineEnd);
    if (passwordHash.byteLength !== expectedHash.byteLength || !timingSafeEqual(passwordHash, expectedHash)) { fail(new ProtocolError("Trojan password authentication failed")); return; }
    const commandOffset = lineEnd + 2; const command = data[commandOffset];
    if (command === undefined) return;
    if (command !== 0x01) { fail(new ProtocolError(`Trojan command ${command} is unsupported`)); return; }
    try {
      const decoded = decodeSocksAddress(data, commandOffset + 1);
      if (data.byteLength < decoded.offset + 2) return;
      if (data[decoded.offset] !== 0x0d || data[decoded.offset + 1] !== 0x0a) { fail(new ProtocolError("Trojan request terminator is invalid")); return; }
      cleanup(); socket.pause(); resolve({ destination: decoded.destination, remainder: data.subarray(decoded.offset + 2) });
    } catch (error) { if (error instanceof ProtocolError && error.message.startsWith("truncated")) return; fail(error instanceof Error ? error : new Error(String(error))); }
  };
  const timer = setTimeout(() => { fail(new ProtocolError("Trojan handshake timeout")); }, timeoutMs); timer.unref();
  socket.on("data", onData); socket.once("error", onError);
});
const boundPort = (server: net.Server | tls.Server): number => { const address = server.address(); return typeof address === "object" && address !== null ? address.port : 0; };
