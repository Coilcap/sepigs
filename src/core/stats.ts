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
  readonly udpSessionsTotal?: number;
  readonly udpSessionsActive?: number;
  readonly udpErrorsTotal?: number;
  readonly routeMatchesTotal: number;
  readonly outboundFailuresTotal: number;
  readonly dnsQueriesTotal: number;
  readonly dnsFailuresTotal: number;
  readonly hotReloadTotal: number;
  readonly hotReloadFailuresTotal: number;
  readonly fakeIpAssignmentsTotal?: number;
  readonly dashboardRequestsTotal?: number;
  readonly dashboardErrorsTotal?: number;
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
  private udpSessionsTotal = 0;
  private udpSessionsActive = 0;
  private udpErrorsTotal = 0;
  private routeMatchesTotal = 0;
  private outboundFailuresTotal = 0;
  private dnsQueriesTotal = 0;
  private dnsFailuresTotal = 0;
  private hotReloadTotal = 0;
  private hotReloadFailuresTotal = 0;
  private fakeIpAssignmentsTotal = 0;
  private dashboardRequestsTotal = 0;
  private dashboardErrorsTotal = 0;
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

  public openUdpSession(): void {
    this.udpSessionsTotal += 1;
    this.udpSessionsActive += 1;
  }

  public closeUdpSession(): void {
    this.udpSessionsActive = Math.max(0, this.udpSessionsActive - 1);
  }

  public recordUdpError(): void {
    this.udpErrorsTotal += 1;
  }

  public recordRouteMatch(): void {
    this.routeMatchesTotal += 1;
  }

  public recordOutboundFailure(): void {
    this.outboundFailuresTotal += 1;
  }

  public recordDnsQuery(): void {
    this.dnsQueriesTotal += 1;
  }

  public recordDnsFailure(): void {
    this.dnsFailuresTotal += 1;
  }

  public recordHotReload(ok: boolean): void {
    this.hotReloadTotal += 1;
    if (!ok) {
      this.hotReloadFailuresTotal += 1;
    }
  }

  public recordFakeIpAssignment(): void { this.fakeIpAssignmentsTotal += 1; }
  public recordDashboardRequest(ok: boolean): void { this.dashboardRequestsTotal += 1; if (!ok) this.dashboardErrorsTotal += 1; }

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
      udpBytesRemoteToClient: this.udpBytesRemoteToClient,
      udpSessionsTotal: this.udpSessionsTotal,
      udpSessionsActive: this.udpSessionsActive,
      udpErrorsTotal: this.udpErrorsTotal,
      routeMatchesTotal: this.routeMatchesTotal,
      outboundFailuresTotal: this.outboundFailuresTotal,
      dnsQueriesTotal: this.dnsQueriesTotal,
      dnsFailuresTotal: this.dnsFailuresTotal,
      hotReloadTotal: this.hotReloadTotal,
      hotReloadFailuresTotal: this.hotReloadFailuresTotal
      ,fakeIpAssignmentsTotal: this.fakeIpAssignmentsTotal
      ,dashboardRequestsTotal: this.dashboardRequestsTotal
      ,dashboardErrorsTotal: this.dashboardErrorsTotal
    };
  }
}
