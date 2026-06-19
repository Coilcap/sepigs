import { mkdir, writeFile } from "node:fs/promises";
import YAML from "yaml";

const host = process.env.SEPIGS_CLIENT_HOST ?? "127.0.0.1";
const httpPort = Number(process.env.SEPIGS_HTTP_PORT ?? "8080");
const socksPort = Number(process.env.SEPIGS_SOCKS_PORT ?? "1080");
const validationUrl = process.env.SEPIGS_VALIDATION_URL ?? "https://example.com/";

await mkdir("examples/clients", { recursive: true });

const mihomoConfig = {
  port: 7890,
  "socks-port": 7891,
  "allow-lan": false,
  mode: "rule",
  proxies: [
    { name: "sepigs-http", type: "http", server: host, port: httpPort },
    { name: "sepigs-socks", type: "socks5", server: host, port: socksPort }
  ],
  "proxy-groups": [{ name: "SEPIGS", type: "select", proxies: ["sepigs-http", "sepigs-socks", "DIRECT"] }],
  rules: ["MATCH,SEPIGS"]
};

const stashConfig = {
  port: 7890,
  "socks-port": 7891,
  "allow-lan": false,
  mode: "rule",
  proxies: [
    { name: "sepigs-http", type: "http", server: host, port: httpPort },
    { name: "sepigs-socks", type: "socks5", server: host, port: socksPort }
  ],
  "proxy-groups": [{ name: "SEPIGS", type: "select", proxies: ["sepigs-http", "sepigs-socks", "DIRECT"] }],
  rules: ["MATCH,SEPIGS"]
};

await Promise.all([
  writeFile("examples/clients/mihomo.yaml", YAML.stringify(mihomoConfig), "utf8"),
  writeFile("examples/clients/stash.yaml", YAML.stringify(stashConfig), "utf8"),
  writeFile("examples/clients/surge.conf", renderSurge(host, httpPort, socksPort), "utf8"),
  writeFile("examples/clients/chrome-system.md", renderChrome(host, httpPort, socksPort, validationUrl), "utf8"),
  writeFile("examples/clients/shadowrocket.md", renderShadowrocket(host, httpPort, socksPort, validationUrl), "utf8"),
  writeFile("examples/clients/nekobox.md", renderNekoBox(host, httpPort, socksPort, validationUrl), "utf8"),
  writeFile("examples/clients/v2rayn.md", renderV2rayN(host, httpPort, socksPort, validationUrl), "utf8")
]);

console.log(`client configs generated for sepigs at ${host} http=${httpPort} socks=${socksPort}`);

function renderSurge(server: string, http: number, socks: number): string {
  return [
    "[General]",
    "loglevel = notify",
    "allow-wifi-access = false",
    "",
    "[Proxy]",
    `sepigs-http = http, ${server}, ${http}`,
    `sepigs-socks = socks5, ${server}, ${socks}`,
    "",
    "[Proxy Group]",
    "SEPIGS = select, sepigs-http, sepigs-socks, DIRECT",
    "",
    "[Rule]",
    "FINAL,SEPIGS",
    ""
  ].join("\n");
}

function renderChrome(server: string, http: number, socks: number, url: string): string {
  return [
    "# Chrome / System Proxy Manual Verification",
    "",
    `HTTP proxy: \`${server}:${http}\``,
    `SOCKS5 proxy: \`${server}:${socks}\``,
    "",
    `Validation URL: ${url}`,
    "",
    "Expected result: the page loads through sepigs and sepigs logs/metrics show one new connection.",
    "",
    "Steps:",
    "",
    "1. Start sepigs with `examples/sepigs.safe.json` or an equivalent local HTTP/SOCKS config.",
    "2. Open the OS network proxy settings and configure either the HTTP proxy or SOCKS5 proxy above.",
    "3. Open the validation URL in Chrome.",
    "4. Disable the proxy after the test to roll back.",
    "",
    "Common failures: sepigs not running, port mismatch, system proxy cache, browser DNS cache, auth required by public config.",
    ""
  ].join("\n");
}

function renderShadowrocket(server: string, http: number, socks: number, url: string): string {
  return renderMobileGuide("Shadowrocket", server, http, socks, url);
}

function renderNekoBox(server: string, http: number, socks: number, url: string): string {
  return renderMobileGuide("NekoBox", server, http, socks, url);
}

function renderV2rayN(server: string, http: number, socks: number, url: string): string {
  return renderMobileGuide("v2rayN", server, http, socks, url);
}

function renderMobileGuide(client: string, server: string, http: number, socks: number, url: string): string {
  return [
    `# ${client} Manual Verification`,
    "",
    `HTTP proxy endpoint: \`${server}:${http}\``,
    `SOCKS5 proxy endpoint: \`${server}:${socks}\``,
    "",
    `Validation URL: ${url}`,
    "",
    "Expected result: traffic reaches the validation URL and sepigs metrics increment.",
    "",
    "Manual import:",
    "",
    "1. Create a local HTTP or SOCKS5 proxy profile.",
    `2. Set server to \`${server}\` and port to \`${socks}\` for SOCKS5, or \`${http}\` for HTTP.`,
    "3. Leave authentication empty unless testing `examples/sepigs.public-auth-required.json`.",
    "4. Enable the profile and open the validation URL.",
    "5. Disable/delete the profile to roll back.",
    "",
    "Status: ready-for-manual-verification. This file is not evidence that the GUI/mobile client was executed.",
    ""
  ].join("\n");
}
