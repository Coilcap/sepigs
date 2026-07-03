import { createHash } from "node:crypto";
import type { ProxyRequest } from "../protocol/types.js";
import type { RouteRuleConfig, RouterConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";
import { Router, type RouteResult } from "./router.js";

export interface RouterGenerationOptions {
  readonly id: string;
  readonly sequence: number;
  readonly config: RouterConfig;
  readonly allowedTargets: ReadonlySet<string>;
  readonly createdAt?: number;
}

export class RouterGeneration {
  public readonly id: string;
  public readonly sequence: number;
  public readonly configHash: string;
  public readonly createdAt: number;
  public readonly rules: readonly RouteRuleConfig[];
  public readonly defaultOutbound: string;
  public readonly routeCachePolicy = "none" as const;
  private readonly router: Router;

  public constructor(options: RouterGenerationOptions) {
    validateTargets(options.config, options.allowedTargets);
    this.id = options.id;
    this.sequence = options.sequence;
    this.createdAt = options.createdAt ?? Date.now();
    this.rules = freezeValue(structuredClone(options.config.rules)) as readonly RouteRuleConfig[];
    this.defaultOutbound = options.config.defaultOutbound;
    this.configHash = createHash("sha256").update(stableJson({
      defaultOutbound: this.defaultOutbound,
      rules: this.rules,
      ruleSetFiles: options.config.ruleSetFiles
    })).digest("hex");
    this.router = new Router({
      ...options.config,
      rules: this.rules
    });
    Object.freeze(this);
  }

  public match(request: ProxyRequest): RouteResult {
    return this.router.match(request);
  }
}

const validateTargets = (config: RouterConfig, allowedTargets: ReadonlySet<string>): void => {
  if (!allowedTargets.has(config.defaultOutbound)) {
    throw new ConfigError(`router generation default outbound "${config.defaultOutbound}" is unavailable`);
  }
  config.rules.forEach((rule, index) => {
    if (!allowedTargets.has(rule.outboundTag)) {
      throw new ConfigError(
        `router generation rule[${String(index)}] references unavailable target "${rule.outboundTag}"`
      );
    }
  });
};

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

const freezeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    value.forEach(freezeValue);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
  }
  return value;
};
