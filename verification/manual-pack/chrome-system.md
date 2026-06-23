# Chrome And System Proxy

Status: `not tested`; `ready-for-human-signoff`.

1. Start sepigs with a local or authenticated trusted-LAN configuration.
2. Configure the OS HTTP proxy as `SEPIGS_HOST:8080` or SOCKS5 proxy as `SEPIGS_HOST:1080`.
3. Open `https://example.com/` in Chrome and confirm a matching Dashboard/metrics connection.
4. On failure, check listener reachability, credentials, system proxy exclusions, firewall, and competing proxy software.
5. Restore direct/automatic system proxy mode to roll back.

| Device | OS version | Chrome version | Tester/time | Request | Metrics | Rollback | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | pending | pending | pending | not tested | Pending screenshot/log |
