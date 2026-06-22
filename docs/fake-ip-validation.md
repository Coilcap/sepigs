# Fake-IP Validation

Phase 9 validates domain-to-address and address-to-domain mappings, TTL expiry, bounded LRU reuse, optional persistence restoration, real DNS cache isolation, router domain recovery, HTTP and UDP paths, and mapping continuity across compatible route reloads.

Fake-IP remains disabled by default. State files contain browsing-domain mappings and must use protected storage. Disabling fake-IP leaves static/system DNS behavior unchanged. A standalone DNS listener is still outside the supported boundary.
