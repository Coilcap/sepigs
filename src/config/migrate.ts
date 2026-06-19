import { ConfigError } from "../utils/errors.js";

export interface MigrationResult {
  readonly config: unknown;
  readonly warnings: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const migrateConfig = (input: unknown): MigrationResult => {
  if (!isRecord(input)) {
    throw new ConfigError("config root must be an object");
  }

  const version = input.configVersion;
  if (version === undefined) {
    return {
      config: {
        ...input,
        configVersion: 1
      },
      warnings: ["configVersion is missing; treating config as v0 and migrating to v1"]
    };
  }

  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new ConfigError("configVersion must be an integer");
  }
  if (version === 1) {
    return { config: input, warnings: [] };
  }
  if (version === 0) {
    return {
      config: {
        ...input,
        configVersion: 1
      },
      warnings: ["configVersion 0 is deprecated; migrated to configVersion 1"]
    };
  }

  throw new ConfigError(`configVersion ${version} is newer than this sepigs build supports`);
};
