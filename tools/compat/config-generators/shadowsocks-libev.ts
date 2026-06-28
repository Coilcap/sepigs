import { COMPAT_LOOPBACK } from "../ports.js";
import type { ReferenceLaunchPlan, ShadowsocksGeneratorInput } from "./types.js";

export const generateShadowsocksLibevCommand = (input: ShadowsocksGeneratorInput): ReferenceLaunchPlan => {
  const args = input.role === "server"
    ? [
        "-s", COMPAT_LOOPBACK,
        "-p", String(input.listenPort),
        "-k", input.password,
        "-m", input.method,
        "-t", "60"
      ]
    : [
        "-s", COMPAT_LOOPBACK,
        "-p", String(requiredServerPort(input.serverPort)),
        "-b", COMPAT_LOOPBACK,
        "-l", String(input.listenPort),
        "-k", input.password,
        "-m", input.method,
        "-t", "60"
      ];
  return {
    implementation: "shadowsocks-libev",
    role: input.role,
    protocol: "shadowsocks",
    command: input.binaryPath,
    args,
    displayCommand: `${input.role === "server" ? "ss-server" : "ss-local"} <loopback-test-args>`,
    listenPort: input.listenPort
  };
};

const requiredServerPort = (port: number | undefined): number => {
  if (port === undefined) throw new Error("shadowsocks-libev client command requires serverPort");
  return port;
};
