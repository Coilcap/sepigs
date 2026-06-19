# Soak Matrix Report

| Scenario | Status | Duration ms | Result |
| --- | --- | ---: | --- |
| low concurrency long connection | verified | 270.53 | single tunnel stayed usable across repeated writes |
| high concurrency short connection | verified | 65.10 | 64 short HTTP CONNECT requests completed |
| medium sustained requests | verified | 17.65 | 40 sequential requests completed |
| hot reload during traffic | verified | 1.75 | traffic worked before and after route reload |
| DNS failure fallback | verified | 21.54 | DNS failure used fallbackHosts |
| outbound failure failover | verified | 1.10 | block failure failed over to direct |
| auth success and failure | verified | 1.27 | auth failure rejected and success returned 7 bytes |
