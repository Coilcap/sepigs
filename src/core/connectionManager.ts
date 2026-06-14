import type { Destination, InboundProtocol, Network, SourceAddress, TcpStream } from "../protocol/types.js";
import type { Logger } from "../logger/logger.js";
import { closeSocket } from "../utils/net.js";
import type { LeakDetector } from "./leakDetector.js";
import type { ResourceLimiter } from "./resourceLimiter.js";
import type { StatsTracker } from "./stats.js";
import type { TimeoutManager, ManagedTimer } from "./timeout.js";

export type ConnectionState = "handshake" | "established" | "closing" | "closed";

export interface ConnectionSnapshot {
  readonly id: string;
  readonly inboundTag: string;
  readonly protocol: InboundProtocol;
  readonly network: Network;
  readonly source?: SourceAddress;
  readonly destination?: Destination;
  readonly startTime: number;
  readonly durationMs: number;
  readonly bytesUpload: number;
  readonly bytesDownload: number;
  readonly state: ConnectionState;
  readonly closeReason?: string;
}

interface ConnectionCreateOptions {
  readonly inboundTag: string;
  readonly protocol: InboundProtocol;
  readonly network: Network;
  readonly source?: SourceAddress;
  readonly clientSocket: TcpStream;
  readonly handshakeTimeoutMs: number;
  readonly idleTimeoutMs: number;
}

export class ManagedConnection {
  public readonly id: string;
  public readonly inboundTag: string;
  public readonly protocol: InboundProtocol;
  public readonly network: Network;
  public readonly startTime = Date.now();
  private readonly manager: ConnectionManager;
  private readonly source: SourceAddress | undefined;
  private readonly idleTimeoutMs: number;
  private state: ConnectionState = "handshake";
  private destination: Destination | undefined;
  private bytesUpload = 0;
  private bytesDownload = 0;
  private closeReason: string | undefined;
  private timer: ManagedTimer;
  private clientSocket: TcpStream | undefined;
  private remoteSocket: TcpStream | undefined;
  private socketCleanups: Array<() => void> = [];

  public constructor(id: string, options: ConnectionCreateOptions, manager: ConnectionManager, timeoutManager: TimeoutManager) {
    this.id = id;
    this.inboundTag = options.inboundTag;
    this.protocol = options.protocol;
    this.network = options.network;
    this.source = options.source;
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.manager = manager;
    this.timer = timeoutManager.createTimeout(`connection:${id}:handshake`, options.handshakeTimeoutMs, () => {
      this.close(true, "handshake timeout");
    });
    this.attachClientSocket(options.clientSocket);
  }

  public setDestination(destination: Destination): void {
    this.destination = destination;
  }

  public markEstablished(): void {
    if (this.state !== "handshake") {
      return;
    }
    this.state = "established";
    this.timer.refresh(this.idleTimeoutMs);
  }

  public attachRemoteSocket(socket: TcpStream): void {
    this.remoteSocket = socket;
    this.socketCleanups.push(this.manager.trackSocket(socket, `${this.id}:remote`));
    const onClose = (): void => {
      this.close(false, "remote socket closed");
    };
    socket.once("close", onClose);
    this.socketCleanups.push(() => {
      socket.removeListener("close", onClose);
    });
  }

  public addUploadBytes(bytes: number): void {
    this.bytesUpload += bytes;
    this.manager.addUploadBytes(bytes);
    this.touch();
  }

  public addDownloadBytes(bytes: number): void {
    this.bytesDownload += bytes;
    this.manager.addDownloadBytes(bytes);
    this.touch();
  }

  public touch(): void {
    if (this.state === "established") {
      this.timer.refresh(this.idleTimeoutMs);
    }
  }

  public close(failed: boolean, reason: string): void {
    if (this.state === "closed" || this.state === "closing") {
      return;
    }

    this.state = "closing";
    this.closeReason = reason;
    this.timer.clear();
    for (const cleanup of this.socketCleanups.splice(0)) {
      cleanup();
    }
    if (this.clientSocket !== undefined) {
      closeSocket(this.clientSocket);
    }
    if (this.remoteSocket !== undefined) {
      closeSocket(this.remoteSocket);
    }
    this.state = "closed";
    this.manager.finalize(this, failed);
  }

  public snapshot(now = Date.now()): ConnectionSnapshot {
    const base = {
      id: this.id,
      inboundTag: this.inboundTag,
      protocol: this.protocol,
      network: this.network,
      startTime: this.startTime,
      durationMs: now - this.startTime,
      bytesUpload: this.bytesUpload,
      bytesDownload: this.bytesDownload,
      state: this.state
    };

    return {
      ...base,
      ...(this.source === undefined ? {} : { source: this.source }),
      ...(this.destination === undefined ? {} : { destination: this.destination }),
      ...(this.closeReason === undefined ? {} : { closeReason: this.closeReason })
    };
  }

  private attachClientSocket(socket: TcpStream): void {
    this.clientSocket = socket;
    this.socketCleanups.push(this.manager.trackSocket(socket, `${this.id}:client`));
    const onClose = (): void => {
      this.close(false, "client socket closed");
    };
    socket.once("close", onClose);
    this.socketCleanups.push(() => {
      socket.removeListener("close", onClose);
    });
  }
}

export class ConnectionManager {
  private readonly logger: Logger;
  private readonly stats: StatsTracker;
  private readonly limiter: ResourceLimiter;
  private readonly leakDetector: LeakDetector;
  private readonly timeoutManager: TimeoutManager;
  private readonly connections = new Map<string, ManagedConnection>();
  private nextId = 1;

  public constructor(
    stats: StatsTracker,
    limiter: ResourceLimiter,
    leakDetector: LeakDetector,
    timeoutManager: TimeoutManager,
    logger: Logger
  ) {
    this.stats = stats;
    this.limiter = limiter;
    this.leakDetector = leakDetector;
    this.timeoutManager = timeoutManager;
    this.logger = logger;
  }

  public accept(options: ConnectionCreateOptions): ManagedConnection | undefined {
    if (!this.limiter.tryAcquireConnection()) {
      this.stats.rejectConnection();
      this.logger.warn("connection rejected by resource limiter", {
        inboundTag: options.inboundTag,
        protocol: options.protocol,
        source: options.source,
        limiter: this.limiter.snapshot()
      });
      return undefined;
    }

    const connection = new ManagedConnection(String(this.nextId), options, this, this.timeoutManager);
    this.nextId += 1;
    this.connections.set(connection.id, connection);
    this.stats.startConnection();
    return connection;
  }

  public listActive(): readonly ConnectionSnapshot[] {
    const now = Date.now();
    return [...this.connections.values()].map((connection) => connection.snapshot(now));
  }

  public closeConnection(id: string, reason = "forced close"): boolean {
    const connection = this.connections.get(id);
    if (connection === undefined) {
      return false;
    }
    connection.close(true, reason);
    return true;
  }

  public closeAll(reason = "engine stop"): void {
    for (const connection of [...this.connections.values()]) {
      connection.close(false, reason);
    }
  }

  public addUploadBytes(bytes: number): void {
    this.stats.addClientToRemoteBytes(bytes);
  }

  public addDownloadBytes(bytes: number): void {
    this.stats.addRemoteToClientBytes(bytes);
  }

  public trackSocket(socket: TcpStream, label: string): () => void {
    return this.leakDetector.trackSocket(socket, label);
  }

  public finalize(connection: ManagedConnection, failed: boolean): void {
    if (!this.connections.delete(connection.id)) {
      return;
    }
    this.limiter.releaseConnection();
    this.stats.closeConnection(failed, Date.now() - connection.startTime);
  }
}
