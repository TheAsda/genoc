---
'genoc': patch
---

Remove the dead `src/generator/error-types.ts` module. `generateErrorTypes` was never called by the generation pipeline and had diverged from the live inline scheme (methodName-based prefixes, un-renamed tsTypes, inline ApiError classes already emitted by contracts-generator).
