import type {
  OutboundConfig,
  RoutingPolicyConfig
} from "../config/types.js";
import {
  isExperimentalType,
  riskLevelFor
} from "./generation.js";
import type {
  OutboundGenerationDiff,
  OutboundRiskSummary,
  OutboundValidationIssue,
  OutboundValidationResult
} from "./generationTypes.js";

const SUPPORTED_TYPES = new Set([
  "direct",
  "block",
  "tcpRelay",
  "shadowsocks",
  "trojan",
  "wireguard"
]);

const SUPPORTED_SHADOWSOCKS_CIPHERS = new Set([
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305"
]);

export interface ValidateOutboundGenerationOptions {
  readonly outbounds: readonly OutboundConfig[];
  readonly defaultOutbound: string;
  readonly policies: readonly RoutingPolicyConfig[];
  readonly activePolicies?: readonly RoutingPolicyConfig[];
  readonly diff?: OutboundGenerationDiff;
  readonly activeReferenceTags?: readonly string[];
  readonly allowExperimental?: boolean;
}

export const validateOutboundGeneration = (
  options: ValidateOutboundGenerationOptions
): OutboundValidationResult => {
  const errors: OutboundValidationIssue[] = [];
  const warnings: OutboundValidationIssue[] = [];
  const unsupported = new Set<string>();
  const tags = new Set<string>();

  for (const outbound of options.outbounds) {
    validateTag(outbound, tags, errors);
    validateType(outbound, options.allowExperimental === true, errors, warnings, unsupported);
    validateFields(outbound, errors, warnings);
  }

  const policyTags = new Set(options.policies.map((policy) => policy.tag));
  if (!tags.has(options.defaultOutbound) && !policyTags.has(options.defaultOutbound)) {
    errors.push({
      code: "missing-default-outbound",
      message: `default outbound or policy "${options.defaultOutbound}" is missing`
    });
  }
  validatePolicies(options.policies, tags, errors);

  const removed = new Set(options.diff?.removed ?? []);
  for (const policy of options.activePolicies ?? []) {
    for (const tag of policy.outbounds) {
      if (removed.has(tag)) {
        warnings.push({
          code: "removed-active-policy-reference",
          tag,
          message: `removed outbound "${tag}" remains referenced by active policy "${policy.tag}" and must drain`
        });
      }
    }
  }
  for (const tag of options.activeReferenceTags ?? []) {
    if (removed.has(tag)) {
      warnings.push({
        code: "removed-active-connection-reference",
        tag,
        message: `removed outbound "${tag}" has an active generation reference and cannot be force-closed`
      });
    }
  }

  for (const tag of options.diff?.secretChanged ?? []) {
    warnings.push({
      code: "secret-identity-changed",
      tag,
      message: `outbound "${tag}" secret identity changed: [REDACTED]`
    });
  }
  for (const tag of options.diff?.typeChanged ?? []) {
    unsupported.add(`outbound "${tag}" changes type and requires remove/add staging`);
  }

  const riskSummary = summarizeRisk(options.outbounds);
  return Object.freeze({
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    riskSummary,
    requiresRuntimeRestart:
      errors.length > 0 ||
      riskSummary.high > 0 ||
      riskSummary.medium > 0 ||
      unsupported.size > 0,
    unsupportedChanges: Object.freeze([...unsupported])
  });
};

const validateTag = (
  outbound: OutboundConfig,
  tags: Set<string>,
  errors: OutboundValidationIssue[]
): void => {
  if (outbound.tag.trim().length === 0) {
    errors.push({ code: "empty-tag", message: "outbound tag must not be empty" });
    return;
  }
  if (tags.has(outbound.tag)) {
    errors.push({
      code: "duplicate-tag",
      tag: outbound.tag,
      message: `duplicate outbound tag "${outbound.tag}"`
    });
  }
  tags.add(outbound.tag);
};

const validateType = (
  outbound: OutboundConfig,
  allowExperimental: boolean,
  errors: OutboundValidationIssue[],
  warnings: OutboundValidationIssue[],
  unsupported: Set<string>
): void => {
  if (!SUPPORTED_TYPES.has(outbound.type)) {
    errors.push({
      code: "unsupported-type",
      tag: outbound.tag,
      message: `outbound "${outbound.tag}" uses unsupported prototype type "${outbound.type}"`
    });
    unsupported.add(`plugin or unknown outbound "${outbound.tag}" is outside M10`);
    return;
  }
  if (isExperimentalType(outbound.type)) {
    unsupported.add(`experimental outbound "${outbound.tag}" is outside M10`);
    if (!allowExperimental) {
      errors.push({
        code: "experimental-not-enabled",
        tag: outbound.tag,
        message: `experimental outbound "${outbound.tag}" requires explicit prototype opt-in`
      });
    } else {
      warnings.push({
        code: "experimental-outbound",
        tag: outbound.tag,
        message: `experimental outbound "${outbound.tag}" remains unsupported for runtime reload`
      });
    }
  }
};

const validateFields = (
  outbound: OutboundConfig,
  errors: OutboundValidationIssue[],
  warnings: OutboundValidationIssue[]
): void => {
  if (outbound.type === "direct") {
    validateAllowedKeys(outbound, ["type", "tag", "connectTimeoutMs", "idleTimeoutMs"], errors);
    return;
  }
  if (outbound.type === "block") {
    validateAllowedKeys(outbound, ["type", "tag", "connectTimeoutMs", "idleTimeoutMs", "reason"], errors);
    return;
  }
  if (outbound.type === "tcpRelay") {
    validateHostPort(outbound.tag, outbound.targetHost, outbound.targetPort, "TCP relay", errors);
    return;
  }
  if (outbound.type === "shadowsocks") {
    validateHostPort(outbound.tag, outbound.serverHost, outbound.serverPort, "Shadowsocks", errors);
    if (!SUPPORTED_SHADOWSOCKS_CIPHERS.has(outbound.method)) {
      errors.push({
        code: "unsupported-shadowsocks-cipher",
        tag: outbound.tag,
        message: `outbound "${outbound.tag}" uses unsupported Shadowsocks cipher "${outbound.method}"`
      });
    }
    if (outbound.password.length === 0) {
      errors.push({
        code: "missing-shadowsocks-password",
        tag: outbound.tag,
        message: `outbound "${outbound.tag}" requires a non-empty password`
      });
    }
    return;
  }
  if (outbound.type === "trojan") {
    validateHostPort(outbound.tag, outbound.serverHost, outbound.serverPort, "Trojan", errors);
    if (outbound.password.length === 0) {
      errors.push({
        code: "missing-trojan-password",
        tag: outbound.tag,
        message: `outbound "${outbound.tag}" requires a non-empty password`
      });
    }
    if (
      outbound.tls.serverName !== undefined &&
      outbound.tls.serverName.trim().length === 0
    ) {
      errors.push({
        code: "invalid-trojan-server-name",
        tag: outbound.tag,
        message: `outbound "${outbound.tag}" has an empty TLS serverName`
      });
    }
    if (outbound.tls.enabled && outbound.tls.serverName === undefined) {
      warnings.push({
        code: "trojan-server-name-default",
        tag: outbound.tag,
        message: `outbound "${outbound.tag}" uses serverHost as TLS serverName`
      });
    }
  }
};

const validateAllowedKeys = (
  outbound: OutboundConfig,
  allowed: readonly string[],
  errors: OutboundValidationIssue[]
): void => {
  const unexpected = Object.keys(outbound).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    errors.push({
      code: "dangerous-extra-fields",
      tag: outbound.tag,
      message: `outbound "${outbound.tag}" has unsupported fields: ${unexpected.join(", ")}`
    });
  }
};

const validateHostPort = (
  tag: string,
  host: string,
  port: number,
  label: string,
  errors: OutboundValidationIssue[]
): void => {
  if (host.trim().length === 0 || /\s/u.test(host)) {
    errors.push({
      code: "invalid-target-host",
      tag,
      message: `${label} outbound "${tag}" has an invalid target host`
    });
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push({
      code: "invalid-target-port",
      tag,
      message: `${label} outbound "${tag}" has an invalid target port`
    });
  }
};

const validatePolicies = (
  policies: readonly RoutingPolicyConfig[],
  tags: ReadonlySet<string>,
  errors: OutboundValidationIssue[]
): void => {
  for (const policy of policies) {
    for (const tag of policy.outbounds) {
      if (!tags.has(tag)) {
        errors.push({
          code: "missing-policy-outbound",
          tag,
          message: `policy "${policy.tag}" references missing outbound "${tag}"`
        });
      }
    }
  }
};

const summarizeRisk = (
  outbounds: readonly OutboundConfig[]
): OutboundRiskSummary => {
  const summary = { low: 0, medium: 0, high: 0 };
  for (const outbound of outbounds) summary[riskLevelFor(outbound.type)] += 1;
  return Object.freeze({
    ...summary,
    highest:
      summary.high > 0
        ? "high"
        : summary.medium > 0
          ? "medium"
          : summary.low > 0
            ? "low"
            : "none"
  });
};
