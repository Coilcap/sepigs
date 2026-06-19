import { mkdir, writeFile } from "node:fs/promises";
import inspector from "node:inspector";

const session = new inspector.Session();
session.connect();

const post = async <T>(method: string, params: object = {}): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    session.post(method, params, (error, result) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(result as T);
    });
  });
};

const main = async (): Promise<void> => {
  const durationMs = Number(process.env.PROFILE_DURATION_MS ?? "5000");
  await mkdir("profiles", { recursive: true });
  await post("Profiler.enable");
  await post("Profiler.start");
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
  const result = await post<{ readonly profile: object }>("Profiler.stop");
  const path = "profiles/cpu.cpuprofile";
  await writeFile(path, JSON.stringify(result.profile), "utf8");
  session.disconnect();
  console.log(`cpu profile written to ${path}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
