# remote-echo-outbound

This example registers `plugin.remoteEcho` from an isolated plugin runtime.

The plugin does not receive sockets. It returns `{ "action": "direct" }`, and the sepigs host opens the TCP connection through the normal outbound path.

Example outbound:

```json
{ "type": "plugin.remoteEcho", "tag": "remote-echo", "options": {} }
```
