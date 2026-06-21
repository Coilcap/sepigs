import type { DashboardRuntime } from "../server.js";
export const statusResponse = (runtime: DashboardRuntime): unknown => ({ stats: runtime.stats(), resources: runtime.resources(), leaks: runtime.leaks() });
