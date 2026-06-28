import { COMPAT_LOOPBACK } from "../ports.js";
import { writeCompatJson } from "../temp.js";
import type { ReferenceLaunchPlan, TrojanGeneratorInput } from "./types.js";

export const generateTrojanGoConfig = async (
  input: TrojanGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const config = input.role === "server"
    ? {
        run_type: "server",
        local_addr: COMPAT_LOOPBACK,
        local_port: input.listenPort,
        remote_addr: COMPAT_LOOPBACK,
        remote_port: 80,
        password: [input.password],
        ssl: {
          cert: input.tls.certificatePath,
          key: input.tls.keyPath,
          sni: input.tls.serverName
        }
      }
    : {
        run_type: "client",
        local_addr: COMPAT_LOOPBACK,
        local_port: input.listenPort,
        remote_addr: COMPAT_LOOPBACK,
        remote_port: requiredServerPort(input.serverPort),
        password: [input.password],
        ssl: {
          sni: input.tls.serverName,
          verify: false,
          verify_hostname: false
        }
      };
  const configPath = await writeCompatJson(input.directory, `trojan-go-${input.role}.json`, config);
  const args = ["-config", configPath];
  return {
    implementation: "trojan-go",
    role: input.role,
    protocol: "trojan",
    command: input.binaryPath,
    args,
    displayCommand: "trojan-go -config <temp-config>",
    listenPort: input.listenPort,
    configPath
  };
};

const requiredServerPort = (port: number | undefined): number => {
  if (port === undefined) throw new Error("trojan-go client config requires serverPort");
  return port;
};
