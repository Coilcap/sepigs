import type { RouterConfig } from "../config/types.js";
import type { ProxyRequest } from "../protocol/types.js";
import { CompiledRouteRule, type RouteMatch } from "./rules.js";

export interface RouteResult {
  readonly outboundTag: string;
  readonly ruleTag?: string;
  readonly matched: boolean;
}

export class Router {
  private readonly defaultOutbound: string;
  private readonly rules: readonly CompiledRouteRule[];

  public constructor(config: RouterConfig) {
    this.defaultOutbound = config.defaultOutbound;
    this.rules = config.rules.map((rule) => new CompiledRouteRule(rule));
  }

  public match(request: ProxyRequest): RouteResult {
    for (const rule of this.rules) {
      const match: RouteMatch | undefined = rule.match(request);
      if (match !== undefined) {
        return {
          outboundTag: match.outboundTag,
          ...(match.ruleTag === undefined ? {} : { ruleTag: match.ruleTag }),
          matched: true
        };
      }
    }

    return {
      outboundTag: this.defaultOutbound,
      matched: false
    };
  }
}
