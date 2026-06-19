import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";

interface GcEvent {
  readonly kind: number;
  readonly duration: number;
}

const gcEvents: GcEvent[] = [];
const observer = new PerformanceObserver((items) => {
  for (const entry of items.getEntries()) {
    const detail = (entry as { readonly detail?: { readonly kind?: number } }).detail;
    gcEvents.push({
      kind: detail?.kind ?? 0,
      duration: entry.duration
    });
  }
});

observer.observe({ entryTypes: ["gc"] });

const main = async (): Promise<void> => {
  const durationMs = Number(process.env.PROFILE_DURATION_MS ?? "5000");
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
  histogram.disable();
  observer.disconnect();
  console.log(
    JSON.stringify(
      {
        durationMs,
        eventLoopDelayMs: {
          p50: histogram.percentile(50) / 1_000_000,
          p95: histogram.percentile(95) / 1_000_000,
          p99: histogram.percentile(99) / 1_000_000,
          max: histogram.max / 1_000_000
        },
        gcEvents
      },
      null,
      2
    )
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
