import { PrototypeReloadAdapter } from "./prototypeAdapter.js";

export const createFakeIpReloadAdapter = (): PrototypeReloadAdapter =>
  new PrototypeReloadAdapter("fake-ip-store", "Does not migrate, replace, or write a fake-IP store.");
