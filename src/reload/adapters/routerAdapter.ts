import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createRouterReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("router", "Does not publish a production routing snapshot.");
