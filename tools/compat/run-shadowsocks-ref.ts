import { access } from "node:fs/promises";

export interface ShadowsocksReferenceResult {
  readonly case: string;
  readonly status: "skipped" | "verified" | "failed";
  readonly reason: string;
  readonly command: string;
}

const cases = ["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "wrong password failure", "remote close", "large payload"];
const binary = await findBinary(["ssserver", "ss-server", "shadowsocks-server"]);
const results: ShadowsocksReferenceResult[] = cases.map((name) => {
  if (binary === undefined) {
    return {
      case: name,
      status: "skipped",
      reason: "No shadowsocks-rust/libev reference server binary found in PATH",
      command: "install shadowsocks-rust or shadowsocks-libev, then run npm run compat:matrix"
    };
  }
  return {
    case: name,
    status: "skipped",
    reason: "Reference binary detected but automatic launch is disabled until a vetted local-only config template is supplied",
    command: `${binary} --help`
  };
});

console.log(JSON.stringify(results, null, 2));

async function findBinary(names: readonly string[]): Promise<string | undefined> {
  const paths = (process.env.PATH ?? "").split(":");
  for (const name of names) {
    for (const entry of paths) {
      try {
        const candidate = `${entry}/${name}`;
        await access(candidate);
        return candidate;
      } catch {
        // Keep searching.
      }
    }
  }
  return undefined;
}
