# External Reference Installation Plan

This is an operator plan, not an automatic installer. Verify upstream release
ownership, license, version, signature/checksum, and architecture before
running any command. Never use `curl | sh`.

## macOS

| Tool | Candidate install command | Version check | Cleanup |
| --- | --- | --- | --- |
| shadowsocks-rust | `cargo install shadowsocks-rust --version 1.24.0 --locked` or a verified official release artifact | `ssserver --version`; `sslocal --version` | `cargo uninstall shadowsocks-rust` |
| shadowsocks-libev | Confirm formula availability, then `brew install shadowsocks-libev` | `ss-server -h`; `ss-local -h` | `brew uninstall shadowsocks-libev` |
| Trojan-Go | Confirm formula availability before `brew install trojan-go`; otherwise use a checksummed official release artifact | `trojan-go -version` | `brew uninstall trojan-go` or remove the manually installed file |

Run `brew info <formula>` before installation. Homebrew availability and
version may differ by tap and date. Do not add an unreviewed tap merely to make
a compatibility case run.

## Linux

- Check the distribution package index first with `apt-cache policy
  <package>`. Install only a version whose source and maintenance status are
  acceptable.
- For shadowsocks-rust, a pinned `cargo install ... --locked` is an alternative
  when the Rust toolchain itself is trusted and recorded.
- For a release archive, download the artifact and its published checksum as
  separate files, verify `sha256sum -c`, inspect archive paths, then place the
  executable in an isolated test-only directory on `PATH`.
- Remove apt packages with `sudo apt remove <package>` and manually installed
  files by deleting only the recorded path.

After installation, run `compat:detect` and `compat:fingerprint` before any
traffic case. A missing binary remains skipped; installation failure must not
be rewritten as verified.
