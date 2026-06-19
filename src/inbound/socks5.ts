import { timingSafeEqual } from "node:crypto";
import dgram from "node:dgram";
import net from "node:net";
import type { AddressInfo } from "node:net";
import type { Socks5AuthConfig, Socks5InboundConfig } from "../config/types.js";
import type { ManagedConnection } from "../core/connectionManager.js";
import type { Logger } from "../logger/logger.js";
import type { Destination, ProxyRequest, SourceAddress, TcpStream } from "../protocol/types.js";
import { errorMessage, ProtocolError } from "../utils/errors.js";
import { BufferedSocketReader, closeSocket, makeDestination, pipeSockets, writeSocket } from "../utils/net.js";
import type { Inbound, InboundContext } from "./inbound.js";
import { socketSource } from "./inbound.js";

const SOCKS_VERSION = 0x05;
const METHOD_NO_AUTH = 0x00;
const METHOD_USERNAME_PASSWORD = 0x02;
const METHOD_NO_ACCEPTABLE = 0xff;
const COMMAND_CONNECT = 0x01;
const COMMAND_UDP_ASSOCIATE = 0x03;
const REPLY_SUCCEEDED = 0x00;
const REPLY_COMMAND_NOT_SUPPORTED = 0x07;
const REPLY_GENERAL_FAILURE = 0x01;

export class Socks5Inbound implements Inbound {
  public readonly tag: string;
  public readonly type = "socks5" as const;
  private readonly config: Socks5InboundConfig;
  private readonly context: InboundContext;
  private readonly logger: Logger;
  private readonly sockets = new Set<net.Socket>();
  private server: net.Server | undefined;

  public constructor(config: Socks5InboundConfig, context: InboundContext, logger: Logger) {
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

    this.logger.info("socks5 inbound listening", { tag: this.tag, listen: this.config.listen, port: this.boundPort() });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      try {
        server.close((error?: Error) => {
          if (error !== undefined) {
            if (isServerNotRunningError(error)) {
              resolve();
              return;
            }
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        if (isServerNotRunningError(error)) {
          resolve();
          return;
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      }
      for (const socket of this.sockets) {
        closeSocket(socket);
      }
    });
  }

  public async drain(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    this.server = undefined;
    try {
      server.close((error?: Error) => {
        if (error !== undefined) {
          this.logger.debug("socks5 inbound drain close callback failed", { tag: this.tag, error: error.message });
        }
      });
    } catch (error) {
      if (!isServerNotRunningError(error)) {
        this.logger.debug("socks5 inbound drain failed", { tag: this.tag, error: errorMessage(error) });
      }
    }
    await Promise.resolve();
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
      protocol: "socks5",
      network: "tcp",
      ...(source === undefined ? {} : { source }),
      clientSocket: client,
      handshakeTimeoutMs: this.context.limits.handshakeTimeoutMs,
      idleTimeoutMs: this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs
    });

    if (connection === undefined) {
      closeSocket(client);
      return;
    }

    try {
      client.setNoDelay(true);
      const timeoutMs = this.context.limits.handshakeTimeoutMs;
      const maxHeaderBytes = this.config.maxHeaderBytes ?? this.context.limits.maxHeaderBytes;
      const reader = new BufferedSocketReader(client, timeoutMs, maxHeaderBytes);

      await negotiateAuth(reader, client, this.config.auth);
      const command = await readCommand(reader);

      if (command.command === COMMAND_UDP_ASSOCIATE) {
        if (this.config.udpAssociate !== true) {
          await writeSocket(client, createReply(REPLY_COMMAND_NOT_SUPPORTED));
          throw new ProtocolError("SOCKS5 UDP ASSOCIATE is disabled for this inbound");
        }
        connection.setDestination(command.destination);
        await this.handleUdpAssociate(connection, client);
        return;
      }
      if (command.command !== COMMAND_CONNECT) {
        await writeSocket(client, createReply(REPLY_COMMAND_NOT_SUPPORTED));
        throw new ProtocolError(`SOCKS5 command ${command.command} is not supported`);
      }

      connection.setDestination(command.destination);
      const request = this.createRequest(connection.id, command.destination, client);
      let remote: TcpStream;
      try {
        remote = (await this.context.openTcp(request)).socket;
      } catch (error) {
        this.logger.debug("socks5 outbound connect failed", { connectionId: connection.id, error: errorMessage(error) });
        await writeSocket(client, createReply(REPLY_GENERAL_FAILURE));
        connection.close(true, "socks5 outbound connect failed");
        return;
      }

      connection.attachRemoteSocket(remote);
      await writeSocket(client, createReply(REPLY_SUCCEEDED));
      connection.markEstablished();
      const extraData = reader.releaseRemainder();
      if (extraData.byteLength > 0) {
        remote.write(extraData);
        connection.addUploadBytes(extraData.byteLength);
      }
      this.pipe(connection, client, remote);
    } catch (error) {
      this.logger.debug("socks5 inbound connection failed", { connectionId: connection.id, error: errorMessage(error) });
      connection.close(true, "socks5 inbound failure");
    }
  }

  private createRequest(connectionId: string, destination: Destination, client: net.Socket): ProxyRequest {
    const source = socketSource(client);
    return {
      id: connectionId,
      inboundTag: this.tag,
      protocol: "socks5",
      network: "tcp",
      destination,
      ...(source === undefined ? {} : { source }),
      startedAt: Date.now()
    };
  }

  private createUdpRequest(connectionId: string, destination: Destination, source: SourceAddress): ProxyRequest {
    return {
      id: connectionId,
      inboundTag: this.tag,
      protocol: "socks5",
      network: "udp",
      destination,
      source,
      startedAt: Date.now()
    };
  }

  private async handleUdpAssociate(connection: ManagedConnection, client: net.Socket): Promise<void> {
    const udpServer = dgram.createSocket(net.isIP(this.config.listen) === 6 ? "udp6" : "udp4");
    let closed = false;

    const closeUdpServer = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      udpServer.removeAllListeners("message");
      udpServer.removeAllListeners("error");
      udpServer.close();
    };

    udpServer.on("message", (message, rinfo) => {
      connection.touch();
      void this.handleUdpDatagram(connection.id, udpServer, message, rinfo);
    });
    udpServer.on("error", (error) => {
      this.logger.debug("socks5 udp relay error", { connectionId: connection.id, error: error.message });
    });

    try {
      await bindUdp(udpServer, this.config.listen);
      const address = udpServer.address();
      if (typeof address === "string") {
        throw new ProtocolError("SOCKS5 UDP relay unexpectedly bound to a pipe address");
      }

      await writeSocket(client, createReply(REPLY_SUCCEEDED, makeDestination(address.address, address.port)));
      connection.markEstablished();
      await waitForControlSocketClose(client, this.config.idleTimeoutMs ?? this.context.limits.idleTimeoutMs);
      closeUdpServer();
      connection.close(false, "socks5 udp control closed");
    } catch (error) {
      this.logger.debug("socks5 udp associate failed", { connectionId: connection.id, error: errorMessage(error) });
      closeUdpServer();
      connection.close(true, "socks5 udp associate failed");
    }
  }

  private async handleUdpDatagram(
    connectionId: string,
    udpServer: dgram.Socket,
    message: Buffer,
    rinfo: dgram.RemoteInfo
  ): Promise<void> {
    try {
      const packet = parseSocksUdpPacket(message);
      const source: SourceAddress = {
        host: rinfo.address,
        port: rinfo.port
      };
      const request = this.createUdpRequest(connectionId, packet.destination, source);
      this.context.stats.addUdpClientToRemoteBytes(packet.payload.byteLength);

      const response = await this.context.sendUdp(request, packet.payload);
      if (response === undefined) {
        return;
      }

      const responsePacket = encodeSocksUdpPacket(response.source, response.payload);
      udpServer.send(responsePacket, rinfo.port, rinfo.address, (error) => {
        if (error !== null) {
          this.logger.debug("failed to send socks5 udp response", { connectionId, error: error.message });
        }
      });
      this.context.stats.addUdpRemoteToClientBytes(response.payload.byteLength);
    } catch (error) {
      this.logger.debug("socks5 udp packet dropped", { connectionId, error: errorMessage(error) });
    }
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

interface Socks5Command {
  readonly command: number;
  readonly destination: Destination;
}

const negotiateAuth = async (reader: BufferedSocketReader, client: net.Socket, auth: Socks5AuthConfig | undefined): Promise<void> => {
  const head = await reader.readExact(2);
  const version = head[0];
  const methodCount = head[1];

  if (version !== SOCKS_VERSION || methodCount === undefined) {
    throw new ProtocolError("invalid SOCKS5 greeting");
  }

  const methods = await reader.readExact(methodCount);
  if (auth !== undefined && auth.enabled) {
    if (!methods.includes(METHOD_USERNAME_PASSWORD)) {
      await writeSocket(client, Buffer.from([SOCKS_VERSION, METHOD_NO_ACCEPTABLE]));
      throw new ProtocolError("SOCKS5 client does not support username/password auth");
    }
    await writeSocket(client, Buffer.from([SOCKS_VERSION, METHOD_USERNAME_PASSWORD]));
    await authenticateUserPass(reader, client, auth);
    return;
  }

  if (!methods.includes(METHOD_NO_AUTH)) {
    await writeSocket(client, Buffer.from([SOCKS_VERSION, METHOD_NO_ACCEPTABLE]));
    throw new ProtocolError("SOCKS5 client does not support no-auth");
  }

  await writeSocket(client, Buffer.from([SOCKS_VERSION, METHOD_NO_AUTH]));
};

const authenticateUserPass = async (reader: BufferedSocketReader, client: net.Socket, auth: Socks5AuthConfig): Promise<void> => {
  const versionBuffer = await reader.readExact(2);
  const version = versionBuffer[0];
  const usernameLength = versionBuffer[1];
  if (version !== 0x01 || usernameLength === undefined) {
    throw new ProtocolError("invalid SOCKS5 username/password auth packet");
  }
  const username = (await reader.readExact(usernameLength)).toString("utf8");
  const passwordLengthBuffer = await reader.readExact(1);
  const passwordLength = passwordLengthBuffer[0];
  if (passwordLength === undefined) {
    throw new ProtocolError("invalid SOCKS5 password length");
  }
  const password = (await reader.readExact(passwordLength)).toString("utf8");
  if (!safeEqual(username, auth.username) || !safeEqual(password, auth.password)) {
    await writeSocket(client, Buffer.from([0x01, 0x01]));
    throw new ProtocolError("SOCKS5 username/password auth failed");
  }
  await writeSocket(client, Buffer.from([0x01, 0x00]));
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const isServerNotRunningError = (error: unknown): boolean => {
  return error instanceof Error && "code" in error && error.code === "ERR_SERVER_NOT_RUNNING";
};

const readCommand = async (reader: BufferedSocketReader): Promise<Socks5Command> => {
  const head = await reader.readExact(4);
  const version = head[0];
  const command = head[1];
  const reserved = head[2];
  const addressType = head[3];

  if (version !== SOCKS_VERSION || command === undefined || reserved !== 0x00 || addressType === undefined) {
    throw new ProtocolError("invalid SOCKS5 request header");
  }

  const host = await readSocksAddress(reader, addressType);
  const portBuffer = await reader.readExact(2);
  const high = portBuffer[0];
  const low = portBuffer[1];
  if (high === undefined || low === undefined) {
    throw new ProtocolError("invalid SOCKS5 port");
  }
  const port = (high << 8) + low;

  return {
    command,
    destination: makeDestination(host, port)
  };
};

const readSocksAddress = async (reader: BufferedSocketReader, addressType: number): Promise<string> => {
  if (addressType === 0x01) {
    const bytes = await reader.readExact(4);
    return Array.from(bytes).join(".");
  }

  if (addressType === 0x03) {
    const lengthBuffer = await reader.readExact(1);
    const length = lengthBuffer[0];
    if (length === undefined || length === 0) {
      throw new ProtocolError("invalid SOCKS5 domain length");
    }
    return (await reader.readExact(length)).toString("utf8");
  }

  if (addressType === 0x04) {
    const bytes = await reader.readExact(16);
    const groups: string[] = [];
    for (let index = 0; index < bytes.length; index += 2) {
      const high = bytes[index] ?? 0;
      const low = bytes[index + 1] ?? 0;
      groups.push(((high << 8) + low).toString(16));
    }
    return groups.join(":");
  }

  throw new ProtocolError(`unsupported SOCKS5 address type ${addressType}`);
};

interface SocksUdpPacket {
  readonly destination: Destination;
  readonly payload: Buffer;
}

const parseSocksUdpPacket = (message: Buffer): SocksUdpPacket => {
  if (message.byteLength < 10) {
    throw new ProtocolError("SOCKS5 UDP packet is too short");
  }
  if (message[0] !== 0x00 || message[1] !== 0x00) {
    throw new ProtocolError("SOCKS5 UDP packet has invalid reserved bytes");
  }
  if (message[2] !== 0x00) {
    throw new ProtocolError("SOCKS5 UDP fragmentation is not supported");
  }

  const addressType = message[3];
  if (addressType === undefined) {
    throw new ProtocolError("SOCKS5 UDP packet missing address type");
  }

  const parsed = readSocksAddressFromBuffer(message, 4, addressType);
  const high = message[parsed.offset];
  const low = message[parsed.offset + 1];
  if (high === undefined || low === undefined) {
    throw new ProtocolError("SOCKS5 UDP packet missing destination port");
  }
  const port = (high << 8) + low;
  const payloadOffset = parsed.offset + 2;
  if (payloadOffset > message.byteLength) {
    throw new ProtocolError("SOCKS5 UDP packet missing payload");
  }

  return {
    destination: makeDestination(parsed.host, port),
    payload: message.subarray(payloadOffset)
  };
};

const readSocksAddressFromBuffer = (
  buffer: Buffer,
  offset: number,
  addressType: number
): { readonly host: string; readonly offset: number } => {
  if (addressType === 0x01) {
    const end = offset + 4;
    if (end > buffer.byteLength) {
      throw new ProtocolError("SOCKS5 UDP IPv4 address is truncated");
    }
    return {
      host: Array.from(buffer.subarray(offset, end)).join("."),
      offset: end
    };
  }

  if (addressType === 0x03) {
    const length = buffer[offset];
    if (length === undefined || length === 0) {
      throw new ProtocolError("SOCKS5 UDP domain length is invalid");
    }
    const start = offset + 1;
    const end = start + length;
    if (end > buffer.byteLength) {
      throw new ProtocolError("SOCKS5 UDP domain is truncated");
    }
    return {
      host: buffer.subarray(start, end).toString("utf8"),
      offset: end
    };
  }

  if (addressType === 0x04) {
    const end = offset + 16;
    if (end > buffer.byteLength) {
      throw new ProtocolError("SOCKS5 UDP IPv6 address is truncated");
    }
    const groups: string[] = [];
    for (let index = offset; index < end; index += 2) {
      const high = buffer[index] ?? 0;
      const low = buffer[index + 1] ?? 0;
      groups.push(((high << 8) + low).toString(16));
    }
    return {
      host: groups.join(":"),
      offset: end
    };
  }

  throw new ProtocolError(`unsupported SOCKS5 UDP address type ${addressType}`);
};

const encodeSocksUdpPacket = (source: Destination, payload: Buffer): Buffer => {
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00]), encodeSocksAddress(source), payload]);
};

const createReply = (replyCode: number, bound?: Destination): Buffer => {
  return Buffer.concat([Buffer.from([SOCKS_VERSION, replyCode, 0x00]), encodeSocksAddress(bound ?? makeDestination("0.0.0.0", 0))]);
};

const encodeSocksAddress = (destination: Destination): Buffer => {
  if (destination.addressType === "ipv4") {
    const bytes = destination.host.split(".").map((part) => Number(part));
    if (bytes.length !== 4 || bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      throw new ProtocolError(`invalid IPv4 address "${destination.host}"`);
    }
    return Buffer.from([0x01, ...bytes, (destination.port >> 8) & 0xff, destination.port & 0xff]);
  }

  if (destination.addressType === "ipv6") {
    return Buffer.concat([Buffer.from([0x04]), ipv6ToBytes(destination.host), Buffer.from([(destination.port >> 8) & 0xff, destination.port & 0xff])]);
  }

  const host = Buffer.from(destination.host, "utf8");
  if (host.byteLength > 255) {
    throw new ProtocolError(`domain name is too long for SOCKS5: "${destination.host}"`);
  }
  return Buffer.concat([Buffer.from([0x03, host.byteLength]), host, Buffer.from([(destination.port >> 8) & 0xff, destination.port & 0xff])]);
};

const ipv6ToBytes = (host: string): Buffer => {
  const parts = host.split("::");
  if (parts.length > 2) {
    throw new ProtocolError(`invalid IPv6 address "${host}"`);
  }

  const head = parseIpv6Groups(parts[0] ?? "");
  const tail = parseIpv6Groups(parts[1] ?? "");
  const groups =
    parts.length === 2 ? [...head, ...Array.from({ length: 8 - head.length - tail.length }, () => 0), ...tail] : head;

  if (groups.length !== 8) {
    throw new ProtocolError(`invalid IPv6 address "${host}"`);
  }

  const output = Buffer.alloc(16);
  groups.forEach((group, index) => {
    output[index * 2] = (group >> 8) & 0xff;
    output[index * 2 + 1] = group & 0xff;
  });
  return output;
};

const parseIpv6Groups = (input: string): number[] => {
  if (input.length === 0) {
    return [];
  }
  return input.split(":").map((part) => {
    const value = Number.parseInt(part, 16);
    if (!/^[0-9a-fA-F]{1,4}$/u.test(part) || !Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new ProtocolError(`invalid IPv6 group "${part}"`);
    }
    return value;
  });
};

const bindUdp = async (socket: dgram.Socket, host: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      socket.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      socket.removeListener("error", onError);
      resolve();
    };
    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind(0, host);
  });
};

const waitForControlSocketClose = async (socket: net.Socket, idleTimeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    const cleanup = (): void => {
      socket.removeListener("close", onDone);
      socket.removeListener("end", onDone);
      socket.removeListener("error", onDone);
      socket.removeListener("timeout", onDone);
    };

    const onDone = (): void => {
      cleanup();
      resolve();
    };

    socket.once("close", onDone);
    socket.once("end", onDone);
    socket.once("error", onDone);
    socket.once("timeout", onDone);
    socket.setTimeout(idleTimeoutMs);
  });
};
