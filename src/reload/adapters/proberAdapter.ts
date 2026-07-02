import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createProberReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("policy-prober", "Does not schedule probes or mutate production health state.");
