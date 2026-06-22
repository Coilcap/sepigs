# Subscription Compatibility

Supported and regression-tested inputs:

- SIP002-style `ss://` URIs for the three documented AEAD methods.
- `trojan://` URI password, endpoint, SNI, TLS, and insecure flags.
- Common Clash SS/Trojan proxy fields.
- Common sing-box direct/block/SS/Trojan outbound fields.
- Xray freedom/blackhole subset.

Unsupported entries produce warnings when a structured format can continue. Malformed URI input throws a clear `ConfigError`. Normalization produces stable safe tags and removes exact endpoint duplicates. `sub:dry-run` redacts passwords and keys. VMess/VLESS conversion, provider update code, remote fetching, and signatures are unsupported.
