import type { TunDevice } from "./device.js";
import { parseIpv4Packet, type Ipv4Packet } from "./packet.js";

export class TunPacketStack {
  private running = false;
  public constructor(private readonly device: TunDevice, private readonly onPacket: (packet: Ipv4Packet) => Promise<void>) {}
  public async runOne(): Promise<void> { await this.onPacket(parseIpv4Packet(await this.device.read())); }
  // stop() may flip the flag while runOne() is awaiting a device packet.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  public async start(): Promise<void> { this.running = true; do { await this.runOne(); } while (this.running); }
  public async stop(): Promise<void> { this.running = false; await this.device.close(); }
}
