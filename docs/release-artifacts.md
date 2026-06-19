# Release Artifacts

Commands:

```sh
npm run build
npm run release:dry-run
npm run pack:tar
npm run pack:zip
```

Included:

- `dist/`
- `package.json`
- `package-lock.json`
- `README.md`
- `LICENSE`
- `examples/`
- `docs/`
- `CHANGELOG.md`
- `RELEASE.md`

Excluded:

- `node_modules/`
- `test/`
- `profiles/`
- transient benchmark or heap profile files outside documented reports

License: MIT, matching `package.json`.
