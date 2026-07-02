import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createMetricsReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("metrics-server", "Does not bind or restart the metrics server.");
