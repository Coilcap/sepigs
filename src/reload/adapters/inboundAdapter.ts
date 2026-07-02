import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createInboundReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("inbound-listeners", "Does not bind, drain, or close an inbound listener.");
