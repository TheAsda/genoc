---
'genoc': patch
---

Classify responses and request bodies as binary when the resolved schema has `format: binary` — vendor content types like `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` now generate `StreamResponse` returns with `expectStream: true` and `Blob` bodies instead of a broken `string` contract.
