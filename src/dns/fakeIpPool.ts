import { ConfigError } from "../utils/errors.js";

const ipv4ToNumber = (address: string): number => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new ConfigError(`invalid IPv4 address "${address}"`);
  }
  return (((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)) >>> 0;
};

const numberToIpv4 = (value: number): string => {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
};

export class FakeIpPool {
  private readonly first: number;
  private readonly capacity: number;
  private cursor = 0;

  public constructor(range: string, requestedSize: number) {
    const [address, prefixRaw] = range.split("/");
    const prefix = Number(prefixRaw);
    if (address === undefined || !Number.isInteger(prefix) || prefix < 1 || prefix > 30) {
      throw new ConfigError(`fake-ip range must be an IPv4 CIDR with prefix 1..30: "${range}"`);
    }
    const base = ipv4ToNumber(address);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    const network = base & mask;
    const available = 2 ** (32 - prefix) - 2;
    this.first = (network + 1) >>> 0;
    this.capacity = Math.min(requestedSize, available);
    if (this.capacity < 1) {
      throw new ConfigError(`fake-ip range has no usable addresses: "${range}"`);
    }
  }

  public next(isUsed: (address: string) => boolean): string {
    for (let attempt = 0; attempt < this.capacity; attempt += 1) {
      const candidate = numberToIpv4((this.first + this.cursor) >>> 0);
      this.cursor = (this.cursor + 1) % this.capacity;
      if (!isUsed(candidate)) {
        return candidate;
      }
    }
    throw new ConfigError("fake-ip pool is exhausted");
  }

  public contains(address: string): boolean {
    const value = ipv4ToNumber(address);
    return value >= this.first && value < this.first + this.capacity;
  }
}
