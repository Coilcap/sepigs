import type { DashboardRuntime } from "../server.js";
export const connectionResponse = (runtime: DashboardRuntime): unknown => runtime.connections();
