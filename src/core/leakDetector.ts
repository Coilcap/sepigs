import type { EventEmitter } from "node:events";
import type { Logger } from "../logger/logger.js";
import type { TcpStream } from "../protocol/types.js";

interface TrackedEmitter {
  readonly id: string;
  readonly label: string;
  readonly emitter: EventEmitter;
}

export interface LeakDetectorSnapshot {
  readonly activeSockets: number;
  readonly activeTimers: number;
  readonly activeListeners: number;
  readonly trackedEmitters: number;
  readonly warnings: readonly string[];
}

export class LeakDetector {
  private readonly logger: Logger;
  private readonly sockets = new Map<string, TcpStream>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly emitters = new Map<string, TrackedEmitter>();
  private nextId = 1;

  public constructor(logger: Logger) {
    this.logger = logger;
  }

  public trackSocket(socket: TcpStream, label: string): () => void {
    const id = this.nextLabel("socket", label);
    this.sockets.set(id, socket);
    const cleanupEmitter = this.trackEmitter(socket, label);

    const cleanup = (): void => {
      this.sockets.delete(id);
      cleanupEmitter();
      socket.removeListener("close", cleanup);
    };

    socket.once("close", cleanup);
    return cleanup;
  }

  public trackTimer(timer: NodeJS.Timeout, label: string): () => void {
    const id = this.nextLabel("timer", label);
    this.timers.set(id, timer);
    let cleaned = false;

    return () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      this.timers.delete(id);
    };
  }

  public trackEmitter(emitter: EventEmitter, label: string): () => void {
    const id = this.nextLabel("emitter", label);
    this.emitters.set(id, { id, label, emitter });
    let cleaned = false;

    return () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      this.emitters.delete(id);
    };
  }

  public snapshot(): LeakDetectorSnapshot {
    let activeListeners = 0;
    const warnings: string[] = [];

    for (const tracked of this.emitters.values()) {
      let emitterListeners = 0;
      for (const eventName of tracked.emitter.eventNames()) {
        emitterListeners += tracked.emitter.listenerCount(eventName);
      }
      activeListeners += emitterListeners;

      if (emitterListeners > 32) {
        warnings.push(`${tracked.label} has ${emitterListeners} listeners`);
      }
    }

    if (this.sockets.size > 0 && activeListeners === 0) {
      warnings.push("tracked sockets exist but no listeners are visible");
    }

    return {
      activeSockets: this.sockets.size,
      activeTimers: this.timers.size,
      activeListeners,
      trackedEmitters: this.emitters.size,
      warnings
    };
  }

  public report(): void {
    const snapshot = this.snapshot();
    const logPayload = {
      activeSockets: snapshot.activeSockets,
      activeTimers: snapshot.activeTimers,
      activeListeners: snapshot.activeListeners,
      trackedEmitters: snapshot.trackedEmitters,
      warnings: snapshot.warnings
    };

    if (snapshot.warnings.length > 0) {
      this.logger.warn("leak detector warning", logPayload);
      return;
    }
    this.logger.debug("leak detector status", logPayload);
  }

  private nextLabel(kind: string, label: string): string {
    const id = `${kind}:${this.nextId}:${label}`;
    this.nextId += 1;
    return id;
  }
}
