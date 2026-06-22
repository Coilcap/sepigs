# Dashboard Security

Dashboard is disabled by default, binds `127.0.0.1`, requires a token of at least 16 characters, rate-limits by source, and keeps CORS disabled unless explicitly enabled. Tests cover missing/incorrect auth, rate limiting, recursive config redaction, secret-free metrics, reload failure containment, and targeted connection termination.

The Web Dashboard is experimental. It does not persist the token; the token remains in page memory for the active session. API errors are displayed without embedding credentials. Use it locally only and do not expose the API or static UI directly to the Internet.
