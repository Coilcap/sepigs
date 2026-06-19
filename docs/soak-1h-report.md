# Soak Report

- profile: 1h
- durationMs: 60000
- concurrency: 16
- workerDelayMs: 500
- reloadIntervalMs: 5000
- totalRequests: 1910
- success: 1910
- errors: 0
- errorReasons: {}
- successRate: 1
- throughputMbps: 0.01
- latencyP50Ms: 3.46
- latencyP95Ms: 7.97
- latencyP99Ms: 10.66
- eventLoopP50Ms: 22.04
- eventLoopP95Ms: 22.10
- eventLoopP99Ms: 22.48
- gcCount: 47
- gcTotalDurationMs: 34.31
- gcMaxDurationMs: 2.73
- reloadCount: 12
- failoverCount: 480
- rssMinMiB: 95.11
- rssMaxMiB: 117.58
- heapMinMiB: 11.17
- heapMaxMiB: 20.04
- latestRSSMiB: 117.58
- latestHeapMiB: 18.62
- activeResources: sockets=0 timers=1 listeners=0
- openFileDescriptors: 27
- finalAfterStop: sockets=0 timers=0 listeners=0
- finalOpenFileDescriptors: 25

## Samples

```json
[
  {
    "atMs": 1002,
    "rss": 101990400,
    "heapUsed": 12642384,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 2004,
    "rss": 104267776,
    "heapUsed": 12346136,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 3005,
    "rss": 108003328,
    "heapUsed": 12066168,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 4005,
    "rss": 108675072,
    "heapUsed": 14496184,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 5016,
    "rss": 110739456,
    "heapUsed": 13962728,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 6016,
    "rss": 112230400,
    "heapUsed": 13271896,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 7018,
    "rss": 112427008,
    "heapUsed": 15553104,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 8019,
    "rss": 109412352,
    "heapUsed": 17827648,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 9020,
    "rss": 99729408,
    "heapUsed": 11712952,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 10022,
    "rss": 101302272,
    "heapUsed": 11942328,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 11023,
    "rss": 102334464,
    "heapUsed": 12754288,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 12022,
    "rss": 102924288,
    "heapUsed": 12339360,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 13024,
    "rss": 103055360,
    "heapUsed": 13253688,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 14026,
    "rss": 103235584,
    "heapUsed": 12649616,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 15027,
    "rss": 103366656,
    "heapUsed": 13578352,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 16028,
    "rss": 103809024,
    "heapUsed": 13033296,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 17029,
    "rss": 105414656,
    "heapUsed": 15274000,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 18030,
    "rss": 108167168,
    "heapUsed": 14579856,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 19032,
    "rss": 109608960,
    "heapUsed": 13891168,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 20032,
    "rss": 109920256,
    "heapUsed": 13214360,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 21035,
    "rss": 109953024,
    "heapUsed": 15488264,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 22035,
    "rss": 110182400,
    "heapUsed": 14924152,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 23037,
    "rss": 110411776,
    "heapUsed": 14251904,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 24039,
    "rss": 110477312,
    "heapUsed": 16545536,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 25040,
    "rss": 112082944,
    "heapUsed": 15960008,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 26042,
    "rss": 113098752,
    "heapUsed": 15432544,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 27045,
    "rss": 113311744,
    "heapUsed": 14819264,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 28044,
    "rss": 113344512,
    "heapUsed": 17007056,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 29045,
    "rss": 113590272,
    "heapUsed": 16367344,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 30047,
    "rss": 114311168,
    "heapUsed": 12572056,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 31047,
    "rss": 114327552,
    "heapUsed": 14830840,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 32049,
    "rss": 116080640,
    "heapUsed": 17085480,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 33049,
    "rss": 117555200,
    "heapUsed": 13036912,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 34051,
    "rss": 117555200,
    "heapUsed": 15284600,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 35053,
    "rss": 119652352,
    "heapUsed": 17563808,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 36055,
    "rss": 120684544,
    "heapUsed": 13824416,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 37057,
    "rss": 120700928,
    "heapUsed": 16008416,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 38060,
    "rss": 120700928,
    "heapUsed": 18203480,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 39061,
    "rss": 120717312,
    "heapUsed": 14546640,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 40062,
    "rss": 120766464,
    "heapUsed": 16812136,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 41063,
    "rss": 120766464,
    "heapUsed": 19072704,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 42064,
    "rss": 121241600,
    "heapUsed": 15530520,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 43067,
    "rss": 121257984,
    "heapUsed": 17771560,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 44068,
    "rss": 121257984,
    "heapUsed": 20012600,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 45071,
    "rss": 121274368,
    "heapUsed": 16358448,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 46072,
    "rss": 121290752,
    "heapUsed": 18536344,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 47073,
    "rss": 121307136,
    "heapUsed": 14910648,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 48073,
    "rss": 121356288,
    "heapUsed": 17134544,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 49074,
    "rss": 121356288,
    "heapUsed": 19314360,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 50074,
    "rss": 121618432,
    "heapUsed": 15666968,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 51076,
    "rss": 121847808,
    "heapUsed": 17949288,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 52079,
    "rss": 121847808,
    "heapUsed": 20186736,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 53079,
    "rss": 122077184,
    "heapUsed": 15871136,
    "activeSockets": 2,
    "activeTimers": 3,
    "activeListeners": 16,
    "openFileDescriptors": 40
  },
  {
    "atMs": 54079,
    "rss": 122322944,
    "heapUsed": 18022112,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 55081,
    "rss": 122388480,
    "heapUsed": 20306864,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 56082,
    "rss": 122830848,
    "heapUsed": 16674264,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 57084,
    "rss": 122847232,
    "heapUsed": 18838056,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 58085,
    "rss": 122880000,
    "heapUsed": 21017392,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 59088,
    "rss": 123256832,
    "heapUsed": 17342088,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  },
  {
    "atMs": 60090,
    "rss": 123289600,
    "heapUsed": 19523760,
    "activeSockets": 0,
    "activeTimers": 1,
    "activeListeners": 0,
    "openFileDescriptors": 27
  }
]
```
