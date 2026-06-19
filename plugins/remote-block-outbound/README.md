# remote-block-outbound

This example registers `plugin.remoteBlock` from an isolated plugin runtime.

The plugin returns `{ "action": "block" }`. The host turns that into a normal outbound failure without crashing the process.

Example outbound:

```json
{ "type": "plugin.remoteBlock", "tag": "remote-block", "options": {} }
```
