import type { DashboardRuntime } from "../server.js";
export const metricsResponse = (runtime: DashboardRuntime): string => runtime.metrics();
