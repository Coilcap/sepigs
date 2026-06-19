# DNS

Current DNS support:

- Static `hosts`.
- System DNS through `dns.lookup`.
- UDP DNS A-record queries.
- DoH POST queries using `application/dns-message`.
- Cache with configured maximum TTL.
- DNS route rules selecting UDP DNS servers by domain suffix.
- `fallbackHosts` when resolution fails.

Reserved boundaries:

- fake-ip config is parsed but not allocated yet.

DoH example:

```json
{
  "dns": {
    "doh": {
      "enabled": true,
      "endpoints": ["https://dns.example/dns-query"],
      "timeoutMs": 1000
    },
    "fallbackHosts": {
      "important.internal": "10.0.0.10"
    }
  }
}
```

Each DoH upstream is tried once per lookup; sepigs does not retry indefinitely.

Security note: DNS queries reveal destination names to the chosen resolver. Use local trusted resolvers when privacy matters.
