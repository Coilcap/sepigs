# wasm-header-transform

Example plugin package for WASM-oriented extensions. The current phase only loads and exposes WASM exports; HTTP header transformation is intentionally not wired into the proxy data path yet.

```json
{
  "plugins": {
    "modules": [
      { "tag": "wasm-header-transform", "path": "plugins/wasm-header-transform/manifest.json" }
    ],
    "wasm": [
      { "tag": "header-policy", "path": "plugins/wasm-header-transform/header-policy.wasm" }
    ]
  }
}
```
