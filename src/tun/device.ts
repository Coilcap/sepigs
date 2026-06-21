import { EventEmitter } from "node:events";
import { NetworkError } from "../utils/errors.js";

export interface TunDevice {
  readonly name: string;
  read(): Promise<Buffer>;
  write(packet: Buffer): Promise<void>;
  close(): Promise<void>;
}

export class UnsupportedTunDevice implements TunDevice {
  public constructor(public readonly name: string) {}
  public read(): Promise<Buffer> { return Promise.reject(new NetworkError("native TUN device creation is not implemented; use a platform adapter plugin")); }
  public write(packet: Buffer): Promise<void> { void packet; return Promise.reject(new NetworkError("native TUN device creation is not implemented; use a platform adapter plugin")); }
  public async close(): Promise<void> { await Promise.resolve(); }
}

export class MockTunDevice implements TunDevice {
  private readonly events = new EventEmitter();
  private closed = false;
  public readonly written: Buffer[] = [];
  public constructor(public readonly name = "mock-tun") {}
  public inject(packet: Buffer): void { if (!this.closed) this.events.emit("packet", Buffer.from(packet)); }
  public async read(): Promise<Buffer> {
    if (this.closed) throw new NetworkError("mock TUN is closed");
    return await new Promise<Buffer>((resolve) => this.events.once("packet", resolve));
  }
  public write(packet: Buffer): Promise<void> { if (this.closed) return Promise.reject(new NetworkError("mock TUN is closed")); this.written.push(Buffer.from(packet)); return Promise.resolve(); }
  public async close(): Promise<void> { this.closed = true; this.events.removeAllListeners(); await Promise.resolve(); }
}
