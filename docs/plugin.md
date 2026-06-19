# Plugins

Plugins are ESM packages loaded from `plugins.modules`.

Manifest fields:

- `name`
- `version`
- `type`
- `entry`
- `permissions`
- `apiVersion`
- `description`

Supported permissions:

- `inbound:register`
- `outbound:register`
- `worker`
- `wasm`
- `network`

`apiVersion` must be `"1"`.

Plugins run in-process. The sandbox restricts sepigs API access by permission, but it is not an OS sandbox. Untrusted plugins should not be loaded in production.
