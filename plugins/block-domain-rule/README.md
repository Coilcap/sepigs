# block-domain-rule

Example manifest for a rule helper plugin. The current sepigs core loads the plugin manifest and module, while rule-set ingestion still happens through `route.ruleSetFiles`.

```yaml
rules:
  - tag: block-example
    domainSuffix:
      - blocked.example
```
