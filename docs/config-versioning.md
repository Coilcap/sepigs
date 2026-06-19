# Config Versioning

Current config version: `1`.

```json
{
  "configVersion": 1
}
```

Behavior:

- Missing `configVersion` is treated as v0 and migrated to v1 with a warning when loaded from a file.
- Explicit `configVersion: 0` is migrated to v1 with a warning.
- Unknown future versions are rejected.
- The schema remains strict after migration.

Breaking-change policy:

- Additive fields keep the current version.
- Removed or renamed fields require a new config version and a migration function.
- Future versions must fail closed in older sepigs builds.
