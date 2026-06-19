# Protocol Compatibility Matrix

| Protocol | Direction | Case | Status | Evidence | Reason |
| --- | --- | --- | --- | --- | --- |
| shadowsocks | sepigs outbound -> local reference fixture | aes-128-gcm | verified-local-fixture | test/compat/shadowsocks-compat.test.ts | Covered by local protocol fixture in npm test, not an external implementation claim. |
| shadowsocks | sepigs outbound -> local reference fixture | aes-256-gcm | verified-local-fixture | test/compat/shadowsocks-compat.test.ts | Covered by local protocol fixture in npm test, not an external implementation claim. |
| shadowsocks | sepigs outbound -> local reference fixture | chacha20-ietf-poly1305 | verified-local-fixture | test/compat/shadowsocks-compat.test.ts | Covered by local protocol fixture in npm test, not an external implementation claim. |
| shadowsocks | sepigs outbound -> external reference server | wrong password failure | skipped-with-reason | missing binary | No shadowsocks-rust/libev reference server binary found in PATH. |
| shadowsocks | sepigs outbound -> external reference server | remote close | skipped-with-reason | missing binary | No shadowsocks-rust/libev reference server binary found in PATH. |
| shadowsocks | sepigs outbound -> external reference server | large payload | skipped-with-reason | missing binary | No shadowsocks-rust/libev reference server binary found in PATH. |
| shadowsocks | reference client -> sepigs inbound | all ciphers | unsupported | src/inbound | sepigs does not implement Shadowsocks inbound in Phase 7. |
| trojan | sepigs outbound -> local reference fixture | plain TCP test mode | verified-local-fixture | test/compat/trojan-compat.test.ts | Covered by local protocol fixture in npm test, not a public TLS ecosystem claim. |
| trojan | sepigs outbound -> external reference server | wrong password failure | skipped-with-reason | missing binary | No trojan-go/trojan reference binary found in PATH. |
| trojan | sepigs outbound -> external reference server | SNI/serverName behavior | skipped-with-reason | missing binary | No trojan-go/trojan reference binary found in PATH. |
| trojan | sepigs outbound -> external reference server | remote close | skipped-with-reason | missing binary | No trojan-go/trojan reference binary found in PATH. |
| trojan | sepigs outbound -> external reference server | large payload | skipped-with-reason | missing binary | No trojan-go/trojan reference binary found in PATH. |
| trojan | reference client -> sepigs inbound | all cases | unsupported | src/inbound | sepigs does not implement Trojan inbound in Phase 7. |
