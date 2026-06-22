# External Compatibility v0.2.0

No supported reference binary was installed; no external interoperability result is claimed.

| Protocol | Case | Status | Reason |
| --- | --- | --- | --- |
| shadowsocks | reference client -> sepigs inbound aes-128-gcm | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| shadowsocks | reference client -> sepigs inbound aes-256-gcm | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| shadowsocks | reference client -> sepigs inbound chacha20-ietf-poly1305 | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| shadowsocks | wrong password | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| shadowsocks | large payload | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| shadowsocks | remote close | skipped-with-reason | Skipped: no supported external reference binary found. Checked sslocal, ssserver, ss-local, ss-server, sing-box. |
| trojan | reference client -> sepigs inbound | skipped-with-reason | Skipped: no supported external reference binary found. Checked trojan-go, sing-box, xray. |
| trojan | wrong password | skipped-with-reason | Skipped: no supported external reference binary found. Checked trojan-go, sing-box, xray. |
| trojan | large payload | skipped-with-reason | Skipped: no supported external reference binary found. Checked trojan-go, sing-box, xray. |
| trojan | remote close | skipped-with-reason | Skipped: no supported external reference binary found. Checked trojan-go, sing-box, xray. |
| trojan | TLS termination and SNI | skipped-with-reason | Skipped: no supported external reference binary found. Checked trojan-go, sing-box, xray. |

Local fixtures remain covered by `npm test`; they are not external reference evidence.
