import net from "node:net";
import type { AddressInfo } from "node:net";
import type { HttpInboundConfig } from "../config/types.js";
import type { ManagedConnection } from "../core/connectionManager.js";
import type { Logger } from "../logger/logger.js";
import type { Destination, ProxyRequest, TcpStream } from "../protocol/types.js";
import { errorCode, errorMessage, ProtocolError } from "../utils/errors.js";
import { BufferedSocketReader, closeSocket, makeDestination, pipeSockets, writeSocket } from "../utils/net.js";
import type { Inbound, InboundContext } from "./inbound.js";
import { socketSource } from "./inbound.js";

interface ParsedHttpRequest {
  readonly method: string;
  readonly target: string;
  readonly version: string;
  readonly headers: readonly string[];
  readonly bodyRemainder: Buffer;
}

interface ForwardHttpRequest {
  readonly destination: Destination;
  readonly initialData: Buffer;
}

export class HttpInbound implements Inbound {
  public readonly tag: string;
  public readonly type = "http" as const;
  private readonly config: HttpInboundConfig;
  private readonly context: InboundContext;
  private readonly logger: Logger;
  private readonly sockets = new Set<net.Socket>();
  private server: net.Server | undefined;

  public constructor(config: HttpInboundConfig, context: InboundContext, logger: Logger) {
    this.tag = config.tag;
    this.config = config;
    this.context = context;
    this.logger = logger;
  }

  public async start(): Promise<void> {
    if (this.server !== undefined) {
      return;
    }

    const server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
      void this.handleConnection(socket);
    });

    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.config.port, this.config.listen);
    });

    this.logger.info("http inbound listening", { tag: this.tag, listen: this.config.listen, port: this.boundPort() });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
      for (const socket of this.sockets) {
        closeSocket(socket);
      }
    });
  }

  public address(): AddressInfo | string | null {
    return this.server?.address() ?? null;
  }

  private boundPort(): number {
    const address = this.address();
    if (typeof address === "object" && address !== null) {
      return address.port;
    }
    return this.config.port;
  }

  private async handleConnection(client: net.Socket): Promise<void> {
    const source = socketSource(client);
    const connection = this.context.connectionManager.accept({
      inboundTag: this.tag,
      protocol: "http",
      network: "tcp",
      ...(source === undefined ? {} : { source }),
      clientSocket: client,
      handshakeTimeoutMs: this.context.limits.handshakeTimeoutMs,
      idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs
    });

    if (connection === undefined) {
      await sendHttpError(client, 503, "connection limit reached", this.logger);
      closeSocket(client);
      return;
    }

    try {
      client.setNoDelay(true);
      const timeoutMs = this.context.limits.handshakeTimeoutMs;
      const maxHeaderBytes = this.config.maxHeaderBytes ?? this.context.limits.maxHeaderBytes;
      const reader = new BufferedSocketReader(client, timeoutMs, maxHeaderBytes);
      const raw = await reader.readUntil((buffer) => buffer.indexOf("\r\n\r\n") >= 0);
      const parsed = parseHttpRequest(raw);

      if (parsed.method.toUpperCase() === "CONNECT") {
        await this.handleConnect(connection, client, parsed, reader.releaseRemainder());
        return;
      }

      await this.handleForwardRequest(connection, client, parsed);
    } catch (error) {
      this.logger.debug("http inbound connection failed", { connectionId: connection.id, error: errorMessage(error) });
      if (!client.destroyed) {
        await sendHttpError(client, errorCode(error) === "OUTBOUND_BLOCKED" ? 403 : 400, errorMessage(error), this.logger);
      }
      connection.close(true, "http inbound failure");
    }
  }

  private async handleConnect(
    connection: ManagedConnection,
    client: net.Socket,
    parsed: ParsedHttpRequest,
    extraData: Buffer
  ): Promise<void> {
    const destination = parseAuthority(parsed.target, 443);
    connection.setDestination(destination);
    const request = this.createRequest(connection.id, destination, client);
    let remote: TcpStream;

    try {
      remote = (await this.context.openTcp(request)).socket;
    } catch (error) {
      const status = errorCode(error) === "OUTBOUND_BLOCKED" ? 403 : 502;
      await sendHttpError(client, status, errorMessage(error), this.logger);
      connection.close(true, "http outbound connect failed");
      return;
    }

    connection.attachRemoteSocket(remote);
    await writeSocket(client, "HTTP/1.1 200 Connection Established\r\n\r\n");
    connection.markEstablished();
    if (extraData.byteLength > 0) {
      remote.write(extraData);
      connection.addUploadBytes(extraData.byteLength);
    }
    this.pipe(connection, client, remote);
  }

  private async handleForwardRequest(
    connection: ManagedConnection,
    client: net.Socket,
    parsed: ParsedHttpRequest
  ): Promise<void> {
    const forward = buildForwardHttpRequest(parsed);
    connection.setDestination(forward.destination);
    const request = this.createRequest(connection.id, forward.destination, client);
    let remote: TcpStream;

    try {
      remote = (await this.context.openTcp(request)).socket;
    } catch (error) {
      const status = errorCode(error) === "OUTBOUND_BLOCKED" ? 403 : 502;
      await sendHttpError(client, status, errorMessage(error), this.logger);
      connection.close(true, "http outbound connect failed");
      return;
    }

    connection.attachRemoteSocket(remote);
    remote.write(forward.initialData);
    connection.addUploadBytes(forward.initialData.byteLength);
    connection.markEstablished();
    this.pipe(connection, client, remote);
  }

  private createRequest(connectionId: string, destination: Destination, client: net.Socket): ProxyRequest {
    const source = socketSource(client);
    return {
      id: connectionId,
      inboundTag: this.tag,
      protocol: "http",
      network: "tcp",
      destination,
      ...(source === undefined ? {} : { source }),
      startedAt: Date.now()
    };
  }

  private pipe(connection: ManagedConnection, client: TcpStream, remote: TcpStream): void {
    const idleTimeoutMs = this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs;
    pipeSockets(client, remote, {
      connectionId: connection.id,
      idleTimeoutMs,
      logger: this.logger,
      onBytesClientToRemote: (bytes) => {
        connection.addUploadBytes(bytes);
      },
      onBytesRemoteToClient: (bytes) => {
        connection.addDownloadBytes(bytes);
      },
      onClose: (failed, reason) => {
        connection.close(failed, reason);
      }
    });
  }
}

const parseHttpRequest = (buffer: Buffer): ParsedHttpRequest => {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    throw new ProtocolError("missing HTTP header terminator");
  }

  const headerText = buffer.subarray(0, headerEnd).toString("latin1");
  const lines = headerText.split("\r\n");
  const requestLine = lines[0];
  if (requestLine === undefined) {
    throw new ProtocolError("missing HTTP request line");
  }

  const [method, target, version] = requestLine.split(" ");
  if (method === undefined || target === undefined || version === undefined || !version.startsWith("HTTP/")) {
    throw new ProtocolError("invalid HTTP request line");
  }

  return {
    method,
    target,
    version,
    headers: lines.slice(1),
    bodyRemainder: buffer.subarray(headerEnd + 4)
  };
};

const parseAuthority = (authority: string, defaultPort: number): Destination => {
  const trimmed = authority.trim();
  if (trimmed.length === 0) {
    throw new ProtocolError("empty authority");
  }

  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    if (closing < 0) {
      throw new ProtocolError(`invalid authority "${authority}"`);
    }
    const host = trimmed.slice(1, closing);
    const rest = trimmed.slice(closing + 1);
    const port = rest.startsWith(":") ? Number(rest.slice(1)) : defaultPort;
    return makeDestination(host, validatePort(port, authority));
  }

  const lastColon = trimmed.lastIndexOf(":");
  const firstColon = trimmed.indexOf(":");
  if (lastColon > 0 && lastColon === firstColon) {
    const host = trimmed.slice(0, lastColon);
    const port = Number(trimmed.slice(lastColon + 1));
    return makeDestination(host, validatePort(port, authority));
  }

  return makeDestination(trimmed, defaultPort);
};

const validatePort = (port: number, source: string): number => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ProtocolError(`invalid port in "${source}"`);
  }
  return port;
};

const findHeader = (headers: readonly string[], name: string): string | undefined => {
  const prefix = `${name.toLowerCase()}:`;
  return headers.find((header) => header.toLowerCase().startsWith(prefix));
};

const buildForwardHttpRequest = (parsed: ParsedHttpRequest): ForwardHttpRequest => {
  let destination: Destination;
  let path: string;
  let hostHeaderNeeded = false;

  if (/^https?:\/\//iu.test(parsed.target)) {
    const url = new URL(parsed.target);
    if (url.protocol !== "http:") {
      throw new ProtocolError(`unsupported HTTP proxy URL protocol "${url.protocol}"`);
    }
    destination = makeDestination(url.hostname, url.port.length > 0 ? validatePort(Number(url.port), parsed.target) : 80);
    path = `${url.pathname}${url.search}`;
    hostHeaderNeeded = findHeader(parsed.headers, "host") === undefined;
  } else {
    const hostHeader = findHeader(parsed.headers, "host");
    if (hostHeader === undefined) {
      throw new ProtocolError("origin-form HTTP request requires Host header");
    }
    const authority = hostHeader.slice(hostHeader.indexOf(":") + 1).trim();
    destination = parseAuthority(authority, 80);
    path = parsed.target;
  }

  const filteredHeaders = parsed.headers.filter((header) => {
    const lower = header.toLowerCase();
    return !lower.startsWith("proxy-connection:") && !lower.startsWith("proxy-authorization:");
  });
  const hostHeader = hostHeaderNeeded ? [`Host: ${destination.host}:${destination.port}`] : [];
  const head = `${parsed.method} ${path} ${parsed.version}\r\n${[...hostHeader, ...filteredHeaders].join("\r\n")}\r\n\r\n`;
  return {
    destination,
    initialData: Buffer.concat([Buffer.from(head, "latin1"), parsed.bodyRemainder])
  };
};

const sendHttpError = async (socket: net.Socket, status: number, message: string, logger: Logger): Promise<void> => {
  const reason = status === 403 ? "Forbidden" : status === 502 ? "Bad Gateway" : status === 503 ? "Service Unavailable" : "Bad Request";
  const body = `${reason}: ${message}\n`;
  const response = `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  try {
    await writeSocket(socket, response);
  } catch (error) {
    logger.debug("failed to write HTTP error", { error: errorMessage(error) });
  }
};
