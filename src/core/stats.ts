export interface StatsSnapshot {
  readonly activeConnections: number;
  readonly totalConnections: number;
  readonly failedConnections: number;
  readonly closedConnections: number;
  readonly rejectedConnections: number;
  readonly bytesClientToRemote: number;
  readonly bytesRemoteToClient: number;
  readonly totalBytes: number;
  readonly averageConnectionDurationMs: number;
  readonly failureRate: number;
  readonly uptimeMs: number;
  readonly udpPacketsClientToRemote: number;
  readonly udpPacketsRemoteToClient: number;
  readonly udpBytesClientToRemote: number;
  readonly udpBytesRemoteToClient: number;
}

export class StatsTracker {
  private activeConnections = 0;
  private totalConnections = 0;
  private failedConnections = 0;
  private closedConnections = 0;
  private rejectedConnections = 0;
  private bytesClientToRemote = 0;
  private bytesRemoteToClient = 0;
  private totalConnectionDurationMs = 0;
  private udpPacketsClientToRemote = 0;
  private udpPacketsRemoteToClient = 0;
  private udpBytesClientToRemote = 0;
  private udpBytesRemoteToClient = 0;
  private readonly startedAt = Date.now();

  public startConnection(): void {
    this.activeConnections += 1;
    this.totalConnections += 1;
  }

  public closeConnection(failed: boolean, durationMs: number): void {
    if (this.activeConnections > 0) {
      this.activeConnections -= 1;
    }
    this.closedConnections += 1;
    this.totalConnectionDurationMs += Math.max(0, durationMs);
    if (failed) {
      this.failedConnections += 1;
    }
  }

  public rejectConnection(): void {
    this.rejectedConnections += 1;
  }

  public addClientToRemoteBytes(bytes: number): void {
    this.bytesClientToRemote += bytes;
  }

  public addRemoteToClientBytes(bytes: number): void {
    this.bytesRemoteToClient += bytes;
  }

  public addUdpClientToRemoteBytes(bytes: number): void {
    this.udpPacketsClientToRemote += 1;
    this.udpBytesClientToRemote += bytes;
  }

  public addUdpRemoteToClientBytes(bytes: number): void {
    this.udpPacketsRemoteToClient += 1;
    this.udpBytesRemoteToClient += bytes;
  }

  public snapshot(): StatsSnapshot {
    const completed = this.closedConnections === 0 ? 1 : this.closedConnections;
    const failureBase = this.totalConnections + this.rejectedConnections;
    const failureRate = failureBase === 0 ? 0 : (this.failedConnections + this.rejectedConnections) / failureBase;
    const totalBytes = this.bytesClientToRemote + this.bytesRemoteToClient + this.udpBytesClientToRemote + this.udpBytesRemoteToClient;

    return {
      activeConnections: this.activeConnections,
      totalConnections: this.totalConnections,
      failedConnections: this.failedConnections,
      closedConnections: this.closedConnections,
      rejectedConnections: this.rejectedConnections,
      bytesClientToRemote: this.bytesClientToRemote,
      bytesRemoteToClient: this.bytesRemoteToClient,
      totalBytes,
      averageConnectionDurationMs: this.totalConnectionDurationMs / completed,
      failureRate,
      uptimeMs: Date.now() - this.startedAt,
      udpPacketsClientToRemote: this.udpPacketsClientToRemote,
      udpPacketsRemoteToClient: this.udpPacketsRemoteToClient,
      udpBytesClientToRemote: this.udpBytesClientToRemote,
      udpBytesRemoteToClient: this.udpBytesRemoteToClient
    };
  }
}
