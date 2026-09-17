---
'genoc': patch
---

Resolve `$ref`s in multipart request bodies before classifying file inputs: a `$ref`'d `format: binary` property now generates a `FileInput` field appended as `formData.append(name, file.data, file.filename)` (and a `File[]` loop for arrays of binaries) instead of a plain append of the unresolved object. Whole-body `$ref`s to multipart schemas no longer silently drop all fields. Generation was also rearchitected around a single `analyze()` translation pass consumed by pure renderers — output for all other specs is byte-identical.
