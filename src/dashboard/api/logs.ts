import type { DashboardRuntime } from "../server.js";
export const logsResponse = (runtime: DashboardRuntime): unknown => runtime.logs();
