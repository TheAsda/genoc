---
'genoc': minor
---

Remove the programmatic API: `generateClient`, `loadSpec`, and the root package export are gone. genoc is now CLI-only — generate clients with the `genoc` binary (optionally configured via `.genocrc.yml` / `.genocrc.json`). Generated code is unaffected: it imports from `genoc/runtime`, which remains published.

BREAKING CHANGE: the `genoc` package root no longer exports anything. `import { generateClient, loadSpec } from 'genoc'` (and root type imports) now fail at build time — use the CLI instead, and import runtime values (`ApiError`, `isDefinedError`, `Requester`, …) from `genoc/runtime`.
