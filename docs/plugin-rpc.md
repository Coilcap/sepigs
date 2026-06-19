# Plugin RPC

Phase 7 adds remote outbound factory registration for isolated plugins.

## Supported

- `worker-thread` and `child-process` plugins can call `context.registerOutboundFactory("plugin.name", ...)`.
- The host registers a normal outbound factory in the central outbound registry.
- Runtime connect calls use request/response RPC with a JSON-safe payload.
- RPC calls have a timeout from `plugins.isolation.timeoutMs`.
- Plugin crash or stop unregisters the remote factory.
- API version mismatch is rejected by plugin manifest loading.
- Permission checks require `outbound:register`.

## Safety Boundary

Remote plugins do not receive sockets, streams, file descriptors, or raw handles.

For `outbound.connect`, the plugin returns one of:

```json
{ "action": "direct" }
```

or:

```json
{ "action": "block", "reason": "optional message" }
```

The host performs the actual TCP connect for `direct` using the normal timeout and DNS path. This keeps socket lifecycle ownership in the main runtime.

## Unsupported

- Passing socket handles to plugins.
- Plugin-implemented TCP stream transforms across process boundaries.
- Remote inbound factories.
- Remote UDP relay factories.

## Examples

- `plugins/remote-echo-outbound`
- `plugins/remote-block-outbound`

## Tests

```bash
npm test -- test/plugin-rpc.test.ts
```
