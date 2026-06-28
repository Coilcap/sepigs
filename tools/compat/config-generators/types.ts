import type { ReferenceImplementation } from "../types.js";

export type GeneratorRole = "server" | "client";
export type GeneratorProtocol = "shadowsocks" | "trojan";

export interface CompatTlsFiles {
  readonly certificatePath: string;
  readonly keyPath: string;
  readonly serverName: string;
  readonly certificateSha256: string;
}

export interface ReferenceLaunchPlan {
  readonly implementation: ReferenceImplementation;
  readonly role: GeneratorRole;
  readonly protocol: GeneratorProtocol;
  readonly command: string;
  readonly args: readonly string[];
  readonly displayCommand: string;
  readonly listenPort: number;
  readonly configPath?: string;
}

export interface ShadowsocksGeneratorInput {
  readonly directory: string;
  readonly binaryPath: string;
  readonly role: GeneratorRole;
  readonly method: "aes-128-gcm" | "aes-256-gcm" | "chacha20-ietf-poly1305";
  readonly listenPort: number;
  readonly serverPort?: number;
  readonly password: string;
}

export interface TrojanGeneratorInput {
  readonly directory: string;
  readonly binaryPath: string;
  readonly role: GeneratorRole;
  readonly listenPort: number;
  readonly serverPort?: number;
  readonly password: string;
  readonly tls: CompatTlsFiles;
}
