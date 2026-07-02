import net from "node:net";

export const probeTcpPort = async (
  host: string,
  port: number,
  signal: AbortSignal
): Promise<void> => {
  if (signal.aborted) throw new Error("runtime port probe aborted before start");
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
      if (error === undefined) resolve();
      else reject(error);
    };
    const closeAndFinish = (error?: Error): void => {
      if (!server.listening) {
        finish(error);
        return;
      }
      server.close((closeError?: Error) => {
        finish(error ?? closeError);
      });
    };
    const onAbort = (): void => {
      closeAndFinish(new Error("runtime port probe aborted"));
    };
    const onError = (error: Error): void => {
      finish(error);
    };
    const onListening = (): void => {
      closeAndFinish();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
};
