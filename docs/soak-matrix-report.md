# Soak Matrix Report

| Scenario | Status | Duration ms | Result |
| --- | --- | ---: | --- |
| low concurrency long connection | verified | 269.46 | single tunnel stayed usable across repeated writes |
| high concurrency short connection | verified | 71.53 | 64 short HTTP CONNECT requests completed |
| medium sustained requests | verified | 19.66 | 40 sequential requests completed |
| hot reload during traffic | verified | 2.84 | traffic worked before and after route reload |
| DNS failure fallback | verified | 23.02 | DNS failure used fallbackHosts |
| outbound failure failover | verified | 1.22 | block failure failed over to direct |
| auth success and failure | verified | 1.30 | auth failure rejected and success returned 7 bytes |
