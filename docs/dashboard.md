# Web Dashboard

The dependency-free minimal dashboard is experimental. Build it with `npm run web:build`; output is written to `dist/dashboard`.

Serve that directory from a local static server, enter the local Dashboard API URL and token, then inspect status, connections, outbounds, logs, and redacted config. It can disconnect a connection and request config reload. The API does not serve static assets and the UI must not be exposed publicly.
