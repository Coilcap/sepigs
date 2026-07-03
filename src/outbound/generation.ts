import { createHmac, randomBytes } from "node:crypto";
import type {
  OutboundConfig,
  RoutingPolicyConfig
} from "../config/types.js";
import type { OutboundHealthSnapshot } from "../router/policy.js";
import type {
  OutboundCapabilities,
  OutboundGenerationDescriptor,
  OutboundGenerationEntry,
  OutboundGenerationState,
  OutboundPolicyBindingSnapshot,
  OutboundRiskLevel
} from "./generationTypes.js";

const HASH_KEY = randomBytes(32);

export interface CreateOutboundGenerationOptions {
  readonly id: string;
  readonly outbounds: readonly OutboundConfig[];
  readonly defaultOutbound: string;
  readonly policies: readonly RoutingPolicyConfig[];
  readonly healthSnapshot?: readonly OutboundHealthSnapshot[];
  readonly state: OutboundGenerationState;
  readonly parentGenerationId?: string;
  readonly createdAt?: number;
}

interface UsageState {
  references: number;
}

export class OutboundGeneration implements OutboundGenerationDescriptor {
  public readonly id: string;
  public readonly configHash: string;
  public readonly createdAt: number;
  public readonly registrySnapshot: ReadonlyMap<string, OutboundGenerationEntry>;
  public readonly outboundTags: readonly string[];
  public readonly outboundTypes: Readonly<Record<string, OutboundConfig["type"]>>;
  public readonly policyBindingSnapshot: Readonly<OutboundPolicyBindingSnapshot>;
  public readonly healthSnapshot: readonly OutboundHealthSnapshot[];
  public readonly readonly = true as const;
  public readonly state: OutboundGenerationState;
  public readonly parentGenerationId: string | undefined;
  readonly #usage: UsageState = { references: 0 };

  public constructor(options: CreateOutboundGenerationOptions) {
    assertUniqueTags(options.outbounds);
    this.id = options.id;
    this.createdAt = options.createdAt ?? Date.now();
    this.state = options.state;
    this.parentGenerationId = options.parentGenerationId;
    const entries = options.outbounds.map(createOutboundGenerationEntry);
    this.registrySnapshot = readonlyMap(entries.map((entry) => [entry.tag, entry]));
    this.outboundTags = Object.freeze(entries.map((entry) => entry.tag));
    this.outboundTypes = freezeValue(
      Object.fromEntries(entries.map((entry) => [entry.tag, entry.type]))
    ) as Readonly<Record<string, OutboundConfig["type"]>>;
    this.policyBindingSnapshot = freezeValue({
      defaultOutbound: options.defaultOutbound,
      policies: structuredClone(options.policies)
    }) as Readonly<OutboundPolicyBindingSnapshot>;
    this.healthSnapshot = freezeValue(
      structuredClone(options.healthSnapshot ?? [])
    ) as readonly OutboundHealthSnapshot[];
    this.configHash = keyedHash({
      entries: entries.map((entry) => ({
        tag: entry.tag,
        type: entry.type,
        configHash: entry.configHash
      })),
      policyBindingSnapshot: this.policyBindingSnapshot
    });
    Object.freeze(this);
  }

  public get referenceCount(): number {
    return this.#usage.references;
  }

  public acquire(): () => void {
    this.#usage.references += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#usage.references = Math.max(0, this.#usage.references - 1);
    };
  }
}

export const createOutboundGenerationEntry = (
  config: OutboundConfig
): OutboundGenerationEntry => {
  const configSnapshot = redactOutboundConfig(config);
  return Object.freeze({
    tag: config.tag,
    type: config.type,
    configHash: keyedHash(config),
    configSnapshot,
    capabilities: Object.freeze(capabilitiesFor(config.type)),
    riskLevel: riskLevelFor(config.type),
    experimental: isExperimentalType(config.type),
    dependencies: Object.freeze(dependenciesFor(config.type))
  });
};

export const riskLevelFor = (
  type: OutboundConfig["type"]
): OutboundRiskLevel => {
  if (type === "direct" || type === "block" || type === "tcpRelay") {
    return "low";
  }
  if (type === "shadowsocks" || type === "trojan") return "medium";
  return "high";
};

export const isExperimentalType = (
  type: OutboundConfig["type"]
): boolean =>
  type !== "direct" &&
  type !== "block" &&
  type !== "tcpRelay" &&
  type !== "shadowsocks" &&
  type !== "trojan";

export const redactOutboundConfig = (
  config: OutboundConfig
): Readonly<Record<string, unknown>> =>
  freezeValue(redactValue(structuredClone(config))) as Readonly<
    Record<string, unknown>
  >;

export const outboundConfigHash = (config: OutboundConfig): string =>
  keyedHash(config);

const assertUniqueTags = (outbounds: readonly OutboundConfig[]): void => {
  const tags = new Set<string>();
  for (const outbound of outbounds) {
    if (tags.has(outbound.tag)) {
      throw new Error(`outbound generation contains duplicate tag "${outbound.tag}"`);
    }
    tags.add(outbound.tag);
  }
};

const capabilitiesFor = (
  type: OutboundConfig["type"]
): OutboundCapabilities => {
  if (type === "direct" || type === "block") {
    return { tcp: true, udp: true, stateless: true };
  }
  if (type === "tcpRelay" || type === "trojan") {
    return { tcp: true, udp: false, stateless: true };
  }
  if (type === "shadowsocks") {
    return { tcp: true, udp: true, stateless: false };
  }
  return { tcp: false, udp: false, stateless: false };
};

const dependenciesFor = (
  type: OutboundConfig["type"]
): readonly string[] => {
  if (type === "direct") return ["dns", "policy"];
  if (type === "block") return ["policy"];
  if (type === "tcpRelay") return ["policy", "tcp-transport"];
  if (type === "shadowsocks") return ["policy", "crypto", "tcp-transport", "udp"];
  if (type === "trojan") return ["policy", "tls", "tcp-transport"];
  return ["experimental-runtime"];
};

const redactValue = (value: unknown, key = ""): unknown => {
  if (Array.isArray(value)) return value.map((child) => redactValue(child));
  if (typeof value !== "object" || value === null) {
    return isSecretKey(key) ? "[REDACTED]" : value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      redactValue(child, childKey)
    ])
  );
};

const isSecretKey = (key: string): boolean =>
  /password|token|secret|privatekey|presharedkey/iu.test(key);

const keyedHash = (value: unknown): string =>
  createHmac("sha256", HASH_KEY).update(stableJson(value)).digest("hex");

export const stableOutboundJson = (value: unknown): string =>
  stableJson(value);

const stableJson = (value: unknown): string =>
  JSON.stringify(sortValue(value));

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)])
  );
};

const freezeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    for (const child of value) freezeValue(child);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freezeValue(child);
    return Object.freeze(value);
  }
  return value;
};

const readonlyMap = <Key, Value>(
  entries: readonly (readonly [Key, Value])[]
): ReadonlyMap<Key, Value> => new ReadonlyMapView(entries);

class ReadonlyMapView<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #valuesByKey: Map<Key, Value>;

  public constructor(entries: readonly (readonly [Key, Value])[]) {
    this.#valuesByKey = new Map(entries);
    Object.freeze(this);
  }

  public get size(): number {
    return this.#valuesByKey.size;
  }

  public get(key: Key): Value | undefined {
    return this.#valuesByKey.get(key);
  }

  public has(key: Key): boolean {
    return this.#valuesByKey.has(key);
  }

  public entries(): MapIterator<[Key, Value]> {
    return this.#valuesByKey.entries();
  }

  public keys(): MapIterator<Key> {
    return this.#valuesByKey.keys();
  }

  public values(): MapIterator<Value> {
    return this.#valuesByKey.values();
  }

  public forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#valuesByKey) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  public [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries();
  }
}
