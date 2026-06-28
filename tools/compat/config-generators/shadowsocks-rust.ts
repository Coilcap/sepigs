import { writeCompatJson } from "../temp.js";
import { COMPAT_LOOPBACK } from "../ports.js";
import type { ReferenceLaunchPlan, ShadowsocksGeneratorInput } from "./types.js";

export const generateShadowsocksRustConfig = async (
  input: ShadowsocksGeneratorInput
): Promise<ReferenceLaunchPlan> => {
  const config = input.role === "server"
    ? {
        server: COMPAT_LOOPBACK,
        server_port: input.listenPort,
        password: input.password,
        method: input.method,
        mode: "tcp_only"
      }
    : {
        server: COMPAT_LOOPBACK,
        server_port: requiredServerPort(input.serverPort),
        local_address: COMPAT_LOOPBACK,
        local_port: input.listenPort,
        password: input.password,
        method: input.method,
        mode: "tcp_only"
      };
  const configPath = await writeCompatJson(input.directory, `shadowsocks-rust-${input.role}.json`, config);
  const args = ["-c", configPath];
  return {
    implementation: "shadowsocks-rust",
    role: input.role,
    protocol: "shadowsocks",
    command: input.binaryPath,
    args,
    displayCommand: `${input.role === "server" ? "ssserver" : "sslocal"} -c <temp-config>`,
    listenPort: input.listenPort,
    configPath
  };
};

const requiredServerPort = (port: number | undefined): number => {
  if (port === undefined) throw new Error("shadowsocks-rust client config requires serverPort");
  return port;
};
