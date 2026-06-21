import net from "node:net";
import { ConfigError } from "./errors.js";

export interface TestNetworkConfig {
  readonly host: string;
  readonly port: number;
  readonly disableIpv6: boolean;
}

export const readTestNetworkConfig = (env: NodeJS.ProcessEnv = process.env): TestNetworkConfig => {
  const disableIpv6 = env.SEPIGS_DISABLE_IPV6 === "1";
  let host = env.SEPIGS_TEST_HOST?.trim() || "127.0.0.1";
  if (disableIpv6 && (host === "::1" || host === "localhost")) {
    host = "127.0.0.1";
  }
  if (!isLoopback(host)) {
    throw new ConfigError(`SEPIGS_TEST_HOST must be a loopback address, received "${host}"`);
  }

  const rawPort = env.SEPIGS_TEST_PORT?.trim() || "0";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new ConfigError(`SEPIGS_TEST_PORT must be an integer between 0 and 65535, received "${rawPort}"`);
  }
  return { host, port, disableIpv6 };
};

const isLoopback = (host: string): boolean => {
  if (host === "localhost" || host === "::1") {
    return true;
  }
  return net.isIPv4(host) && host.startsWith("127.");
};
