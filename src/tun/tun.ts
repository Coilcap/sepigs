import type { TunConfig } from "../config/types.js";
import type { TunDevice } from "./device.js";
import { UnsupportedTunDevice } from "./device.js";

export interface TunCapability { readonly supported: boolean; readonly platform: NodeJS.Platform; readonly requiresPrivileges: boolean; readonly reason: string }
export const tunCapability = (): TunCapability => ({ supported: false, platform: process.platform, requiresPrivileges: true, reason: "No bundled native TUN adapter; Linux/macOS adapters require root or administrator privileges." });
export const createTunDevice = (config: TunConfig): TunDevice => {
  if (!config.enabled) return new UnsupportedTunDevice(config.name);
  if (!config.experimental) throw new Error("TUN must remain explicitly experimental in this release");
  return new UnsupportedTunDevice(config.name);
};
