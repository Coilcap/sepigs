import net from "node:net";

export const COMPAT_LOOPBACK = "127.0.0.1";

export const allocateLoopbackPort = async (): Promise<number> => {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, COMPAT_LOOPBACK);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    server.close();
    throw new Error("compatibility port allocator did not receive an address");
  }
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return address.port;
};

export const isTcpPortOpen = async (
  port: number,
  host = COMPAT_LOOPBACK,
  timeoutMs = 250
): Promise<boolean> =>
  await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (open: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    socket.once("connect", () => {
      finish(true);
    });
    socket.once("error", () => {
      finish(false);
    });
    socket.once("close", () => {
      finish(false);
    });
  });

export const waitForTcpPort = async (
  port: number,
  options: { readonly host?: string; readonly timeoutMs: number; readonly intervalMs?: number }
): Promise<boolean> => {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await isTcpPortOpen(port, options.host ?? COMPAT_LOOPBACK)) {
      return true;
    }
    await delay(options.intervalMs ?? 50);
  }
  return false;
};

export const waitForTcpPortClosed = async (
  port: number,
  options: { readonly host?: string; readonly timeoutMs: number; readonly intervalMs?: number }
): Promise<boolean> => {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isTcpPortOpen(port, options.host ?? COMPAT_LOOPBACK))) {
      return true;
    }
    await delay(options.intervalMs ?? 50);
  }
  return false;
};

const delay = async (timeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
};
