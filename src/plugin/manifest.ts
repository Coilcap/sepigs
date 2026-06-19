import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { ConfigError } from "../utils/errors.js";

export type PluginPermission = "inbound:register" | "outbound:register" | "worker" | "wasm" | "network";
export type PluginType = "inbound" | "outbound" | "rule" | "wasm" | "mixed";

export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly type: PluginType;
  readonly entry: string;
  readonly permissions: readonly PluginPermission[];
  readonly apiVersion: "1";
  readonly description: string;
  readonly manifestPath: string;
  readonly entryPath: string;
}

const PERMISSIONS = new Set<PluginPermission>(["inbound:register", "outbound:register", "worker", "wasm", "network"]);
const TYPES = new Set<PluginType>(["inbound", "outbound", "rule", "wasm", "mixed"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const loadPluginManifest = async (manifestPath: string): Promise<PluginManifest> => {
  const resolvedPath = resolve(manifestPath);
  const parsed = JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new ConfigError(`plugin manifest "${resolvedPath}" must be an object`);
  }
  const name = readString(parsed, "name", resolvedPath);
  const version = readString(parsed, "version", resolvedPath);
  const type = readString(parsed, "type", resolvedPath);
  const entry = readString(parsed, "entry", resolvedPath);
  const apiVersion = readString(parsed, "apiVersion", resolvedPath);
  const description = readString(parsed, "description", resolvedPath);
  const permissions = readPermissions(parsed.permissions, resolvedPath);
  if (!TYPES.has(type as PluginType)) {
    throw new ConfigError(`plugin manifest "${resolvedPath}" has unsupported type "${type}"`);
  }
  if (apiVersion !== "1") {
    throw new ConfigError(`plugin manifest "${resolvedPath}" apiVersion must be "1"`);
  }
  const entryPath = isAbsolute(entry) ? entry : resolve(dirname(resolvedPath), entry);
  return {
    name,
    version,
    type: type as PluginType,
    entry,
    permissions,
    apiVersion: "1",
    description,
    manifestPath: resolvedPath,
    entryPath
  };
};

export const createLegacyManifest = (tag: string, entryPath: string): PluginManifest => {
  const resolvedPath = resolve(entryPath);
  return {
    name: tag,
    version: "0.0.0",
    type: "mixed",
    entry: resolvedPath,
    permissions: ["inbound:register", "outbound:register", "worker", "wasm", "network"],
    apiVersion: "1",
    description: "Legacy plugin loaded without an explicit manifest",
    manifestPath: resolvedPath,
    entryPath: resolvedPath
  };
};

const readString = (record: Record<string, unknown>, key: string, path: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigError(`plugin manifest "${path}" field "${key}" must be a non-empty string`);
  }
  return value.trim();
};

const readPermissions = (value: unknown, path: string): readonly PluginPermission[] => {
  if (!Array.isArray(value)) {
    throw new ConfigError(`plugin manifest "${path}" permissions must be an array`);
  }
  return value.map((permission, index) => {
    if (typeof permission !== "string" || !PERMISSIONS.has(permission as PluginPermission)) {
      throw new ConfigError(`plugin manifest "${path}" permissions[${index}] is not supported`);
    }
    return permission as PluginPermission;
  });
};
