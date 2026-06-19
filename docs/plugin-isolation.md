# Plugin Isolation

Phase 6 adds three plugin runner modes:

- `in-process`: fastest and backwards compatible. Use only for trusted plugins.
- `worker-thread`: isolates crashes from normal JavaScript exceptions and supports memory limits through worker resource limits.
- `child-process`: runs plugins in a separate Node.js process and applies `--max-old-space-size`.

```json
{
  "plugins": {
    "modules": [
      { "tag": "echo", "path": "plugins/isolated-echo/manifest.json", "enabled": true }
    ],
    "wasm": [],
    "isolation": {
      "mode": "worker-thread",
      "timeoutMs": 3000,
      "memoryLimitMb": 64,
      "stdoutLimitBytes": 65536
    }
  }
}
```

Current boundary:

- Isolated plugins can run lifecycle and `handle(payload)` style calls.
- sepigs API permissions are still checked.
- Runtime factory registration from isolated plugins is blocked because function objects cannot be safely transferred across worker/process boundaries.
- For plugin outbounds/inbounds that register factories, use `in-process` only with trusted code until the remote factory protocol is implemented.

Test fixtures:

- `plugins/isolated-echo`
- `plugins/crash-plugin`
- `plugins/timeout-plugin`
