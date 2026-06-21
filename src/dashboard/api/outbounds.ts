import type { DashboardRuntime } from "../server.js";
export const outboundsResponse = (runtime: DashboardRuntime): unknown => runtime.outbounds();
