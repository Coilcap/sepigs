# Transactional Reload Runtime Smoke

- Generated: 2026-07-03T01:19:29.286Z
- Mode: transactional-experimental
- Enabled components: metrics, dashboard
- Transaction: runtime-reload-1783041569277-1
- Generation: runtime-control-0 -> runtime-control-1
- State: committed
- Rollbacks: 0
- Metrics endpoint: passed
- Dashboard endpoint: passed
- Legacy fallback used: no
- Data plane mutated: no

| Component | Prepared | Committed | Rolled back |
| --- | --- | --- | --- |
| metrics | yes | yes | no |
| dashboard | yes | yes | no |

## Cleanup

- Transaction cleanup completed: yes
- Cleanup errors: 0
- Active connections after stop: 0
- Active sockets/timers/listeners after stop: 0/0/0
