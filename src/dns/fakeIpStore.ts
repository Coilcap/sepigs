import { readFileSync, renameSync, writeFileSync } from "node:fs";

export interface FakeIpRecord {
  readonly domain: string;
  readonly address: string;
  readonly expiresAt: number;
}

export class FakeIpStore {
  private readonly byDomain = new Map<string, FakeIpRecord>();
  private readonly byAddress = new Map<string, FakeIpRecord>();

  public constructor(private readonly maxSize: number, private readonly persistPath?: string) {
    this.load();
  }

  public getByDomain(domain: string): FakeIpRecord | undefined {
    const record = this.read(this.byDomain.get(domain));
    if (record !== undefined) {
      this.touch(record);
    }
    return record;
  }

  public getByAddress(address: string): FakeIpRecord | undefined {
    const record = this.read(this.byAddress.get(address));
    if (record !== undefined) {
      this.touch(record);
    }
    return record;
  }

  public hasAddress(address: string): boolean {
    return this.getByAddress(address) !== undefined;
  }

  public set(record: FakeIpRecord): void {
    const previous = this.byDomain.get(record.domain);
    if (previous !== undefined) {
      this.byAddress.delete(previous.address);
    }
    this.byDomain.set(record.domain, record);
    this.byAddress.set(record.address, record);
    while (this.byDomain.size > this.maxSize) {
      const oldest = this.byDomain.values().next().value;
      if (oldest === undefined) {
        break;
      }
      this.delete(oldest);
    }
    this.persist();
  }

  public records(): readonly FakeIpRecord[] {
    this.prune();
    return [...this.byDomain.values()];
  }

  public evictOldest(): FakeIpRecord | undefined {
    const oldest = this.byDomain.values().next().value;
    if (oldest !== undefined) {
      this.delete(oldest);
    }
    return oldest;
  }

  private read(record: FakeIpRecord | undefined): FakeIpRecord | undefined {
    if (record === undefined) {
      return undefined;
    }
    if (record.expiresAt <= Date.now()) {
      this.delete(record);
      return undefined;
    }
    return record;
  }

  private touch(record: FakeIpRecord): void {
    this.byDomain.delete(record.domain);
    this.byDomain.set(record.domain, record);
  }

  private delete(record: FakeIpRecord): void {
    this.byDomain.delete(record.domain);
    this.byAddress.delete(record.address);
  }

  private prune(): void {
    for (const record of this.byDomain.values()) {
      this.read(record);
    }
  }

  private load(): void {
    if (this.persistPath === undefined) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.persistPath, "utf8")) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      for (const value of parsed) {
        if (isRecord(value) && typeof value.domain === "string" && typeof value.address === "string" && typeof value.expiresAt === "number") {
          const record = { domain: value.domain, address: value.address, expiresAt: value.expiresAt };
          if (record.expiresAt > Date.now()) {
            this.byDomain.set(record.domain, record);
            this.byAddress.set(record.address, record);
          }
        }
      }
    } catch {
      // Missing or corrupt optional state starts with an empty store.
    }
  }

  private persist(): void {
    if (this.persistPath === undefined) {
      return;
    }
    const temporaryPath = `${this.persistPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.records()), { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, this.persistPath);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
