import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createUdpReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("udp-session-manager", "Does not create, migrate, or close UDP sessions.");
