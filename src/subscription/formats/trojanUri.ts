import type { TrojanOutboundConfig } from "../../config/types.js";
import { ConfigError } from "../../utils/errors.js";

export const parseTrojanUri = (line: string, index = 0): TrojanOutboundConfig => {
  const url = new URL(line);
  const serverName = url.searchParams.get("sni");
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`invalid port in Trojan URL at line ${index + 1}`);
  }
  return {
    type: "trojan",
    tag: decodeURIComponent(url.hash.length > 1 ? url.hash.slice(1) : `trojan-${index + 1}`),
    password: decodeURIComponent(url.username),
    serverHost: url.hostname,
    serverPort: port,
    tls: {
      enabled: url.searchParams.get("tls") !== "0",
      rejectUnauthorized: url.searchParams.get("allowInsecure") !== "1",
      ...(serverName === null ? {} : { serverName })
    }
  };
};
