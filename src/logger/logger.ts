import { inspect } from "node:util";
import type { LogLevel } from "../config/types.js";

type LogMeta = object;

export interface LogRecord {
  readonly timestamp: string;
  readonly level: Exclude<LogLevel, "silent">;
  readonly scope?: string;
  readonly message: string;
}

class LogBuffer {
  private readonly records: LogRecord[] = [];
  public push(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > 500) {
      this.records.shift();
    }
  }
  public list(): readonly LogRecord[] {
    return [...this.records];
  }
}

const levelWeights: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export class Logger {
  private readonly level: LogLevel;
  private readonly scope: string | undefined;
  private readonly buffer: LogBuffer;

  public constructor(level: LogLevel = "info", scope?: string, buffer = new LogBuffer()) {
    this.level = level;
    this.scope = scope;
    this.buffer = buffer;
  }

  public child(scope: string): Logger {
    const nextScope = this.scope === undefined ? scope : `${this.scope}:${scope}`;
    return new Logger(this.level, nextScope, this.buffer);
  }

  public records(): readonly LogRecord[] {
    return this.buffer.list();
  }

  public debug(message: string, meta?: LogMeta): void {
    this.write("debug", message, meta);
  }

  public info(message: string, meta?: LogMeta): void {
    this.write("info", message, meta);
  }

  public warn(message: string, meta?: LogMeta): void {
    this.write("warn", message, meta);
  }

  public error(message: string, meta?: LogMeta): void {
    this.write("error", message, meta);
  }

  private enabled(level: LogLevel): boolean {
    return levelWeights[level] >= levelWeights[this.level] && this.level !== "silent";
  }

  private write(level: Exclude<LogLevel, "silent">, message: string, meta?: LogMeta): void {
    if (!this.enabled(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    this.buffer.push({ timestamp, level, ...(this.scope === undefined ? {} : { scope: this.scope }), message });
    const scope = this.scope === undefined ? "" : ` [${this.scope}]`;
    const suffix = meta === undefined ? "" : ` ${inspect(meta, { depth: 4, breakLength: 160 })}`;
    const line = `${timestamp} ${level.toUpperCase()}${scope} ${message}${suffix}`;

    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}
