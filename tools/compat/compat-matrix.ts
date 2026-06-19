import { access, mkdir, writeFile } from "node:fs/promises";

interface MatrixRow {
  readonly protocol: "shadowsocks" | "trojan";
  readonly direction: string;
  readonly case: string;
  readonly status: "verified-local-fixture" | "skipped-with-reason" | "unsupported" | "failed";
  readonly evidence: string;
  readonly reason: string;
}

const shadowsocksBinary = await findBinary(["ssserver", "ss-server", "shadowsocks-server"]);
const trojanBinary = await findBinary(["trojan-go", "trojan"]);

const rows: MatrixRow[] = [
  ...["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305"].map((cipher): MatrixRow => ({
    protocol: "shadowsocks",
    direction: "sepigs outbound -> local reference fixture",
    case: cipher,
    status: "verified-local-fixture",
    evidence: "test/compat/shadowsocks-compat.test.ts",
    reason: "Covered by local protocol fixture in npm test, not an external implementation claim."
  })),
  ...["wrong password failure", "remote close", "large payload"].map((name): MatrixRow => ({
    protocol: "shadowsocks",
    direction: "sepigs outbound -> external reference server",
    case: name,
    status: shadowsocksBinary === undefined ? "skipped-with-reason" : "skipped-with-reason",
    evidence: shadowsocksBinary ?? "missing binary",
    reason:
      shadowsocksBinary === undefined
        ? "No shadowsocks-rust/libev reference server binary found in PATH."
        : "Reference binary was detected, but automatic launch needs a vetted local-only config template before it can be marked verified."
  })),
  {
    protocol: "shadowsocks",
    direction: "reference client -> sepigs inbound",
    case: "all ciphers",
    status: "unsupported",
    evidence: "src/inbound",
    reason: "sepigs does not implement Shadowsocks inbound in Phase 7."
  },
  {
    protocol: "trojan",
    direction: "sepigs outbound -> local reference fixture",
    case: "plain TCP test mode",
    status: "verified-local-fixture",
    evidence: "test/compat/trojan-compat.test.ts",
    reason: "Covered by local protocol fixture in npm test, not a public TLS ecosystem claim."
  },
  ...["wrong password failure", "SNI/serverName behavior", "remote close", "large payload"].map((name): MatrixRow => ({
    protocol: "trojan",
    direction: "sepigs outbound -> external reference server",
    case: name,
    status: trojanBinary === undefined ? "skipped-with-reason" : "skipped-with-reason",
    evidence: trojanBinary ?? "missing binary",
    reason:
      trojanBinary === undefined
        ? "No trojan-go/trojan reference binary found in PATH."
        : "Reference binary was detected, but automatic launch needs a vetted local-only TLS/config template before it can be marked verified."
  })),
  {
    protocol: "trojan",
    direction: "reference client -> sepigs inbound",
    case: "all cases",
    status: "unsupported",
    evidence: "src/inbound",
    reason: "sepigs does not implement Trojan inbound in Phase 7."
  }
];

await mkdir("reports/compat", { recursive: true });
await writeFile("reports/compat/protocol-matrix.json", `${JSON.stringify(rows, null, 2)}\n`, "utf8");
await writeFile("reports/compat/protocol-matrix.md", render(rows), "utf8");
console.log(`protocol compatibility matrix written: ${rows.length} rows`);

async function findBinary(names: readonly string[]): Promise<string | undefined> {
  const paths = (process.env.PATH ?? "").split(":");
  for (const name of names) {
    for (const entry of paths) {
      try {
        const candidate = `${entry}/${name}`;
        await access(candidate);
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return undefined;
}

function render(values: readonly MatrixRow[]): string {
  return [
    "# Protocol Compatibility Matrix",
    "",
    "| Protocol | Direction | Case | Status | Evidence | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
    ...values.map(
      (row) =>
        `| ${row.protocol} | ${escapeCell(row.direction)} | ${escapeCell(row.case)} | ${row.status} | ${escapeCell(row.evidence)} | ${escapeCell(row.reason)} |`
    ),
    ""
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
