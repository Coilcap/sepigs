# crash-plugin

Intentional failure fixture.

It exits during `start()` and must only be used in isolation tests. A crash from this plugin should be reported as a plugin runner failure, not crash sepigs.
