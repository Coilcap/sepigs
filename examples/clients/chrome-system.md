# Chrome / System Proxy Manual Verification

HTTP proxy: `127.0.0.1:8080`
SOCKS5 proxy: `127.0.0.1:1080`

Validation URL: https://example.com/

Expected result: the page loads through sepigs and sepigs logs/metrics show one new connection.

Steps:

1. Start sepigs with `examples/sepigs.safe.json` or an equivalent local HTTP/SOCKS config.
2. Open the OS network proxy settings and configure either the HTTP proxy or SOCKS5 proxy above.
3. Open the validation URL in Chrome.
4. Disable the proxy after the test to roll back.

Common failures: sepigs not running, port mismatch, system proxy cache, browser DNS cache, auth required by public config.
