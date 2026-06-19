# Hot Reload

sepigs supports two reload paths:

- Config/rule reload through `HotReloadManager`.
- Inbound drain-and-rebind through `reloadInbounds`.

For inbound changes, sepigs starts changed new listeners first. If every changed listener starts, old changed/deleted listeners are drained and stop accepting new connections. Existing managed connections keep running until they close or time out. If any new listener fails, newly staged listeners are stopped and old listeners remain active.

Current limits:

- Rebinding the exact same address before closing the old listener is not possible with plain `net.Server`.
- Unchanged listeners are reused to avoid self-conflict.
- Active sockets are still closed on full engine shutdown.
