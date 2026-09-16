---
'genoc': minor
---

Config file support: `genoc` now reads its settings from `.genocrc.yml` or `.genocrc.json`, discovered from the current directory up to the git repository boundary, or loaded explicitly with the new `--config` flag. A flat config generates a single client; a `clients` map generates multiple clients sequentially in one run — a failing target does not stop the loop, failures are aggregated (`× client "<name>": …`, exit 1 if any target failed) — and the new `--project <name>` flag runs a single named client. Relative `input`/`outputDir` paths resolve against the config file's directory. The `spec` positional and `--output-dir` are now optional when a config file supplies them. (#32)
