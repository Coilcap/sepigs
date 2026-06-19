import { access } from "node:fs/promises";

export interface TrojanReferenceResult {
  readonly case: string;
  readonly status: "skipped" | "verified" | "failed";
  readonly reason: string;
  readonly command: string;
}

const cases = ["outbound to reference server", "wrong password failure", "SNI/serverName behavior", "remote close", "large payload"];
const binary = await findBinary(["trojan-go", "trojan"]);
const results: TrojanReferenceResult[] = cases.map((name) => {
  if (binary === undefined) {
    return {
      case: name,
      status: "skipped",
      reason: "No trojan-go/trojan reference binary found in PATH",
      command: "install trojan-go or a compatible reference implementation, then run npm run compat:matrix"
    };
  }
  return {
    case: name,
    status: "skipped",
    reason: "Reference binary detected but automatic launch is disabled until a vetted local-only TLS/config template is supplied",
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
