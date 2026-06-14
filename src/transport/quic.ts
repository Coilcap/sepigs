import type { QuicTransportConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { Destination, TcpStream } from "../protocol/types.js";
import { NetworkError } from "../utils/errors.js";

export interface QuicConnection {
  readonly stream: TcpStream;
  readonly negotiatedProtocol?: string;
}

export interface QuicConnectOptions {
  readonly destination: Destination;
  readonly serverName?: string;
  readonly alpnProtocols?: readonly string[];
}

export interface QuicTransport {
  connect(options: QuicConnectOptions): Promise<QuicConnection>;
  close(): Promise<void>;
}

export class UnavailableQuicTransport implements QuicTransport {
  private readonly config: QuicTransportConfig;
  private readonly logger: Logger;

  public constructor(config: QuicTransportConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public connect(options: QuicConnectOptions): Promise<QuicConnection> {
    this.logger.debug("QUIC connection requested", {
      destination: `${options.destination.host}:${options.destination.port}`,
      enabled: this.config.enabled,
      handshakeTimeoutMs: this.config.handshakeTimeoutMs
    });
    return Promise.reject(new NetworkError("QUIC transport is not available in this Node.js build; register a plugin QUIC transport implementation"));
  }

  public async close(): Promise<void> {
    await Promise.resolve();
  }
}
