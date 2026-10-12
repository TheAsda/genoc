---
'genoc': minor
---

Generated clients now pass the operation's effective security requirements to the requester: `Requester` options gain `security?: readonly SecurityRequirement[]` (OR-of-ANDs of `{ schemeName, scopes, scheme }` with the fully-resolved scheme object, oauth2 flows included), and the runtime exports `SecurityScheme`, `SecurityCall`, `SecurityRequirement`, `OAuthFlow`, and `OAuthFlows`. Contracts add a `SecuritySchemeName` union of the declared scheme keys. Ops declared `security: []` or with no requirements send no `security` field. `securitySchemes`/`security` are now validated per the OpenAPI spec (required fields per scheme type — `$ref` schemes included, unknown names/types, version-scoped scope rules, `mutualTLS` in 3.1 only, `security` on a Path Item rejected). Note: if you pin an older `genoc/runtime` via `--runtime-import-path`, clients generated from specs with security requirements will fail type-checking against it (excess property). (#17)
