import { cp, mkdir, rm } from "node:fs/promises";
const output = new URL("../dist/dashboard/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("public/", import.meta.url), output, { recursive: true });
console.log("dashboard built at dist/dashboard");
