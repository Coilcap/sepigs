import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createDnsReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("dns", "Does not construct or publish a production DNS resolver.");
