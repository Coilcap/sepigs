# Profiling

Commands:

```sh
npm run profile:cpu
npm run profile:heap
npm run profile:loop
```

Outputs:

- `profiles/cpu.cpuprofile`
- `profiles/heap.heapsnapshot`
- event-loop and GC JSON on stdout

Current review:

- CPU hotspots are expected in socket accept/connect, protocol parsing, and stream relay.
- Memory hotspots to watch are connection snapshots, Buffer accumulation in protocol readers, and test/benchmark client buffers.
- `ConnectionManager` owns sockets and removes listeners on close.
- `TimeoutManager` tracks timers; benchmark and soak reports include active timer counts.
- No known closure intentionally holds sockets after managed close.

Production profiling should be run during soak on the target host.
