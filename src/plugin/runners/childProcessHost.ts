import { pathToFileURL } from "node:url";
import type { PluginPermission } from "../manifest.js";

interface HostRequest {
  readonly id: number;
  readonly method: "setup" | "start" | "stop" | "invoke";
  readonly payload?: unknown;
}

interface HostConfig {
  readonly tag: string;
  readonly entryPath: string;
  readonly name: string;
  readonly permissions: readonly PluginPermission[];
}

interface RemotePlugin {
  setup?(context: unknown): unknown;
  start?(): unknown;
  stop?(): unknown;
  handle?(payload: unknown): unknown;
}

type RemotePluginFactory = (context: unknown) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseConfig = (): HostConfig => {
  const raw = process.env.SEPIGS_PLUGIN_RUNNER_CONFIG;
  if (raw === undefined) {
    throw new Error("missing plugin runner config");
  }
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || typeof value.tag !== "string" || typeof value.entryPath !== "string" || typeof value.name !== "string") {
    throw new Error("invalid child-process plugin config");
  }
  const permissions = Array.isArray(value.permissions) ? value.permissions.filter((permission): permission is PluginPermission => typeof permission === "string") : [];
  return {
    tag: value.tag,
    entryPath: value.entryPath,
    name: value.name,
    permissions
  };
};

const isHostRequest = (value: unknown): value is HostRequest => {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    (value.method === "setup" || value.method === "start" || value.method === "stop" || value.method === "invoke")
  );
};

const send = (id: number, ok: boolean, payload: unknown): void => {
  if (process.send !== undefined) {
    process.send({ id, ok, payload });
  }
};

const sendEvent = (event: "registerOutboundFactory", type: string): void => {
  if (process.send !== undefined) {
    process.send({ event, type });
  }
};

const config = parseConfig();
let plugin: RemotePlugin = {};

const hasPermission = (permission: PluginPermission): boolean => config.permissions.includes(permission);

const createContext = (): unknown => {
  return {
    logger: {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error
    },
    workerPool: undefined,
    wasmExtensions: undefined,
    registerInboundFactory: () => {
      if (!hasPermission("inbound:register")) {
        throw new Error(`plugin "${config.name}" does not have inbound:register permission`);
      }
      throw new Error("isolated plugins cannot register inbound factories in this runtime");
    },
    registerOutboundFactory: (type: unknown) => {
      if (!hasPermission("outbound:register")) {
        throw new Error(`plugin "${config.name}" does not have outbound:register permission`);
      }
      if (typeof type !== "string" || !type.startsWith("plugin.")) {
        throw new Error(`plugin "${config.name}" can only register plugin.* outbound factories`);
      }
      sendEvent("registerOutboundFactory", type);
    }
  };
};

const loadPlugin = async (): Promise<RemotePlugin> => {
  const imported = (await import(pathToFileURL(config.entryPath).href)) as unknown;
  const namespace = isRecord(imported) ? imported : {};
  const exported = namespace.default ?? namespace.plugin ?? imported;
  if (typeof exported === "function") {
    const factory = exported as RemotePluginFactory;
    const created = await factory(createContext());
    return isRecord(created) ? created : {};
  }
  return isRecord(exported) ? exported : {};
};

process.on("message", (message: unknown) => {
  if (!isHostRequest(message)) {
    return;
  }
  void (async () => {
    try {
      if (message.method === "setup") {
        plugin = await loadPlugin();
        await plugin.setup?.(createContext());
        send(message.id, true, undefined);
        return;
      }
      if (message.method === "start") {
        await plugin.start?.();
        send(message.id, true, undefined);
        return;
      }
      if (message.method === "stop") {
        await plugin.stop?.();
        send(message.id, true, undefined);
        return;
      }
      if (plugin.handle === undefined) {
        throw new Error(`plugin "${config.tag}" does not expose handle()`);
      }
      send(message.id, true, await plugin.handle(message.payload));
    } catch (error) {
      send(message.id, false, error instanceof Error ? error.message : String(error));
    }
  })();
});
