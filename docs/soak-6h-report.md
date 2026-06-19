# Soak Report

- profile: 6h
- durationMs: 30000
- concurrency: 16
- workerDelayMs: 750
- reloadIntervalMs: 5000
- totalRequests: 640
- success: 640
- errors: 0
- errorReasons: {}
- successRate: 1
- throughputMbps: 0.01
- latencyP50Ms: 7.74
- latencyP95Ms: 13.37
- latencyP99Ms: 38.10
- eventLoopP50Ms: 22.05
- eventLoopP95Ms: 22.12
- eventLoopP99Ms: 22.50
- gcCount: 31
- gcTotalDurationMs: 40.69
- gcMaxDurationMs: 6.40
- reloadCount: 6
- failoverCount: 160
- rssMinMiB: 92.69
- rssMaxMiB: 104.11
- heapMinMiB: 10.87
- heapMaxMiB: 14.41
- latestRSSMiB: 103.97
- latestHeapMiB: 12.76
- activeResources: sockets=0 timers=1 listeners=0
- openFileDescriptors: 25
- finalAfterStop: sockets=0 timers=0 listeners=0
- finalOpenFileDescriptors: 23

## Samples

```json
[
  {
    "atMs": 1002,
    "rss": 100515840,
    "heapUsed": 13905840,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 2003,
    "rss": 103022592,
    "heapUsed": 11527320,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 3003,
    "rss": 104136704,
    "heapUsed": 12934152,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 4005,
    "rss": 105086976,
    "heapUsed": 12399864,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 5032,
    "rss": 107970560,
    "heapUsed": 13691440,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 6034,
    "rss": 109133824,
    "heapUsed": 11857592,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 7035,
    "rss": 109166592,
    "heapUsed": 14143880,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 8036,
    "rss": 104464384,
    "heapUsed": 12370656,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 9039,
    "rss": 103333888,
    "heapUsed": 13521352,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 10039,
    "rss": 97189888,
    "heapUsed": 11785160,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 11041,
    "rss": 98091008,
    "heapUsed": 11643152,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 12044,
    "rss": 99155968,
    "heapUsed": 11393784,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 13045,
    "rss": 99565568,
    "heapUsed": 11752392,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 14048,
    "rss": 100384768,
    "heapUsed": 12918056,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 15050,
    "rss": 101122048,
    "heapUsed": 12600960,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 16053,
    "rss": 101875712,
    "heapUsed": 11904096,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 17054,
    "rss": 102055936,
    "heapUsed": 13035776,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 18054,
    "rss": 102072320,
    "heapUsed": 12676920,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 19055,
    "rss": 102187008,
    "heapUsed": 12823480,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 20055,
    "rss": 102301696,
    "heapUsed": 13118256,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 21057,
    "rss": 102350848,
    "heapUsed": 12765112,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 22059,
    "rss": 102465536,
    "heapUsed": 13012512,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 23061,
    "rss": 102547456,
    "heapUsed": 13369840,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 24063,
    "rss": 102891520,
    "heapUsed": 13085064,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 25064,
    "rss": 103563264,
    "heapUsed": 14771544,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 26066,
    "rss": 106512384,
    "heapUsed": 13612360,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 27067,
    "rss": 106938368,
    "heapUsed": 14720768,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 28069,
    "rss": 108265472,
    "heapUsed": 13349152,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 29070,
    "rss": 108855296,
    "heapUsed": 15105952,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  },
  {
    "atMs": 30072,
    "rss": 109019136,
    "heapUsed": 13383216,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 25
  }
]
```
