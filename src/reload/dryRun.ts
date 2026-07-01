import { createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { SepigsConfig } from "../config/types.js";
import type { ReloadComponentName } from "./types.js";

export type ReloadPlanAction =
  | "reuse"
  | "atomic-snapshot"
  | "stage-and-swap"
  | "drain-and-rebind"
  | "restart-listener"
  | "migrate-or-replace"
  | "best-effort-stage"
  | "restart-required";

export interface ReloadComponentPlan {
  readonly component: ReloadComponentName;
  readonly changed: boolean;
  readonly action: ReloadPlanAction;
  readonly rollback: "supported" | "best-effort" | "restart-required";
  readonly opensListenerDuringPrepare: boolean;
  readonly affectsExistingConnections: boolean;
  readonly note: string;
}

export interface DryRunReloadPlan {
  readonly generatedAt: string;
  readonly currentConfigPath: string;
  readonly candidateConfigPath: string;
  readonly currentConfigHash: string;
  readonly candidateConfigHash: string;
  readonly configHashScope: "run-local-hmac";
  readonly changedComponents: readonly ReloadComponentName[];
  readonly components: readonly ReloadComponentPlan[];
  readonly sideEffects: {
    readonly runtimeMutated: false;
    readonly listenersOpened: 0;
    readonly connectionsClosed: 0;
  };
}

interface ComponentDefinition {
  readonly name: ReloadComponentName;
  readonly currentValue: unknown;
  readonly candidateValue: unknown;
  readonly changedAction: Exclude<ReloadPlanAction, "reuse">;
  readonly rollback: ReloadComponentPlan["rollback"];
  readonly opensListenerDuringPrepare: boolean;
  readonly affectsExistingConnections: boolean;
  readonly note: string;
}

export const createDryRunReloadPlan = (
  current: SepigsConfig,
  candidate: SepigsConfig,
  paths: { readonly currentConfigPath: string; readonly candidateConfigPath: string }
): DryRunReloadPlan => {
  const hashKey = randomBytes(32);
  const definitions = componentDefinitions(current, candidate);
  const components = definitions.map((definition): ReloadComponentPlan => {
    const changed = stableJson(definition.currentValue) !== stableJson(definition.candidateValue);
    return {
      component: definition.name,
      changed,
      action: changed ? definition.changedAction : "reuse",
      rollback: changed ? definition.rollback : "supported",
      opensListenerDuringPrepare: changed && definition.opensListenerDuringPrepare,
      affectsExistingConnections: changed && definition.affectsExistingConnections,
      note: definition.note
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    currentConfigPath: paths.currentConfigPath,
    candidateConfigPath: paths.candidateConfigPath,
    currentConfigHash: configHash(current, hashKey),
    candidateConfigHash: configHash(candidate, hashKey),
    configHashScope: "run-local-hmac",
    changedComponents: components.filter((component) => component.changed).map((component) => component.component),
    components,
    sideEffects: {
      runtimeMutated: false,
      listenersOpened: 0,
      connectionsClosed: 0
    }
  };
};

export const loadDryRunReloadPlan = async (
  candidatePath: string,
  currentPath = "examples/sepigs.json"
): Promise<DryRunReloadPlan> => {
  const [current, candidate] = await Promise.all([loadConfig(currentPath), loadConfig(candidatePath)]);
  return createDryRunReloadPlan(current, candidate, {
    currentConfigPath: currentPath,
    candidateConfigPath: candidatePath
  });
};

const componentDefinitions = (current: SepigsConfig, candidate: SepigsConfig): readonly ComponentDefinition[] => [
  definition("dns", withoutFakeIp(current.dns), withoutFakeIp(candidate.dns), "stage-and-swap", "supported", false, false,
    "Candidate resolver and caches must remain isolated until snapshot publication."),
  definition("fake-ip-store", current.dns.fakeIp, candidate.dns.fakeIp, "migrate-or-replace", "best-effort", false, true,
    "Compatible stores may be reused; range or persistence changes require explicit mapping migration."),
  definition("router", { route: withoutPolicies(current.route), geo: current.geo }, { route: withoutPolicies(candidate.route), geo: candidate.geo },
    "atomic-snapshot", "supported", false, false, "New requests use the published router snapshot; established streams keep their route."),
  definition("policy-prober", { policies: current.route.policies, probing: current.probing },
    { policies: candidate.route.policies, probing: candidate.probing }, "stage-and-swap", "supported", false, false,
    "Health and backoff migration must be keyed by unchanged outbound tags."),
  definition("outbound-registry", { outbounds: current.outbounds, pool: current.connectionPool },
    { outbounds: candidate.outbounds, pool: candidate.connectionPool }, "stage-and-swap", "best-effort", false, false,
    "Existing streams retain their outbound object; only new selection switches generation."),
  definition("inbound-listeners", { inbounds: current.inbounds, limits: inboundLimits(current) },
    { inbounds: candidate.inbounds, limits: inboundLimits(candidate) }, "drain-and-rebind", "best-effort", true, false,
    "Changed listeners prepare before old listeners drain; same-address replacement needs a bounded gap strategy."),
  definition("dashboard-server", current.dashboard, candidate.dashboard, "restart-listener", "best-effort", true, false,
    "Token and listener changes must not expose the old or new control plane without authentication."),
  definition("metrics-server", current.observability.metrics, candidate.observability.metrics, "restart-listener", "best-effort", true, false,
    "A port conflict must leave the previous metrics endpoint available."),
  definition("plugin-manager", current.plugins, candidate.plugins, "best-effort-stage", "best-effort", false, true,
    "Plugin setup and owner-scoped factories need isolated staging; irreversible plugin side effects require restart."),
  definition("connection-manager", connectionLimits(current), connectionLimits(candidate), "restart-required", "restart-required", false, true,
    "The current limiter and timeout ownership are immutable; runtime mutation is outside M3."),
  definition("udp-session-manager", udpLimits(current), udpLimits(candidate), "restart-required", "restart-required", false, true,
    "Existing UDP sessions retain their manager and timers; limit changes require a later generation-aware implementation.")
];

const definition = (
  name: ReloadComponentName,
  currentValue: unknown,
  candidateValue: unknown,
  changedAction: Exclude<ReloadPlanAction, "reuse">,
  rollback: ReloadComponentPlan["rollback"],
  opensListenerDuringPrepare: boolean,
  affectsExistingConnections: boolean,
  note: string
): ComponentDefinition => ({
  name,
  currentValue,
  candidateValue,
  changedAction,
  rollback,
  opensListenerDuringPrepare,
  affectsExistingConnections,
  note
});

const withoutFakeIp = (dns: SepigsConfig["dns"]): unknown => ({
  strategy: dns.strategy,
  cacheTtlMs: dns.cacheTtlMs,
  cacheMaxEntries: dns.cacheMaxEntries,
  negativeTtlMs: dns.negativeTtlMs,
  hosts: dns.hosts,
  udpServers: dns.udpServers,
  rules: dns.rules,
  fallbackHosts: dns.fallbackHosts,
  doh: dns.doh
});

const withoutPolicies = (route: SepigsConfig["route"]): unknown => ({
  defaultOutbound: route.defaultOutbound,
  rules: route.rules,
  ruleSetFiles: route.ruleSetFiles
});

const inboundLimits = (config: SepigsConfig): unknown => ({
  connectTimeoutMs: config.limits.connectTimeoutMs,
  handshakeTimeoutMs: config.limits.handshakeTimeoutMs,
  idleTimeoutMs: config.limits.idleTimeoutMs,
  maxHeaderBytes: config.limits.maxHeaderBytes
});

const connectionLimits = (config: SepigsConfig): unknown => ({
  maxConnections: config.limits.maxConnections,
  handshakeTimeoutMs: config.limits.handshakeTimeoutMs,
  idleTimeoutMs: config.limits.idleTimeoutMs
});

const udpLimits = (config: SepigsConfig): unknown => ({
  maxUdpSessions: config.limits.maxUdpSessions,
  udpIdleTimeoutMs: config.limits.udpIdleTimeoutMs
});

const configHash = (config: SepigsConfig, key: Buffer): string =>
  createHmac("sha256", key).update(stableJson(config)).digest("hex");

const stableJson = (value: unknown): string => JSON.stringify(sortValue(value));

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)])
  );
};

const renderMarkdown = (plan: DryRunReloadPlan): string => [
  "# Reload Dry-Run Plan",
  "",
  `- Generated: ${plan.generatedAt}`,
  `- Current config: \`${plan.currentConfigPath}\``,
  `- Candidate config: \`${plan.candidateConfigPath}\``,
  `- Current hash: \`${plan.currentConfigHash}\``,
  `- Candidate hash: \`${plan.candidateConfigHash}\``,
  "- Hash scope: run-local keyed HMAC; values are not comparable across runs",
  `- Changed components: ${plan.changedComponents.length === 0 ? "none" : plan.changedComponents.join(", ")}`,
  "- Runtime mutated: no",
  "- Listeners opened: 0",
  "- Connections closed: 0",
  "",
  "| Component | Changed | Planned action | Rollback | Prepare listener | Existing connections | Note |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...plan.components.map((component) =>
    `| ${component.component} | ${component.changed ? "yes" : "no"} | ${component.action} | ${component.rollback} | ${component.opensListenerDuringPrepare ? "yes" : "no"} | ${component.affectsExistingConnections ? "yes" : "no"} | ${component.note.replaceAll("|", "\\|")} |`
  ),
  "",
  "This report performs file loading, parsing, schema validation, hashing, and planning only.",
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const candidatePath = argument("--config");
  if (candidatePath === undefined) throw new Error("reload dry-run requires --config <path>");
  const currentPath = argument("--current-config") ?? process.env.SEPIGS_CURRENT_CONFIG ?? "examples/sepigs.json";
  const plan = await loadDryRunReloadPlan(candidatePath, currentPath);
  await mkdir("reports/reload", { recursive: true });
  await Promise.all([
    writeFile("reports/reload/dry-run-latest.json", `${JSON.stringify(plan, null, 2)}\n`, "utf8"),
    writeFile("reports/reload/dry-run-latest.md", renderMarkdown(plan), "utf8")
  ]);
  console.log(`reload dry-run passed: ${String(plan.changedComponents.length)} changed components; no runtime side effects`);
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`reload dry-run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
