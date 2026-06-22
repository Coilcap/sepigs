import { access } from "node:fs/promises";

export interface ExternalBinary {
  readonly name: "shadowsocks-rust" | "shadowsocks-libev" | "trojan-go" | "sing-box" | "xray";
  readonly candidates: readonly string[];
  readonly path?: string;
}

export const checkExternalBinaries = async (): Promise<readonly ExternalBinary[]> => {
  const definitions: Array<Omit<ExternalBinary, "path">> = [
    { name: "shadowsocks-rust", candidates: ["sslocal", "ssserver"] },
    { name: "shadowsocks-libev", candidates: ["ss-local", "ss-server"] },
    { name: "trojan-go", candidates: ["trojan-go"] },
    { name: "sing-box", candidates: ["sing-box"] },
    { name: "xray", candidates: ["xray"] }
  ];
  const results: ExternalBinary[] = [];
  for (const definition of definitions) {
    const path = await findBinary(definition.candidates);
    results.push({ ...definition, ...(path === undefined ? {} : { path }) });
  }
  return results;
};

const findBinary = async (names: readonly string[]): Promise<string | undefined> => {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    for (const name of names) {
      const candidate = `${directory}/${name}`;
      try { await access(candidate); return candidate; } catch { /* Continue searching. */ }
    }
  }
  return undefined;
};

if (process.argv[1]?.endsWith("check-binaries.ts") || process.argv[1]?.endsWith("check-binaries.js")) {
  console.log(JSON.stringify(await checkExternalBinaries(), null, 2));
}
