import type { Destination, SourceAddress } from "../protocol/types.js";

export interface UdpSessionSnapshot {
  readonly id: string;
  readonly source: SourceAddress;
  readonly destination?: Destination;
  readonly startedAt: number;
  readonly lastActivityAt: number;
  readonly packetsUpload: number;
  readonly packetsDownload: number;
  readonly bytesUpload: number;
  readonly bytesDownload: number;
}

export class UdpSession {
  public readonly startedAt = Date.now();
  public lastActivityAt = this.startedAt;
  private destination: Destination | undefined;
  private packetsUpload = 0;
  private packetsDownload = 0;
  private bytesUpload = 0;
  private bytesDownload = 0;

  public constructor(public readonly id: string, public readonly source: SourceAddress) {}

  public upload(destination: Destination, bytes: number): void {
    this.destination = destination;
    this.lastActivityAt = Date.now();
    this.packetsUpload += 1;
    this.bytesUpload += bytes;
  }

  public download(bytes: number): void {
    this.lastActivityAt = Date.now();
    this.packetsDownload += 1;
    this.bytesDownload += bytes;
  }

  public snapshot(): UdpSessionSnapshot {
    return {
      id: this.id,
      source: this.source,
      ...(this.destination === undefined ? {} : { destination: this.destination }),
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      packetsUpload: this.packetsUpload,
      packetsDownload: this.packetsDownload,
      bytesUpload: this.bytesUpload,
      bytesDownload: this.bytesDownload
    };
  }
}
