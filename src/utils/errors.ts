export class SepigsError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SepigsError";
    this.code = code;
  }
}

export class ConfigError extends SepigsError {
  public constructor(message: string) {
    super("CONFIG_ERROR", message);
    this.name = "ConfigError";
  }
}

export class ProtocolError extends SepigsError {
  public constructor(message: string) {
    super("PROTOCOL_ERROR", message);
    this.name = "ProtocolError";
  }
}

export class NetworkError extends SepigsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("NETWORK_ERROR", message, options);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends SepigsError {
  public constructor(message: string) {
    super("TIMEOUT", message);
    this.name = "TimeoutError";
  }
}

export class OutboundBlockedError extends SepigsError {
  public constructor(message: string) {
    super("OUTBOUND_BLOCKED", message);
    this.name = "OutboundBlockedError";
  }
}

export class RuntimeError extends SepigsError {
  public constructor(message: string) {
    super("RUNTIME_ERROR", message);
    this.name = "RuntimeError";
  }
}

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const errorCode = (error: unknown): string | undefined => {
  if (error instanceof SepigsError) {
    return error.code;
  }
  return undefined;
};
