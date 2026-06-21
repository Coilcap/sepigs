# Subscription Parser

The parser accepts `ss://`, `trojan://`, legacy `wireguard://`, Clash YAML proxies, sing-box JSON outbounds, and the supported direct/block subset of Xray JSON. It normalizes tags, removes exact duplicates, and returns warnings for unsupported entries.

```bash
npm run sub:parse -- examples/subscriptions/sample.txt
npm run sub:dry-run
```

Parsing is local and never executes subscription content. `sub:dry-run` redacts credentials; `sub:parse` emits usable credentials only when explicitly requested. Commands do not log the original input. Provider fetching, signatures, update scheduling, VMess/VLESS conversion, and remote code are unsupported.
