---
'genoc': patch
---

Fix multipart form field types: non-file fields no longer collapse to `string`. A `multipart/form-data` body property declared via `$ref` (e.g. an object schema) previously rendered as `string` in the body type and was appended raw to `FormData` (serializing to `[object Object]`). Non-binary fields now keep their schema type through the mapper (`$ref` → the referenced named type, arrays → `T[]`, numbers/booleans → their primitive), and the generated client appends non-string fields as `JSON.stringify(...)` while string-valued fields (including `$ref`s to string schemas) keep direct appends. Binary handling (`FileInput`/`FileInput[]`) is unchanged.
