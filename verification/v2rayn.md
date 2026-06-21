# v2rayN Acceptance

Status: ready for manual sign-off. Not yet verified on a Windows host.

## Configuration

- Server type: SOCKS
- Address: the sepigs host address
- Port: `1080`
- Alternative HTTP proxy: port `8080`
- Authentication: match the selected sepigs inbound configuration

## Import

1. Start sepigs and confirm Windows can reach its listener.
2. Add a custom SOCKS server in v2rayN using the values above.
3. Set it as the active server and enable system proxy.
4. Clear system proxy and restore the previous server to roll back.

## Test URL

`https://example.com/`

## Expected Result

v2rayN shows a successful request, the page returns HTTP 200, and sepigs metrics increase without failed authentication.

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Server saves | No validation error | Pending | Pending | Screenshot |
| SOCKS connection | Successful | Pending | Pending | v2rayN log |
| URL request | HTTP 200 | Pending | Pending | Browser screenshot |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | System proxy cleared | Pending | Pending | Screenshot |
