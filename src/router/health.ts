export interface HealthSample {
  readonly tag: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly timestamp: number;
}

export interface HealthSnapshot {
  readonly tag: string;
  readonly samples: number;
  readonly failures: number;
  readonly failureRate: number;
  readonly averageLatencyMs?: number;
  readonly jitterMs?: number;
  readonly lastProbeAt?: number;
}

interface HealthBucket {
  readonly tag: string;
  samples: HealthSample[];
}

export class HealthStore {
  private readonly maxSamples: number;
  private readonly buckets = new Map<string, HealthBucket>();

  public constructor(maxSamples = 64) {
    this.maxSamples = maxSamples;
  }

  public record(sample: HealthSample): void {
    const bucket = this.getBucket(sample.tag);
    bucket.samples.push(sample);
    if (bucket.samples.length > this.maxSamples) {
      bucket.samples.splice(0, bucket.samples.length - this.maxSamples);
    }
  }

  public snapshot(tag: string): HealthSnapshot {
    return this.snapshotBucket(this.getBucket(tag));
  }

  public snapshots(): readonly HealthSnapshot[] {
    return [...this.buckets.values()].map((bucket) => this.snapshotBucket(bucket));
  }

  private snapshotBucket(bucket: HealthBucket): HealthSnapshot {
    const samples = bucket.samples;
    const failures = samples.filter((sample) => !sample.ok).length;
    const successfulLatencies = samples.filter((sample) => sample.ok).map((sample) => sample.latencyMs);
    const averageLatencyMs =
      successfulLatencies.length === 0
        ? undefined
        : successfulLatencies.reduce((total, latency) => total + latency, 0) / successfulLatencies.length;
    const jitterMs =
      averageLatencyMs === undefined || successfulLatencies.length < 2
        ? undefined
        : Math.sqrt(
            successfulLatencies.reduce((total, latency) => total + (latency - averageLatencyMs) ** 2, 0) / successfulLatencies.length
          );
    const lastProbeAt = samples.at(-1)?.timestamp;
    return {
      tag: bucket.tag,
      samples: samples.length,
      failures,
      failureRate: samples.length === 0 ? 0 : failures / samples.length,
      ...(averageLatencyMs === undefined ? {} : { averageLatencyMs }),
      ...(jitterMs === undefined ? {} : { jitterMs }),
      ...(lastProbeAt === undefined ? {} : { lastProbeAt })
    };
  }

  private getBucket(tag: string): HealthBucket {
    const existing = this.buckets.get(tag);
    if (existing !== undefined) {
      return existing;
    }
    const created: HealthBucket = { tag, samples: [] };
    this.buckets.set(tag, created);
    return created;
  }
}
