import net from "node:net";
import { ConfigError } from "../utils/errors.js";

export const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

export const matchesExactDomain = (host: string, domains: ReadonlySet<string>): boolean => {
  return domains.has(normalizeDomain(host));
};

export const matchesDomainSuffix = (host: string, suffixes: readonly string[]): boolean => {
  const normalizedHost = normalizeDomain(host);

  return suffixes.some((suffix) => {
    const normalizedSuffix = normalizeDomain(suffix).replace(/^\./u, "");
    return normalizedHost === normalizedSuffix || normalizedHost.endsWith(`.${normalizedSuffix}`);
  });
};

const parseIpv4ToBigInt = (input: string): bigint | undefined => {
  const parts = input.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  let output = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) {
      return undefined;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return undefined;
    }
    output = (output << 8n) + BigInt(value);
  }
  return output;
};

const parseIpv6Groups = (input: string): number[] | undefined => {
  if (input.length === 0) {
    return [];
  }

  const parts = input.split(":");
  const groups: number[] = [];

  for (const part of parts) {
    if (part.includes(".")) {
      const ipv4 = parseIpv4ToBigInt(part);
      if (ipv4 === undefined) {
        return undefined;
      }
      groups.push(Number((ipv4 >> 16n) & 0xffffn));
      groups.push(Number(ipv4 & 0xffffn));
      continue;
    }

    if (!/^[0-9a-fA-F]{1,4}$/u.test(part)) {
      return undefined;
    }
    groups.push(Number.parseInt(part, 16));
  }

  return groups;
};

const parseIpv6ToBigInt = (input: string): bigint | undefined => {
  const normalized = input.toLowerCase();
  const doubleColonParts = normalized.split("::");
  if (doubleColonParts.length > 2) {
    return undefined;
  }

  const head = parseIpv6Groups(doubleColonParts[0] ?? "");
  const tail = parseIpv6Groups(doubleColonParts[1] ?? "");
  if (head === undefined || tail === undefined) {
    return undefined;
  }

  let groups: number[];
  if (doubleColonParts.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) {
      return undefined;
    }
    groups = [...head, ...Array.from({ length: missing }, () => 0), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) {
    return undefined;
  }

  let output = 0n;
  for (const group of groups) {
    if (group < 0 || group > 0xffff) {
      return undefined;
    }
    output = (output << 16n) + BigInt(group);
  }
  return output;
};

const parseIpToBigInt = (input: string): { readonly version: 4 | 6; readonly value: bigint } | undefined => {
  const version = net.isIP(input);
  if (version === 4) {
    const value = parseIpv4ToBigInt(input);
    return value === undefined ? undefined : { version, value };
  }
  if (version === 6) {
    const value = parseIpv6ToBigInt(input);
    return value === undefined ? undefined : { version, value };
  }
  return undefined;
};

export class CidrMatcher {
  private readonly version: 4 | 6;
  private readonly network: bigint;
  private readonly prefix: number;
  private readonly bits: number;

  public constructor(cidr: string) {
    const [address, prefixText] = cidr.split("/");
    if (address === undefined || prefixText === undefined || cidr.split("/").length !== 2) {
      throw new ConfigError(`invalid CIDR "${cidr}"`);
    }

    const parsed = parseIpToBigInt(address);
    if (parsed === undefined) {
      throw new ConfigError(`invalid CIDR address "${cidr}"`);
    }

    const bits = parsed.version === 4 ? 32 : 128;
    const prefix = Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) {
      throw new ConfigError(`invalid CIDR prefix "${cidr}"`);
    }

    this.version = parsed.version;
    this.network = parsed.value;
    this.prefix = prefix;
    this.bits = bits;
  }

  public matches(host: string): boolean {
    const parsed = parseIpToBigInt(host);
    if (parsed === undefined || parsed.version !== this.version) {
      return false;
    }

    if (this.prefix === 0) {
      return true;
    }

    const shift = BigInt(this.bits - this.prefix);
    return (parsed.value >> shift) === (this.network >> shift);
  }
}

export const isValidCidr = (cidr: string): boolean => {
  try {
    new CidrMatcher(cidr);
    return true;
  } catch {
    return false;
  }
};
