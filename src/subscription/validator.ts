import type { OutboundConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";

export const validateSubscriptionOutbounds = (outbounds: readonly OutboundConfig[]): void => {
  if (outbounds.length === 0) throw new ConfigError("subscription contains no supported outbounds");
  for (const outbound of outbounds) {
    if (outbound.tag.length === 0) throw new ConfigError("subscription outbound tag cannot be empty");
  }
};
