export interface ResourceLimiterSnapshot {
  readonly maxConnections: number;
  readonly activeConnections: number;
  readonly rejectedConnections: number;
}

export class ResourceLimiter {
  private readonly maxConnections: number;
  private activeConnections = 0;
  private rejectedConnections = 0;

  public constructor(maxConnections: number) {
    this.maxConnections = maxConnections;
  }

  public tryAcquireConnection(): boolean {
    if (this.activeConnections >= this.maxConnections) {
      this.rejectedConnections += 1;
      return false;
    }
    this.activeConnections += 1;
    return true;
  }

  public releaseConnection(): void {
    if (this.activeConnections > 0) {
      this.activeConnections -= 1;
    }
  }

  public snapshot(): ResourceLimiterSnapshot {
    return {
      maxConnections: this.maxConnections,
      activeConnections: this.activeConnections,
      rejectedConnections: this.rejectedConnections
    };
  }
}
