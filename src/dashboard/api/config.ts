import type { DashboardRuntime } from "../server.js";
import { redact } from "../routes.js";
export const configResponse = (runtime: DashboardRuntime): unknown => redact(runtime.config());
