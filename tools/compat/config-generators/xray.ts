import { COMPAT_LOOPBACK } from "../ports.js";
import { writeCompatJson } from "../temp.js";
import type {
  ReferenceLaunchPlan,
  ShadowsocksGeneratorInput,
  TrojanGeneratorInput
} from "./types.js";

export const generateXrayShadowsocksConfig = async (
  input: ShadowsocksGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const config = input.role === "server"
    ? {
        log: { loglevel: "warning" },
        inbounds: [{
          listen: COMPAT_LOOPBACK,
          port: input.listenPort,
          protocol: "shadowsocks",
          settings: {
            clients: [{ password: input.password, method: input.method }],
            network: "tcp"
          }
        }],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
      }
    : {
        log: { loglevel: "warning" },
        inbounds: [{
          listen: COMPAT_LOOPBACK,
          port: input.listenPort,
          protocol: "socks",
          settings: { auth: "noauth", udp: false }
        }],
        outbounds: [{
          protocol: "shadowsocks",
          tag: "reference-out",
          settings: {
            servers: [{
              address: COMPAT_LOOPBACK,
              port: requiredServerPort(input.serverPort),
              method: input.method,
              password: input.password
            }]
          }
        }]
      };
  return await writeXrayPlan(input.directory, input.binaryPath, input.role, "shadowsocks", input.listenPort, config);
};

export const generateXrayTrojanConfig = async (
  input: TrojanGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const config = input.role === "server"
    ? {
        log: { loglevel: "warning" },
        inbounds: [{
          listen: COMPAT_LOOPBACK,
          port: input.listenPort,
          protocol: "trojan",
          settings: { clients: [{ password: input.password }] },
          streamSettings: {
            network: "tcp",
            security: "tls",
            tlsSettings: {
              certificates: [{
                certificateFile: input.tls.certificatePath,
                keyFile: input.tls.keyPath
              }]
            }
          }
        }],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
      }
    : {
        log: { loglevel: "warning" },
        inbounds: [{
          listen: COMPAT_LOOPBACK,
          port: input.listenPort,
          protocol: "socks",
          settings: { auth: "noauth", udp: false }
        }],
        outbounds: [{
          protocol: "trojan",
          tag: "reference-out",
          settings: {
            servers: [{
              address: COMPAT_LOOPBACK,
              port: requiredServerPort(input.serverPort),
              password: input.password
            }]
          },
          streamSettings: {
            network: "tcp",
            security: "tls",
            tlsSettings: {
              serverName: input.tls.serverName,
              pinnedPeerCertSha256: input.tls.certificateSha256
            }
          }
        }]
      };
  return await writeXrayPlan(input.directory, input.binaryPath, input.role, "trojan", input.listenPort, config);
};

const writeXrayPlan = async (
  directory: string,
  binaryPath: string,
  role: "server" | "client",
  protocol: "shadowsocks" | "trojan",
  listenPort: number,
  config: unknown
): Promise<ReferenceLaunchPlan> => {
  const configPath = await writeCompatJson(directory, `xray-${protocol}-${role}.json`, config);
  const args = ["run", "-config", configPath];
  return {
    implementation: "xray",
    role,
    protocol,
    command: binaryPath,
    args,
    displayCommand: "xray run -config <temp-config>",
    listenPort,
    configPath
  };
};

const requiredServerPort = (port: number | undefined): number => {
  if (port === undefined) throw new Error("xray client config requires serverPort");
  return port;
};
