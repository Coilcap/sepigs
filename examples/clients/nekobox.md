# NekoBox Manual Verification

HTTP proxy endpoint: `127.0.0.1:8080`
SOCKS5 proxy endpoint: `127.0.0.1:1080`

Validation URL: https://example.com/

Expected result: traffic reaches the validation URL and sepigs metrics increment.

Manual import:

1. Create a local HTTP or SOCKS5 proxy profile.
2. Set server to `127.0.0.1` and port to `1080` for SOCKS5, or `8080` for HTTP.
3. Leave authentication empty unless testing `examples/sepigs.public-auth-required.json`.
4. Enable the profile and open the validation URL.
5. Disable/delete the profile to roll back.

Status: ready-for-manual-verification. This file is not evidence that the GUI/mobile client was executed.
