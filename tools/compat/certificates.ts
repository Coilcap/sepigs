import { execFile } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { writeCompatText } from "./temp.js";
import type { CompatTlsFiles } from "./config-generators/types.js";

const execFileAsync = promisify(execFile);

export interface TestCertificateResult {
  readonly status: "generated" | "blocked";
  readonly reason: string;
  readonly tls?: CompatTlsFiles;
}

export const generateTestCertificate = async (directory: string): Promise<TestCertificateResult> => {
  const openssl = await findExecutable("openssl");
  if (openssl === undefined) {
    return { status: "blocked", reason: "openssl is missing; ephemeral test TLS material cannot be generated" };
  }
  const certificatePath = join(directory, "test-only-cert.pem");
  const keyPath = join(directory, "test-only-key.pem");
  const configPath = await writeCompatText(directory, "test-only-openssl.cnf", [
    "[req]",
    "distinguished_name = dn",
    "x509_extensions = v3",
    "prompt = no",
    "[dn]",
    "CN = localhost",
    "[v3]",
    "subjectAltName = DNS:localhost,IP:127.0.0.1",
    "basicConstraints = critical,CA:FALSE",
    "keyUsage = critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage = serverAuth",
    ""
  ].join("\n"));
  try {
    await execFileAsync(openssl, [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-days",
      "1",
      "-config",
      configPath
    ], { timeout: 10_000, maxBuffer: 64 * 1024 });
    const certificate = new X509Certificate(await readFile(certificatePath));
    const certificateSha256 = createHash("sha256").update(certificate.raw).digest("hex");
    return {
      status: "generated",
      reason: "ephemeral loopback-only test certificate generated",
      tls: { certificatePath, keyPath, serverName: "localhost", certificateSha256 }
    };
  } catch (error) {
    return {
      status: "blocked",
      reason: `openssl test certificate generation failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

const findExecutable = async (name: string): Promise<string | undefined> => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const path = join(directory, name);
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      // Keep searching.
    }
  }
  return undefined;
};
