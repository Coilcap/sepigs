import type { QuicTransportAdapter, QuicAdapterConnectOptions, QuicAdapterConnection } from "./quicAdapter.js";

export class ExperimentalQuicTransport {
  public constructor(private readonly enabled: boolean, private readonly adapter: QuicTransportAdapter) {}
  public capability(): { enabled: boolean; supported: boolean; adapter: string } { return { enabled: this.enabled, supported: this.adapter.supported, adapter: this.adapter.name }; }
  public connect(options: QuicAdapterConnectOptions): Promise<QuicAdapterConnection> {
    if (!this.enabled) return Promise.reject(new Error("experimental QUIC transport is disabled"));
    return this.adapter.connect(options);
  }
  public async close(): Promise<void> { await this.adapter.close(); }
}
