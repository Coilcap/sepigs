import { readFile } from "node:fs/promises";
import { parseSubscription } from "../../src/subscription/parser.js";
import { validateSubscriptionOutbounds } from "../../src/subscription/validator.js";
import { redactSubscriptionOutbounds } from "../../src/subscription/redact.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const path = args.find((arg) => !arg.startsWith("--"));
const input = path === undefined || path === "-" ? await readStdin() : await readFile(path, "utf8");
const result = parseSubscription(input);
validateSubscriptionOutbounds(result.outbounds);
const output = { format: result.format, outbounds: dryRun ? redactSubscriptionOutbounds(result.outbounds) : result.outbounds, warnings: result.warnings, dryRun };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    const value: unknown = chunk;
    if (typeof value === "string" || Buffer.isBuffer(value)) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}
