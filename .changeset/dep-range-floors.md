---
'genoc': patch
---

Widen the declared `yaml` and `zod` dependency ranges to empirically verified minimums (`yaml` `^2.2.2`, `zod` `^4.0.0`) so consumer-installed versions can be reused and deduped; a new CI job tests the codebase against these minimums.
