# echo-outbound

Example outbound plugin for sepigs API version 1.

```json
{
  "plugins": {
    "modules": [
      { "tag": "echo-plugin", "path": "plugins/echo-outbound/manifest.json" }
    ]
  },
  "outbounds": [
    { "type": "plugin.echoOutbound", "tag": "echo", "options": {} }
  ]
}
```
