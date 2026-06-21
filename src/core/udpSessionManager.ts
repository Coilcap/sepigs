import type { SourceAddress } from "../protocol/types.js";
import { UdpSession, type UdpSessionSnapshot } from "../transport/udpSession.js";
import type { Logger } from "../logger/logger.js";
import type { StatsTracker } from "./stats.js";

interface ManagedUdpSession {
  readonly session: UdpSession;
  readonly close: () => void;
  timer: NodeJS.Timeout;
}

export class UdpSessionManager {
  private readonly sessions = new Map<string, ManagedUdpSession>();

  public constructor(
    private readonly maxSessions: number,
    private readonly idleTimeoutMs: number,
    private readonly stats: StatsTracker,
    private readonly logger: Logger
  ) {}

  public open(id: string, source: SourceAddress, close: () => void): UdpSession | undefined {
    if (this.sessions.size >= this.maxSessions) {
      this.stats.recordUdpError();
      this.logger.warn("udp session rejected by resource limiter", { active: this.sessions.size, max: this.maxSessions });
      return undefined;
    }
    const existing = this.sessions.get(id);
    if (existing !== undefined) {
      return existing.session;
    }
    const session = new UdpSession(id, source);
    const managed: ManagedUdpSession = {
      session,
      close,
      timer: this.createTimer(id)
    };
    this.sessions.set(id, managed);
    this.stats.openUdpSession();
    return session;
  }

  public touch(id: string): void {
    const managed = this.sessions.get(id);
    if (managed === undefined) {
      return;
    }
    clearTimeout(managed.timer);
    managed.timer = this.createTimer(id);
  }

  public release(id: string, invokeClose = false): void {
    const managed = this.sessions.get(id);
    if (managed === undefined) {
      return;
    }
    this.sessions.delete(id);
    clearTimeout(managed.timer);
    this.stats.closeUdpSession();
    if (invokeClose) {
      managed.close();
    }
  }

  public recordError(): void {
    this.stats.recordUdpError();
  }

  public list(): readonly UdpSessionSnapshot[] {
    return [...this.sessions.values()].map(({ session }) => session.snapshot());
  }

  public closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.release(id, true);
    }
  }

  public async stop(): Promise<void> {
    this.closeAll();
    await Promise.resolve();
  }

  private createTimer(id: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.logger.debug("udp session idle timeout", { id, idleTimeoutMs: this.idleTimeoutMs });
      this.release(id, true);
    }, this.idleTimeoutMs);
    timer.unref();
    return timer;
  }
}
