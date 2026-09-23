---
'genoc': patch
---

`undici` is no longer bundled as a regular dependency: it moved to an optional peer dependency (`^6.13.0 || ^7 || ^8`). Fetching specs through a proxy now requires installing it yourself (`npm install undici`); genoc keeps working without undici when no proxy is configured. The Node.js engine floor rises from 18 to 20.18.1 — the minimum required by undici v7, which the peer range now admits. A missing `undici` during a proxied fetch now produces an actionable install hint instead of a wrapped fetch failure.
