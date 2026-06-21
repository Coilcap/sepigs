import { access } from "node:fs/promises";

export interface WireGuardCapability { readonly available: boolean; readonly command?: string; readonly reason?: string }
export const detectWireGuardCapability = async (candidates = ["/usr/bin/wg", "/usr/local/bin/wg", "/opt/homebrew/bin/wg"]): Promise<WireGuardCapability> => {
  for (const command of candidates) { try { await access(command); return { available: true, command }; } catch { /* keep checking */ } }
  return { available: false, reason: "wg/wireguard-go executable was not found" };
};
