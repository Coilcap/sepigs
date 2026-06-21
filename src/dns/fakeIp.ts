import type { FakeIpConfig } from "../config/types.js";
import { FakeIpPool } from "./fakeIpPool.js";
import { FakeIpStore } from "./fakeIpStore.js";

export class FakeIpService {
  private readonly pool: FakeIpPool;
  private readonly store: FakeIpStore;

  public constructor(private readonly config: FakeIpConfig, private readonly onAssign?: () => void) {
    const size = config.size ?? 65_536;
    this.pool = new FakeIpPool(config.range ?? config.cidr ?? "198.18.0.0/15", size);
    this.store = new FakeIpStore(size, config.persistPath);
  }

  public assign(domain: string): string {
    const normalized = domain.toLowerCase();
    const existing = this.store.getByDomain(normalized);
    if (existing !== undefined) {
      return existing.address;
    }
    let address: string;
    try {
      address = this.pool.next((candidate) => this.store.hasAddress(candidate));
    } catch (error) {
      const evicted = this.store.evictOldest();
      if (evicted === undefined) {
        throw error;
      }
      address = evicted.address;
    }
    this.store.set({ domain: normalized, address, expiresAt: Date.now() + (this.config.ttlSeconds ?? 600) * 1_000 });
    this.onAssign?.();
    return address;
  }

  public reverse(address: string): string | undefined {
    return this.store.getByAddress(address)?.domain;
  }

  public contains(address: string): boolean {
    return this.pool.contains(address);
  }
}
