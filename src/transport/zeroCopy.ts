import type { Logger } from "../logger/logger.js";
import type { TcpStream } from "../protocol/types.js";

export interface ZeroCopyRelayOptions {
  readonly connectionId: string;
  readonly idleTimeoutMs: number;
  readonly logger: Logger;
  readonly onBytesClientToRemote?: (bytes: number) => void;
  readonly onBytesRemoteToClient?: (bytes: number) => void;
  readonly onClose?: (failed: boolean, reason: string) => void;
}

export const zeroCopyRelay = (client: TcpStream, remote: TcpStream, options: ZeroCopyRelayOptions): void => {
  let closed = false;

  const closeStream = (stream: TcpStream): void => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  };

  const cleanup = (failed = false, reason = "socket closed"): void => {
    if (closed) {
      return;
    }
    closed = true;

    client.removeListener("data", onClientData);
    remote.removeListener("data", onRemoteData);
    client.removeListener("error", onClientError);
    remote.removeListener("error", onRemoteError);
    client.removeListener("close", cleanup);
    remote.removeListener("close", cleanup);
    client.removeListener("timeout", onTimeout);
    remote.removeListener("timeout", onTimeout);

    client.unpipe(remote);
    remote.unpipe(client);
    closeStream(client);
    closeStream(remote);
    options.onClose?.(failed, reason);
  };

  const onClientData = (chunk: Buffer): void => {
    options.onBytesClientToRemote?.(chunk.byteLength);
  };

  const onRemoteData = (chunk: Buffer): void => {
    options.onBytesRemoteToClient?.(chunk.byteLength);
  };

  const onClientError = (error: Error): void => {
    options.logger.debug("client socket error", { connectionId: options.connectionId, error: error.message });
    cleanup(true, "client socket error");
  };

  const onRemoteError = (error: Error): void => {
    options.logger.debug("remote socket error", { connectionId: options.connectionId, error: error.message });
    cleanup(true, "remote socket error");
  };

  const onTimeout = (): void => {
    options.logger.debug("socket idle timeout", { connectionId: options.connectionId });
    cleanup(true, "idle timeout");
  };

  client.on("data", onClientData);
  remote.on("data", onRemoteData);
  client.once("error", onClientError);
  remote.once("error", onRemoteError);
  client.once("close", cleanup);
  remote.once("close", cleanup);
  client.once("timeout", onTimeout);
  remote.once("timeout", onTimeout);

  client.setTimeout(options.idleTimeoutMs);
  remote.setTimeout(options.idleTimeoutMs);
  client.pipe(remote);
  remote.pipe(client);
};
