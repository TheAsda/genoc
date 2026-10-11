---
'genoc': minor
---

Generated clients now pass the operation's effective security requirements to the requester: `Requester` options gain `security?: readonly SecurityRequirement[]` (OR-of-ANDs of `{ schemeName, scopes, scheme }` with the fully-resolved scheme object, oauth2 flows included), and the runtime exports `SecurityScheme`, `SecurityCall`, and `SecurityRequirement`. Ops declared `security: []` or with no requirements send no `security` field. `securitySchemes`/`security` are now validated per the OpenAPI spec (required fields per scheme type, unknown names/types, version-scoped scope rules, `mutualTLS` in 3.1 only). Note: if you pin an older `genoc/runtime` via `--runtime-import-path`, clients generated from specs with security requirements will fail type-checking against it (excess property). (#17)
