import type { WireGuardOutboundConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";

export const validateWireGuardPrototypeConfig = (config: WireGuardOutboundConfig): void => {
  if (config.privateKey.length < 40 || config.peer.publicKey.length < 40) throw new ConfigError("WireGuard keys must be base64-encoded 32-byte keys");
  if (config.address.length === 0 || config.peer.allowedIps.length === 0) throw new ConfigError("WireGuard address and allowedIps cannot be empty");
};
