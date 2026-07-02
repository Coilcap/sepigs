import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createOutboundReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("outbound-registry", "Does not create, start, or replace production outbounds.");
