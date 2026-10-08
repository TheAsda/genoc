---
'genoc': minor
---

Generated clients now type path parameters from their schemas instead of always `string` — `type: integer`/`number` produces `number`, `type: boolean` produces `boolean`, enums become unions of their literals, and `$ref`s resolve to the named contract type. The generated `createClient(requester)` factory accepts an optional second argument with a `formatPathParam` option that overrides how path parameter values are serialized to their string form before URL-encoding; it defaults to `String` and is scoped per client. (#75)
