import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createDashboardReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("dashboard-server", "Does not bind or restart the Dashboard server.");
