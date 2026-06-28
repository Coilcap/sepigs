import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const TEMP_PREFIX = "sepigs-compat-";

export interface CompatTempDirectory {
  readonly path: string;
  cleanup(): Promise<void>;
}

export const createCompatTempDirectory = async (label: string): Promise<CompatTempDirectory> => {
  const safeLabel = sanitizeLabel(label);
  const path = await mkdtemp(join(tmpdir(), `${TEMP_PREFIX}${safeLabel}-`));
  return {
    path,
    cleanup: async () => {
      assertCompatTempPath(path);
      await rm(path, { recursive: true, force: true });
    }
  };
};

export const createCompatSubdirectory = async (root: string, label: string): Promise<string> => {
  assertCompatTempPath(root);
  const path = join(root, sanitizeLabel(label));
  await mkdir(path, { recursive: true, mode: 0o700 });
  return path;
};

export const writeCompatJson = async (directory: string, filename: string, value: unknown): Promise<string> => {
  assertCompatTempPath(directory);
  const path = join(directory, basename(filename));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
  return path;
};

export const writeCompatText = async (directory: string, filename: string, value: string): Promise<string> => {
  assertCompatTempPath(directory);
  const path = join(directory, basename(filename));
  await writeFile(path, value, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
  return path;
};

export const compatArtifactLabel = (path: string): string => {
  assertCompatTempPath(path);
  return `system-temp/${basename(path)}`;
};

const sanitizeLabel = (value: string): string => {
  const sanitized = value.replaceAll(/[^a-zA-Z0-9_.-]/gu, "-").replaceAll(/-+/gu, "-").replaceAll(/^-|-$/gu, "");
  return sanitized.length === 0 ? "run" : sanitized.slice(0, 80);
};

const assertCompatTempPath = (path: string): void => {
  const resolved = resolve(path);
  const root = `${resolve(tmpdir())}${sep}`;
  if (!resolved.startsWith(`${root}${TEMP_PREFIX}`)) {
    throw new Error(`refusing to operate outside the sepigs compatibility temp root: ${resolved}`);
  }
};
