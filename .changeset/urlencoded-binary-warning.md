---
'genoc': patch
---

Warn on binary file data declared under `application/x-www-form-urlencoded` request bodies, and fix multipart bodies that declare their form fields via `allOf`. A urlencoded body containing `format: binary` fields cannot transport them, but previously typed them silently as plain strings; genoc now prints a warning naming the offending fields (found through `allOf`, `$ref`, arrays, and nested objects, cycle-safe). Separately, a `multipart/form-data` body whose fields live in `allOf` members used to collapse to `Record<string, never>` and drop every FormData append — the multipart property walk now merges `allOf` members (recursively, resolving `$ref`s, unioning `required`), so those fields generate as `FileInput`/`FileInput[]`/string fields again.
