# WireGuard Evaluation

Implementing WireGuard cryptography and packet state in TypeScript is not appropriate for this release. The prototype validates configuration, detects an installed `wg` executable, and defines a bounded external-process lifecycle adapter.

The existing outbound intentionally rejects TCP and UDP because no packet tunnel is attached. External execution remains experimental and is never started by default. Production work requires a pinned `wireguard-go` or OS WireGuard backend, privilege separation, interface cleanup, key handling, route rollback, and real packet tests.
