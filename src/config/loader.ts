import { dirname, extname, isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { parseConfig } from "./schema.js";
import type { RouteRuleConfig, RouteRuleSetFileConfig, SepigsConfig } from "./types.js";
import { ConfigError } from "../utils/errors.js";

export const loadConfig = async (path: string): Promise<SepigsConfig> => {
  const raw = await readTextFile(path, "config");
  const parsed = parseStructuredData(path, raw);
  const config = parseConfig(parsed);
  return await expandRuleSetFiles(config, dirname(resolve(path)));
};

const readTextFile = async (path: string, label: string): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigError(`failed to read ${label} "${path}": ${error instanceof Error ? error.message : String(error)}`);
  }
};

const parseStructuredData = (path: string, raw: string): unknown => {
  const extension = extname(path).toLowerCase();
  try {
    if (extension === ".yaml" || extension === ".yml") {
      return YAML.parse(raw) as unknown;
    }
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const format = extension === ".yaml" || extension === ".yml" ? "YAML" : "JSON";
    throw new ConfigError(`failed to parse ${format} "${path}": ${error instanceof Error ? error.message : String(error)}`);
  }
};

const expandRuleSetFiles = async (config: SepigsConfig, baseDir: string): Promise<SepigsConfig> => {
  if (config.route.ruleSetFiles.length === 0) {
    return config;
  }

  const expandedRules: RouteRuleConfig[] = [];
  for (const ruleSet of config.route.ruleSetFiles) {
    expandedRules.push(...(await loadRuleSetFile(ruleSet, baseDir)));
  }

  const expandedConfig: SepigsConfig = {
    ...config,
    route: {
      ...config.route,
      rules: [...expandedRules, ...config.route.rules]
    }
  };

  return parseConfig(expandedConfig);
};

const loadRuleSetFile = async (ruleSet: RouteRuleSetFileConfig, baseDir: string): Promise<readonly RouteRuleConfig[]> => {
  const resolvedPath = isAbsolute(ruleSet.path) ? ruleSet.path : resolve(baseDir, ruleSet.path);
  const raw = await readTextFile(resolvedPath, `rule-set ${ruleSet.tag}`);
  const parsed = parseStructuredData(resolvedPath, raw);
  const rawRules = extractRuleSetRules(parsed, resolvedPath);

  return rawRules.map((rawRule, index) => {
    if (!isRecord(rawRule)) {
      throw new ConfigError(`rule-set "${ruleSet.tag}" rule[${index}] must be an object`);
    }

    const outboundTag = typeof rawRule.outboundTag === "string" && rawRule.outboundTag.length > 0 ? rawRule.outboundTag : ruleSet.outboundTag;
    const tag = typeof rawRule.tag === "string" && rawRule.tag.length > 0 ? `${ruleSet.tag}:${rawRule.tag}` : `${ruleSet.tag}:${index}`;
    return {
      ...rawRule,
      tag,
      outboundTag
    } satisfies RouteRuleConfig;
  });
};

const extractRuleSetRules = (input: unknown, path: string): readonly unknown[] => {
  if (Array.isArray(input)) {
    return input;
  }
  if (isRecord(input) && Array.isArray(input.rules)) {
    return input.rules;
  }
  throw new ConfigError(`rule-set "${path}" must be an array or an object with a rules array`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
