import type { OutboundGenerationDescriptor } from "./generationTypes.js";
import type { Outbound } from "./outbound.js";

export interface OutboundRuntimeReference {
  readonly id: string;
  readonly generationId: string;
  readonly tag: string;
  readonly outbound: Outbound;
}

export interface OutboundRuntimeRegistrySnapshot {
  readonly activeGenerationId: string;
  readonly activeGenerationSequence: number;
  readonly drainingGenerations: number;
  readonly rejectedUnsupported: number;
  readonly generations: readonly {
    readonly id: string;
    readonly sequence: number;
    readonly state: "active" | "draining";
    readonly referenceCount: number;
    readonly entries: readonly {
      readonly tag: string;
      readonly type: string;
      readonly configHash: string;
      readonly riskLevel: string;
      readonly experimental: boolean;
      readonly referenceCount: number;
    }[];
  }[];
}

interface RuntimeGenerationRecord {
  readonly generation: OutboundGenerationDescriptor;
  readonly sequence: number;
  readonly outbounds: ReadonlyMap<string, Outbound>;
  readonly referencesByTag: Map<string, number>;
  state: "active" | "draining";
}

interface ReferenceRelease {
  readonly releaseGeneration: () => void;
  readonly generationId: string;
  readonly tag: string;
}

export interface OutboundRuntimeRegistryOptions {
  readonly onActivate?: (outbound: Outbound) => void;
  readonly onRetire?: (outbound: Outbound) => void;
}

export class OutboundRuntimeRegistry {
  private activeGenerationId: string;
  private readonly records = new Map<string, RuntimeGenerationRecord>();
  private readonly referenceReleases = new WeakMap<
    OutboundRuntimeReference,
    ReferenceRelease
  >();
  private nextReferenceId = 1;
  private rejectedUnsupported = 0;

  public constructor(
    initialGeneration: OutboundGenerationDescriptor,
    initialOutbounds: ReadonlyMap<string, Outbound>,
    private readonly options: OutboundRuntimeRegistryOptions = {}
  ) {
    validateRuntimeEntries(initialGeneration, initialOutbounds);
    this.activeGenerationId = initialGeneration.id;
    this.records.set(initialGeneration.id, {
      generation: initialGeneration,
      sequence: 0,
      outbounds: readonlyMap(initialOutbounds),
      referencesByTag: new Map(),
      state: "active"
    });
  }

  public getActiveGeneration(): OutboundGenerationDescriptor {
    return this.requireRecord(this.activeGenerationId).generation;
  }

  public getOutbound(
    tag: string,
    generationId = this.activeGenerationId
  ): Outbound | undefined {
    return this.records.get(generationId)?.outbounds.get(tag);
  }

  public acquireOutboundRef(
    tag: string,
    generationId = this.activeGenerationId
  ): OutboundRuntimeReference | undefined {
    const record = this.records.get(generationId);
    const outbound = record?.outbounds.get(tag);
    if (record === undefined || outbound === undefined) return undefined;
    const releaseGeneration = record.generation.acquire();
    record.referencesByTag.set(
      tag,
      (record.referencesByTag.get(tag) ?? 0) + 1
    );
    const reference = Object.freeze({
      id: `outbound-ref-${String(this.nextReferenceId)}`,
      generationId,
      tag,
      outbound
    });
    this.nextReferenceId += 1;
    this.referenceReleases.set(reference, {
      releaseGeneration,
      generationId,
      tag
    });
    return reference;
  }

  public async releaseOutboundRef(
    reference: OutboundRuntimeReference
  ): Promise<void> {
    const release = this.referenceReleases.get(reference);
    if (release === undefined) return;
    this.referenceReleases.delete(reference);
    release.releaseGeneration();
    const record = this.records.get(release.generationId);
    if (record !== undefined) {
      const remaining = Math.max(
        0,
        (record.referencesByTag.get(release.tag) ?? 1) - 1
      );
      if (remaining === 0) record.referencesByTag.delete(release.tag);
      else record.referencesByTag.set(release.tag, remaining);
    }
    await this.retireIfUnused(release.generationId);
  }

  public switchGeneration(
    candidate: OutboundGenerationDescriptor,
    outbounds: ReadonlyMap<string, Outbound>
  ): string {
    if (this.records.has(candidate.id)) {
      throw new Error(`outbound runtime generation "${candidate.id}" already exists`);
    }
    validateRuntimeEntries(candidate, outbounds);
    const old = this.requireRecord(this.activeGenerationId);
    old.state = "draining";
    const sequence = old.sequence + 1;
    const record: RuntimeGenerationRecord = {
      generation: candidate,
      sequence,
      outbounds: readonlyMap(outbounds),
      referencesByTag: new Map(),
      state: "active"
    };
    this.records.set(candidate.id, record);
    this.activeGenerationId = candidate.id;
    for (const outbound of record.outbounds.values()) {
      this.options.onActivate?.(outbound);
    }
    return old.generation.id;
  }

  public restoreGeneration(
    oldGenerationId: string,
    candidateGenerationId: string
  ): void {
    const old = this.requireRecord(oldGenerationId);
    const candidate = this.requireRecord(candidateGenerationId);
    candidate.state = "draining";
    old.state = "active";
    this.activeGenerationId = oldGenerationId;
  }

  public markDraining(generationId: string): void {
    const record = this.requireRecord(generationId);
    if (generationId !== this.activeGenerationId) record.state = "draining";
  }

  public async retireIfUnused(generationId: string): Promise<boolean> {
    const record = this.records.get(generationId);
    if (
      record === undefined ||
      generationId === this.activeGenerationId ||
      record.generation.referenceCount > 0
    ) {
      return false;
    }
    this.records.delete(generationId);
    await Promise.all(
      [...record.outbounds.values()].map(async (outbound) => {
        await outbound.stop();
        this.options.onRetire?.(outbound);
      })
    );
    return true;
  }

  public recordRejectedUnsupported(): void {
    this.rejectedUnsupported += 1;
  }

  public activeReferenceTags(
    generationId = this.activeGenerationId
  ): readonly string[] {
    return [...this.requireRecord(generationId).referencesByTag.keys()];
  }

  public snapshot(): OutboundRuntimeRegistrySnapshot {
    const records = [...this.records.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map((record) => ({
        id: record.generation.id,
        sequence: record.sequence,
        state: record.state,
        referenceCount: record.generation.referenceCount,
        entries: [...record.generation.registrySnapshot.values()].map((entry) => ({
          tag: entry.tag,
          type: entry.type,
          configHash: entry.configHash,
          riskLevel: entry.riskLevel,
          experimental: entry.experimental,
          referenceCount: record.referencesByTag.get(entry.tag) ?? 0
        }))
      }));
    const active = this.requireRecord(this.activeGenerationId);
    return Object.freeze({
      activeGenerationId: active.generation.id,
      activeGenerationSequence: active.sequence,
      drainingGenerations: records.filter((record) => record.state === "draining").length,
      rejectedUnsupported: this.rejectedUnsupported,
      generations: Object.freeze(records.map((record) => Object.freeze({
        ...record,
        entries: Object.freeze(record.entries.map((entry) => Object.freeze(entry)))
      })))
    });
  }

  public async stopAll(): Promise<void> {
    const records = [...this.records.values()];
    this.records.clear();
    const stopped = new Set<Outbound>();
    for (const record of records) {
      for (const outbound of record.outbounds.values()) {
        if (stopped.has(outbound)) continue;
        stopped.add(outbound);
        await outbound.stop();
        this.options.onRetire?.(outbound);
      }
    }
  }

  private requireRecord(generationId: string): RuntimeGenerationRecord {
    const record = this.records.get(generationId);
    if (record === undefined) {
      throw new Error(`outbound runtime generation "${generationId}" is unavailable`);
    }
    return record;
  }
}

const validateRuntimeEntries = (
  generation: OutboundGenerationDescriptor,
  outbounds: ReadonlyMap<string, Outbound>
): void => {
  for (const tag of generation.outboundTags) {
    const outbound = outbounds.get(tag);
    if (outbound === undefined) {
      throw new Error(`outbound runtime generation is missing object "${tag}"`);
    }
    if (outbound.type !== generation.registrySnapshot.get(tag)?.type) {
      throw new Error(`outbound runtime generation type mismatch for "${tag}"`);
    }
  }
  if (outbounds.size !== generation.outboundTags.length) {
    throw new Error("outbound runtime generation contains unexpected objects");
  }
};

const readonlyMap = <Key, Value>(
  source: ReadonlyMap<Key, Value>
): ReadonlyMap<Key, Value> => new ReadonlyMapView([...source.entries()]);

class ReadonlyMapView<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #valuesByKey: Map<Key, Value>;

  public constructor(entries: readonly (readonly [Key, Value])[]) {
    this.#valuesByKey = new Map(entries);
    Object.freeze(this);
  }

  public get size(): number { return this.#valuesByKey.size; }
  public get(key: Key): Value | undefined { return this.#valuesByKey.get(key); }
  public has(key: Key): boolean { return this.#valuesByKey.has(key); }
  public entries(): MapIterator<[Key, Value]> { return this.#valuesByKey.entries(); }
  public keys(): MapIterator<Key> { return this.#valuesByKey.keys(); }
  public values(): MapIterator<Value> { return this.#valuesByKey.values(); }
  public forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#valuesByKey) {
      callbackfn.call(thisArg, value, key, this);
    }
  }
  public [Symbol.iterator](): MapIterator<[Key, Value]> { return this.entries(); }
}
