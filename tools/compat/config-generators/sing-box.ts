import { COMPAT_LOOPBACK } from "../ports.js";
import { writeCompatJson } from "../temp.js";
import type {
  ReferenceLaunchPlan,
  ShadowsocksGeneratorInput,
  TrojanGeneratorInput
} from "./types.js";

export const generateSingBoxShadowsocksConfig = async (
  input: ShadowsocksGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const inbound = input.role === "server"
    ? {
        type: "shadowsocks",
        tag: "reference-in",
        listen: COMPAT_LOOPBACK,
        listen_port: input.listenPort,
        method: input.method,
        password: input.password
      }
    : {
        type: "socks",
        tag: "local-socks",
        listen: COMPAT_LOOPBACK,
        listen_port: input.listenPort
      };
  const outbounds = input.role === "server"
    ? [{ type: "direct", tag: "direct" }]
    : [{
        type: "shadowsocks",
        tag: "reference-out",
        server: COMPAT_LOOPBACK,
        server_port: requiredServerPort(input.serverPort),
        method: input.method,
        password: input.password
      }];
  return await writeSingBoxPlan(input.directory, input.binaryPath, input.role, "shadowsocks", input.listenPort, {
    log: { level: "warn", timestamp: true },
    inbounds: [inbound],
    outbounds,
    route: { final: input.role === "server" ? "direct" : "reference-out" }
  });
};

export const generateSingBoxTrojanConfig = async (
  input: TrojanGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const inbound = input.role === "server"
    ? {
        type: "trojan",
        tag: "reference-in",
        listen: COMPAT_LOOPBACK,
        listen_port: input.listenPort,
        users: [{ name: "sepigs-test", password: input.password }],
        tls: {
          enabled: true,
          server_name: input.tls.serverName,
          certificate_path: input.tls.certificatePath,
          key_path: input.tls.keyPath
        }
      }
    : {
        type: "socks",
        tag: "local-socks",
        listen: COMPAT_LOOPBACK,
        listen_port: input.listenPort
      };
  const outbounds = input.role === "server"
    ? [{ type: "direct", tag: "direct" }]
    : [{
        type: "trojan",
        tag: "reference-out",
        server: COMPAT_LOOPBACK,
        server_port: requiredServerPort(input.serverPort),
        password: input.password,
        tls: {
          enabled: true,
          server_name: input.tls.serverName,
          insecure: true
        }
      }];
  return await writeSingBoxPlan(input.directory, input.binaryPath, input.role, "trojan", input.listenPort, {
    log: { level: "warn", timestamp: true },
    inbounds: [inbound],
    outbounds,
    route: { final: input.role === "server" ? "direct" : "reference-out" }
  });
};

const writeSingBoxPlan = async (
  directory: string,
  binaryPath: string,
  role: "server" | "client",
  protocol: "shadowsocks" | "trojan",
  listenPort: number,
  config: unknown
): Promise<ReferenceLaunchPlan> => {
  const configPath = await writeCompatJson(directory, `sing-box-${protocol}-${role}.json`, config);
  const args = ["run", "-c", configPath];
  return {
    implementation: "sing-box",
    role,
    protocol,
    command: binaryPath,
    args,
    displayCommand: `sing-box run -c <temp-config>`,
    listenPort,
    configPath
  };
};

const requiredServerPort = (port: number | undefined): number => {
  if (port === undefined) throw new Error("sing-box client config requires serverPort");
  return port;
};
