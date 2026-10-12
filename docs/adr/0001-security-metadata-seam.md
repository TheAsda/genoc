# ADR 0001: Security requirements travel as request metadata, not codegen auth

- Status: Accepted (issue #17)
- Date: 2026-09-05

## Context

`components.securitySchemes` already renders to inert `{Name}Auth` literal types, but the
`security` field — global and per-operation — is ignored: a generated client never tells the
requester anything about authentication. The obvious completion is to make generated clients
_apply_ auth themselves (read headers, run OAuth flows, refresh tokens).

That completion is a trap. Applying auth means executing protocol logic (token refresh, scope
negotiation) and handling credentials — runtime concerns that outlive codegen, vary per
deployment (test stubs, proxies, CI), and would have to be re-generated on every spec change.
OAuth2 alone covers four flows with deployment-specific secrets; codegen would own the worst
kind of runtime code. The `Requester` seam already exists precisely so transport decisions stay
with the caller — `expectStream` set the precedent of generated code _annotating_ requests with
facts the requester cannot infer from `(method, path)`.

## Decision

Generated clients will not implement authentication. They will pass the operation's effective
security requirements — resolved against `components.securitySchemes`, full-fidelity — as a
`security` option on every request that has any:

- outer array = alternatives (any one suffices), inner array = conjunctive calls (spec's OR-of-ANDs);
- each call is `{ schemeName, scopes, scheme }` with the resolved scheme object riding inline
  (module-level consts, so oauth2 flow bloat is capped at one const per scheme);
- ops with `security: []` or no requirements anywhere get no `security` field at all.

The runtime package stays spec-agnostic: it gains structural twin types
(`SecurityScheme` as a discriminated union, `SecurityCall`, `SecurityRequirement`) that the
contracts' literal `{Name}Auth` types satisfy by assignability — validation guarantees the
required fields exist. Satisfying the requirements (or ignoring them) is the requester
implementer's decision.

Contracts additionally export `SecuritySchemeName` — a union of the spec's `securitySchemes`
keys — so user-side helpers can parameterize on scheme names without re-declaring them.

Two validation decisions keep the bridge sound and the behavior honest:

- **Invalid security constructs are rejected, never silently ignored.** `security` on a Path
  Item (which some converters emit) is invalid OpenAPI — erroring beats silently generating a
  client whose calls lost their auth metadata. The same stance covers unknown scheme
  names/types and missing required fields.
- **`$ref` scheme entries are followed during validation** (internal `#/` pointers, cycle
  guarded), so the "validation ⇒ well-formed payloads" guarantee covers referenced schemes
  too; external-document refs remain the ref-resolver's boundary.

All spec-derived strings interpolated into generated literals (scheme names, descriptions,
flow URLs, scope keys/values) are escaped via the shared `escapeStringLiteral`/
`sanitizeJsDocText` helpers — the same treatment schemas already get.

## Consequences

- The requester author writes the only security code a human writes by hand (~10 lines for
  header injection; more for token refresh, where `flows.tokenUrl` is available when needed).
- Spec validation must become strict about `securitySchemes`/`security` (required fields per
  scheme type, unknown names/types, version-scoped scope rules) — otherwise the structural
  assignability bridge is unsound.
- Generated clients pass `security` only when the spec declares requirements, so
  old-runtime/new-client pairings only surface as TS excess-property errors on secured specs;
  called out in the changeset.
- Rejected alternative: per-operation security _types_ — nobody hand-writes these values, so
  precision there had no consumer; per-operation knowledge lives in JSDoc instead.
