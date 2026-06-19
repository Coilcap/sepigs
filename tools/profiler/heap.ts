import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import v8 from "node:v8";

const main = async (): Promise<void> => {
  await mkdir("profiles", { recursive: true });
  const path = "profiles/heap.heapsnapshot";
  const snapshot = v8.getHeapSnapshot();
  const output = createWriteStream(path);
  await new Promise<void>((resolve, reject) => {
    snapshot.pipe(output);
    output.once("finish", resolve);
    output.once("error", reject);
  });
  console.log(`heap snapshot written to ${path}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
