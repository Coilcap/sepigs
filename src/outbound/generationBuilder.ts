import type {
  OutboundConfig,
  SepigsConfig
} from "../config/types.js";
import type { OutboundHealthSnapshot } from "../router/policy.js";
import {
  OutboundGeneration,
  stableOutboundJson
} from "./generation.js";
import type {
  OutboundGenerationBuildResult,
  OutboundGenerationDiff,
  OutboundModifiedEntry,
  OutboundRename
} from "./generationTypes.js";
import { validateOutboundGeneration } from "./generationValidator.js";

export interface BuildOutboundGenerationOptions {
  readonly id: string;
  readonly currentOutbounds: readonly OutboundConfig[];
  readonly candidateConfig: SepigsConfig;
  readonly currentPolicies?: SepigsConfig["route"]["policies"];
  readonly healthSnapshot?: readonly OutboundHealthSnapshot[];
  readonly activeReferenceTags?: readonly string[];
  readonly parentGenerationId?: string;
  readonly allowExperimental?: boolean;
  readonly createdAt?: number;
}

export const buildOutboundGeneration = (
  options: BuildOutboundGenerationOptions
): OutboundGenerationBuildResult => {
  const diff = diffOutboundConfigs(
    options.currentOutbounds,
    options.candidateConfig.outbounds,
    options.candidateConfig
  );
  const validation = validateOutboundGeneration({
    outbounds: options.candidateConfig.outbounds,
    defaultOutbound: options.candidateConfig.route.defaultOutbound,
    policies: options.candidateConfig.route.policies,
    activePolicies: options.currentPolicies ?? [],
    diff,
    activeReferenceTags: options.activeReferenceTags ?? [],
    ...(options.allowExperimental === undefined
      ? {}
      : { allowExperimental: options.allowExperimental })
  });
  const generation = new OutboundGeneration({
    id: options.id,
    outbounds: options.candidateConfig.outbounds,
    defaultOutbound: options.candidateConfig.route.defaultOutbound,
    policies: options.candidateConfig.route.policies,
    state: "candidate",
    ...(options.healthSnapshot === undefined
      ? {}
      : { healthSnapshot: options.healthSnapshot }),
    ...(options.parentGenerationId === undefined
      ? {}
      : { parentGenerationId: options.parentGenerationId }),
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt })
  });
  return Object.freeze({ generation, diff, validation });
};

export const diffOutboundConfigs = (
  current: readonly OutboundConfig[],
  candidate: readonly OutboundConfig[],
  candidateConfig?: SepigsConfig
): OutboundGenerationDiff => {
  const currentByTag = new Map(current.map((item) => [item.tag, item]));
  const candidateByTag = new Map(candidate.map((item) => [item.tag, item]));
  const removedCandidates = current.filter((item) => !candidateByTag.has(item.tag));
  const addedCandidates = candidate.filter((item) => !currentByTag.has(item.tag));
  const renamed: OutboundRename[] = [];
  const consumedAdded = new Set<string>();
  const consumedRemoved = new Set<string>();

  for (const oldConfig of removedCandidates) {
    const replacement = addedCandidates.find(
      (item) =>
        !consumedAdded.has(item.tag) &&
        item.type === oldConfig.type &&
        stableOutboundJson(withoutTag(item)) ===
          stableOutboundJson(withoutTag(oldConfig))
    );
    if (replacement === undefined) continue;
    consumedRemoved.add(oldConfig.tag);
    consumedAdded.add(replacement.tag);
    renamed.push({
      from: oldConfig.tag,
      to: replacement.tag,
      type: replacement.type
    });
  }

  const modified: OutboundModifiedEntry[] = [];
  const typeChanged: string[] = [];
  const targetChanged: string[] = [];
  const secretChanged: string[] = [];
  for (const next of candidate) {
    const previous = currentByTag.get(next.tag);
    if (previous === undefined || stableOutboundJson(previous) === stableOutboundJson(next)) {
      continue;
    }
    const fields = changedFields(previous, next);
    modified.push({ tag: next.tag, changedFields: fields });
    if (previous.type !== next.type) typeChanged.push(next.tag);
    if (targetIdentity(previous) !== targetIdentity(next)) targetChanged.push(next.tag);
    if (secretIdentity(previous) !== secretIdentity(next)) secretChanged.push(next.tag);
  }

  const policyReferencedTags = policyReferences(candidate, candidateConfig);
  const candidateTags = new Set(candidate.map((item) => item.tag));
  const missingPolicyReferences = Object.keys(policyReferencedTags).filter(
    (tag) => !candidateTags.has(tag)
  );
  for (const tag of candidateTags) {
    if (!(tag in policyReferencedTags)) policyReferencedTags[tag] = [];
  }

  return freezeDiff({
    added: addedCandidates
      .filter((item) => !consumedAdded.has(item.tag))
      .map((item) => item.tag),
    removed: removedCandidates
      .filter((item) => !consumedRemoved.has(item.tag))
      .map((item) => item.tag),
    modified,
    renamed,
    typeChanged,
    targetChanged,
    secretChanged,
    policyReferencedTags,
    missingPolicyReferences
  });
};

const changedFields = (
  previous: OutboundConfig,
  candidate: OutboundConfig
): readonly string[] => {
  const previousRecord = previous as unknown as Readonly<Record<string, unknown>>;
  const candidateRecord = candidate as unknown as Readonly<Record<string, unknown>>;
  return [...new Set([...Object.keys(previousRecord), ...Object.keys(candidateRecord)])]
    .filter(
      (key) =>
        stableOutboundJson(previousRecord[key]) !==
        stableOutboundJson(candidateRecord[key])
    )
    .map((key) => isSecretField(key) ? `${key}:[REDACTED]` : key)
    .sort();
};

const withoutTag = (
  config: OutboundConfig
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== "tag")
  );

const targetIdentity = (config: OutboundConfig): string => {
  if (config.type === "tcpRelay") {
    return `${config.type}:${config.targetHost}:${String(config.targetPort)}`;
  }
  if (config.type === "shadowsocks" || config.type === "trojan") {
    return `${config.type}:${config.serverHost}:${String(config.serverPort)}`;
  }
  return config.type;
};

const secretIdentity = (config: OutboundConfig): string => {
  if (config.type === "shadowsocks") {
    return stableOutboundJson({ method: config.method, password: config.password });
  }
  if (config.type === "trojan") {
    return stableOutboundJson({
      password: config.password,
      tls: config.tls
    });
  }
  if (config.type === "wireguard") {
    return stableOutboundJson({
      privateKey: config.privateKey,
      peer: config.peer.publicKey
    });
  }
  return "";
};

const policyReferences = (
  outbounds: readonly OutboundConfig[],
  config?: SepigsConfig
): Record<string, readonly string[]> => {
  const references: Record<string, string[]> = {};
  if (config === undefined) {
    for (const outbound of outbounds) references[outbound.tag] = [];
    return references;
  }
  const add = (tag: string, source: string): void => {
    const current = references[tag] ?? [];
    if (!current.includes(source)) current.push(source);
    references[tag] = current;
  };
  add(config.route.defaultOutbound, "default");
  for (const rule of config.route.rules) add(rule.outboundTag, rule.tag ?? "rule");
  for (const policy of config.route.policies) {
    for (const tag of policy.outbounds) add(tag, `policy:${policy.tag}`);
  }
  return references;
};

const isSecretField = (key: string): boolean =>
  /password|token|secret|privatekey|presharedkey/iu.test(key);

const freezeDiff = (
  diff: OutboundGenerationDiff
): OutboundGenerationDiff => {
  for (const item of diff.modified) Object.freeze(item.changedFields);
  for (const references of Object.values(diff.policyReferencedTags)) {
    Object.freeze(references);
  }
  return Object.freeze({
    ...diff,
    added: Object.freeze([...diff.added]),
    removed: Object.freeze([...diff.removed]),
    modified: Object.freeze([...diff.modified.map((item) => Object.freeze(item))]),
    renamed: Object.freeze([...diff.renamed.map((item) => Object.freeze(item))]),
    typeChanged: Object.freeze([...diff.typeChanged]),
    targetChanged: Object.freeze([...diff.targetChanged]),
    secretChanged: Object.freeze([...diff.secretChanged]),
    policyReferencedTags: Object.freeze({ ...diff.policyReferencedTags }),
    missingPolicyReferences: Object.freeze([...diff.missingPolicyReferences])
  });
};
