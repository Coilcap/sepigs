import type { ShadowsocksCipher, ShadowsocksOutboundConfig } from "../../config/types.js";
import { ConfigError } from "../../utils/errors.js";

export const parseShadowsocksUri = (line: string, index = 0): ShadowsocksOutboundConfig => {
  const body = line.slice("ss://".length);
  const hashIndex = body.indexOf("#");
  const withoutName = hashIndex >= 0 ? body.slice(0, hashIndex) : body;
  const tag = decodeURIComponent(hashIndex >= 0 ? body.slice(hashIndex + 1) : `ss-${index + 1}`);
  const decoded = withoutName.includes("@") ? withoutName : Buffer.from(withoutName, "base64url").toString("utf8");
  const at = decoded.lastIndexOf("@");
  if (at < 0) {
    throw new ConfigError(`invalid Shadowsocks URL at line ${index + 1}`);
  }
  const userInfo = decoded.slice(0, at);
  const endpoint = decoded.slice(at + 1);
  const colon = userInfo.indexOf(":");
  const portColon = endpoint.lastIndexOf(":");
  if (colon < 0 || portColon < 0) {
    throw new ConfigError(`invalid Shadowsocks URL at line ${index + 1}`);
  }
  const method = userInfo.slice(0, colon);
  if (!isCipher(method)) {
    throw new ConfigError(`unsupported Shadowsocks method "${method}" at line ${index + 1}`);
  }
  return {
    type: "shadowsocks",
    tag,
    method,
    password: userInfo.slice(colon + 1),
    serverHost: endpoint.slice(0, portColon),
    serverPort: readPort(endpoint.slice(portColon + 1), line)
  };
};

const isCipher = (value: string): value is ShadowsocksCipher =>
  value === "aes-128-gcm" || value === "aes-256-gcm" || value === "chacha20-ietf-poly1305";

const readPort = (raw: string, source: string): number => {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`invalid port in subscription URL "${source}"`);
  }
  return port;
};
