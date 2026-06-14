import type { ConnectionPoolConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { TcpStream } from "../protocol/types.js";
import { closeSocket } from "../utils/net.js";

export interface PoolEndpoint {
  readonly host: string;
  readonly port: number;
  readonly protocol: "tcp";
}

export interface ConnectionPoolSnapshot {
  readonly enabled: boolean;
  readonly idleConnections: number;
  readonly endpoints: readonly {
    readonly key: string;
    readonly idleConnections: number;
  }[];
}

interface IdleEntry {
  readonly socket: TcpStream;
  readonly timer: NodeJS.Timeout;
  readonly cleanup: () => void;
}

const endpointKey = (endpoint: PoolEndpoint): string => {
  return `${endpoint.protocol}:${endpoint.host}:${endpoint.port}`;
};

export class TcpConnectionPool {
  private readonly config: ConnectionPoolConfig;
  private readonly logger: Logger;
  private readonly idle = new Map<string, IdleEntry[]>();

  public constructor(config: ConnectionPoolConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public async lease(endpoint: PoolEndpoint, factory: () => Promise<TcpStream>): Promise<TcpStream> {
    if (!this.config.enabled) {
      return await factory();
    }

    const key = endpointKey(endpoint);
    const bucket = this.idle.get(key);
    while (bucket !== undefined && bucket.length > 0) {
      const entry = bucket.pop();
      if (entry === undefined) {
        break;
      }
      entry.cleanup();
      clearTimeout(entry.timer);
      if (!entry.socket.destroyed) {
        this.logger.debug("connection pool lease reused socket", { key });
        return entry.socket;
      }
    }

    return await factory();
  }

  public release(endpoint: PoolEndpoint, socket: TcpStream): void {
    if (!this.config.enabled || this.config.maxIdlePerEndpoint === 0 || socket.destroyed) {
      closeSocket(socket);
      return;
    }

    const key = endpointKey(endpoint);
    const bucket = this.idle.get(key) ?? [];
    if (bucket.length >= this.config.maxIdlePerEndpoint) {
      closeSocket(socket);
      return;
    }

    const removeEntry = (): void => {
      const entries = this.idle.get(key);
      if (entries === undefined) {
        return;
      }
      const index = entries.findIndex((candidate) => candidate.socket === socket);
      if (index >= 0) {
        const removed = entries.splice(index, 1)[0];
        removed?.cleanup();
        if (removed !== undefined) {
          clearTimeout(removed.timer);
        }
        if (entries.length === 0) {
          this.idle.delete(key);
        }
      }
    };

    const onClose = (): void => {
      removeEntry();
    };
    const onError = (): void => {
      removeEntry();
      closeSocket(socket);
    };
    socket.once("close", onClose);
    socket.once("error", onError);
    const timer = setTimeout(() => {
      removeEntry();
      closeSocket(socket);
    }, this.config.idleTimeoutMs);
    timer.unref();

    const entry: IdleEntry = {
      socket,
      timer,
      cleanup: () => {
        socket.removeListener("close", onClose);
        socket.removeListener("error", onError);
      }
    };
    bucket.push(entry);
    this.idle.set(key, bucket);
  }

  public closeAll(): void {
    for (const entries of this.idle.values()) {
      for (const entry of entries) {
        clearTimeout(entry.timer);
        entry.cleanup();
        closeSocket(entry.socket);
      }
    }
    this.idle.clear();
  }

  public snapshot(): ConnectionPoolSnapshot {
    const endpoints = [...this.idle.entries()].map(([key, entries]) => ({
      key,
      idleConnections: entries.length
    }));
    return {
      enabled: this.config.enabled,
      idleConnections: endpoints.reduce((total, endpoint) => total + endpoint.idleConnections, 0),
      endpoints
    };
  }
}
