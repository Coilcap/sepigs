# timeout-plugin

Intentional timeout fixture.

It never resolves `handle()`. The worker-thread or child-process runner should terminate it after `plugins.isolation.timeoutMs`.
