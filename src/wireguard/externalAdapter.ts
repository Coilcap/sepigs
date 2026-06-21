import { spawn, type ChildProcess } from "node:child_process";
import { NetworkError } from "../utils/errors.js";

export class ExternalWireGuardAdapter {
  private child: ChildProcess | undefined;
  public constructor(private readonly command: string, private readonly args: readonly string[]) {}
  public async start(): Promise<void> {
    if (this.child !== undefined) return;
    const child = spawn(this.command, [...this.args], { stdio: "ignore", env: { PATH: process.env.PATH ?? "" } });
    this.child = child;
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", (error) => { reject(new NetworkError("failed to start WireGuard userspace adapter", { cause: error })); }); });
  }
  public async stop(): Promise<void> { const child = this.child; this.child = undefined; if (child === undefined) return; child.kill("SIGTERM"); await new Promise<void>((resolve) => { child.once("exit", () => { resolve(); }); setTimeout(resolve, 2_000).unref(); }); }
}
