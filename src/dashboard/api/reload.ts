import type { DashboardRuntime } from "../server.js";
export const reloadResponse = async (runtime: DashboardRuntime): Promise<{ reloaded: true }> => { await runtime.reload(); return { reloaded: true }; };
