---
'genoc': patch
---

v3.1 spec validation now reaches parity with v3.0: schemas under `components.schemas` are validated recursively (including `properties`, `items`, `additionalProperties`, `allOf`/`oneOf`/`anyOf`, and `prefixItems`), and 3.0-only constructs are rejected with dot-joined schema paths — `nullable`, boolean-form `exclusiveMinimum`/`exclusiveMaximum`, and array-form `items` (tuples must use `prefixItems`). Schema-level `example` stays accepted: deprecated but still legal per the frozen OpenAPI 3.1.0 spec. Legal 3.1 features (type arrays, `"type": "null"`, `$schema`, `$ref` siblings, `const`, `examples`) are explicitly not flagged.
