import type { DNSGeneration } from "./generation.js";

export interface DNSGenerationHandle {
  readonly generation: DNSGeneration;
  release(): void;
}

export interface DNSGenerationStoreMetrics {
  readonly activeGeneration: number;
  readonly drainingGenerations: number;
  readonly cacheCarriedOver: number;
  readonly cacheDropped: number;
  readonly rejectedFakeIpChanges: number;
}

export class DNSGenerationStore {
  private activeGeneration: DNSGeneration;
  private readonly generations = new Map<string, DNSGeneration>();
  private cacheCarriedOver = 0;
  private cacheDropped = 0;
  private rejectedFakeIpChanges = 0;

  public constructor(initial: DNSGeneration) {
    this.activeGeneration = initial;
    this.generations.set(initial.id, initial);
  }

  public active(): DNSGeneration {
    return this.activeGeneration;
  }

  public acquire(): DNSGenerationHandle {
    const generation = this.activeGeneration;
    generation.beginQuery();
    let released = false;
    return {
      generation,
      release: () => {
        if (released) return;
        released = true;
        generation.endQuery();
        this.releaseDrained();
      }
    };
  }

  public switchTo(candidate: DNSGeneration): DNSGeneration {
    const old = this.activeGeneration;
    old.markDraining();
    candidate.markActive();
    this.generations.set(candidate.id, candidate);
    this.activeGeneration = candidate;
    return old;
  }

  public markDraining(generation: DNSGeneration): void {
    generation.markDraining();
    this.generations.set(generation.id, generation);
  }

  public restore(old: DNSGeneration, candidate: DNSGeneration): void {
    candidate.markDraining();
    old.markActive();
    this.generations.set(old.id, old);
    this.generations.set(candidate.id, candidate);
    this.activeGeneration = old;
    this.releaseDrained();
  }

  public releaseDrained(): readonly string[] {
    const released: string[] = [];
    for (const [id, generation] of this.generations) {
      if (generation === this.activeGeneration || !generation.isReleasable()) continue;
      this.generations.delete(id);
      released.push(id);
    }
    return released;
  }

  public draining(): readonly DNSGeneration[] {
    return [...this.generations.values()].filter((generation) => generation.draining);
  }

  public has(id: string): boolean {
    return this.generations.has(id);
  }

  public recordCacheCarryover(carried: number, dropped: number): void {
    this.cacheCarriedOver += Math.max(0, carried);
    this.cacheDropped += Math.max(0, dropped);
  }

  public recordRejectedFakeIpChange(): void {
    this.rejectedFakeIpChanges += 1;
  }

  public metrics(): DNSGenerationStoreMetrics {
    return {
      activeGeneration: this.activeGeneration.sequence,
      drainingGenerations: this.draining().length,
      cacheCarriedOver: this.cacheCarriedOver,
      cacheDropped: this.cacheDropped,
      rejectedFakeIpChanges: this.rejectedFakeIpChanges
    };
  }

  public shutdown(): void {
    for (const generation of this.generations.values()) generation.abortInFlight();
    this.releaseDrained();
  }
}
