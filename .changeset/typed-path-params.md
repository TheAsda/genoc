---
'genoc': minor
---

Generated clients now type path parameters from their schemas instead of always `string` — `type: integer`/`number` produces `number | string`, `type: boolean` produces `boolean | string`, enums become unions of their literals widened by `string`, and `$ref`s resolve to the named contract type widened by `string`. The `string` arm is the escape hatch: pass a pre-formatted string when the default serialization is not what your API expects. Typed values are serialized inline with `String()` before URL-encoding. `createClient(requester)` takes no options. (#71)
