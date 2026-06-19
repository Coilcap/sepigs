import { PassThrough } from "node:stream";
import type { Destination, TcpStream } from "../protocol/types.js";
import { NetworkError } from "../utils/errors.js";

export interface QuicAdapterConnectOptions {
  readonly destination: Destination;
  readonly alpnProtocols?: readonly string[];
  readonly serverName?: string;
}

export interface QuicAdapterConnection {
  readonly stream: TcpStream;
  readonly protocol: string;
}

export interface QuicTransportAdapter {
  readonly name: string;
  readonly supported: boolean;
  connect(options: QuicAdapterConnectOptions): Promise<QuicAdapterConnection>;
  close(): Promise<void>;
}

export class MissingDependencyQuicAdapter implements QuicTransportAdapter {
  public readonly name = "missing-dependency";
  public readonly supported = false;

  public connect(options: QuicAdapterConnectOptions): Promise<QuicAdapterConnection> {
    return Promise.reject(
      new NetworkError(
        `QUIC adapter dependency is missing for ${options.destination.host}:${options.destination.port}; install/register a QUIC adapter plugin`
      )
    );
  }

  public async close(): Promise<void> {
    await Promise.resolve();
  }
}

export class MockQuicAdapter implements QuicTransportAdapter {
  public readonly name = "mock";
  public readonly supported = true;

  public connect(options: QuicAdapterConnectOptions): Promise<QuicAdapterConnection> {
    void options;
    const stream = new PassThrough() as PassThrough & { setTimeout(timeoutMs: number): unknown };
    stream.setTimeout = () => stream;
    return Promise.resolve({ stream, protocol: "mock-quic" });
  }

  public async close(): Promise<void> {
    await Promise.resolve();
  }
}

export class QuicAdapterRegistry {
  private adapter: QuicTransportAdapter = new MissingDependencyQuicAdapter();

  public register(adapter: QuicTransportAdapter): void {
    this.adapter = adapter;
  }

  public current(): QuicTransportAdapter {
    return this.adapter;
  }
}
