import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createPluginReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("plugin-manager", "Does not load plugins, workers, WASM, or register factories.");
