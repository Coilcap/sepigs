import type { RouteRuleConfig } from "../config/types.js";
import type { ProxyRequest } from "../protocol/types.js";
import { CidrMatcher, matchesDomainSuffix, matchesExactDomain, normalizeDomain } from "./matcher.js";

export interface RouteMatch {
  readonly ruleTag?: string;
  readonly outboundTag: string;
}

export class CompiledRouteRule {
  private readonly config: RouteRuleConfig;
  private readonly exactDomains: ReadonlySet<string> | undefined;
  private readonly suffixes: readonly string[];
  private readonly cidrs: readonly CidrMatcher[];
  private readonly ports: ReadonlySet<number> | undefined;

  public constructor(config: RouteRuleConfig) {
    this.config = config;
    this.exactDomains = config.domain === undefined ? undefined : new Set(config.domain.map(normalizeDomain));
    this.suffixes = config.domainSuffix ?? [];
    this.cidrs = (config.ipCidr ?? []).map((cidr) => new CidrMatcher(cidr));
    this.ports = config.port === undefined ? undefined : new Set(config.port);
  }

  public match(request: ProxyRequest): RouteMatch | undefined {
    const destination = request.destination;

    if (this.exactDomains !== undefined && !matchesExactDomain(destination.host, this.exactDomains)) {
      return undefined;
    }

    if (this.suffixes.length > 0 && !matchesDomainSuffix(destination.host, this.suffixes)) {
      return undefined;
    }

    if (this.cidrs.length > 0 && !this.cidrs.some((matcher) => matcher.matches(destination.host))) {
      return undefined;
    }

    if (this.ports !== undefined && !this.ports.has(destination.port)) {
      return undefined;
    }

    return {
      outboundTag: this.config.outboundTag,
      ...(this.config.tag === undefined ? {} : { ruleTag: this.config.tag })
    };
  }
}
