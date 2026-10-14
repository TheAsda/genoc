# CONTEXT.md — domain concepts

Named concepts of the codebase. Every entry is vocabulary worth using in commits, reviews, and conversation.

## VersionProfile

What `resolveVersion(doc, override?)` in `src/parser/version/` returns: the detected and effective spec dialect (`'3.0' | '3.1'`) plus every behavioral consequence derivation of that dialect (today: `preserveRefSiblings`).

It is the only sanctioned way code outside `src/parser/version/` learns about spec dialect — no string-comparing `doc.openapi` elsewhere.

## AnalyzedSpec

What the analyzer module (`src/analyzer/`) produces from one OpenAPI spec: everything generation consumes — operations, component schemas, security schemes, servers, spec version — expressed once, in generation-ready terms.

Generators read the AnalyzedSpec and nothing else. The raw OpenAPI document stays behind the parser/analyzer boundary.

## Security Scheme

One named authentication mechanism, declared in `components.securitySchemes` — the only declaration site in both 3.0 and 3.1 (external-document references are outside the boundary). Typed by `type`: `apiKey`, `http`, `oauth2`, `openIdConnect`, plus `mutualTLS` in 3.1 only.

## Security Requirement

One alternative of what auth an operation needs — the OAS Security Requirement Object: a map of scheme name → scope list where several schemes are conjunctive (all must be satisfied). The `security` field (document or operation level) is a _list_ of requirements with OR semantics. Requirement names resolve against the entry document's components. The scope rule is version-scoped: 3.0 requires the scope array to be empty for non-oauth2/openIdConnect schemes; 3.1 allows role names there. The runtime `SecurityRequirement` type mirrors the single object — a readonly list of conjunctive `SecurityCall`s — not the outer list.

## Optional security

An empty Security Requirement Object (`{}`) inside a `security` list means anonymous access is an acceptable alternative. Not to be confused with an empty `security` list (`[]`), which removes an outer declaration.

## Security override

Operation-level `security` replaces the document-level default wholesale — no merging. A present array (including `[]`) overrides; an absent field inherits; neither present anywhere means anonymous. `security` exists at exactly two levels (document, operation) — never on Path Items.

## Spec violation

A document that breaks a rule of the OpenAPI standard for the dialect being applied — a required field missing or mistyped, a feature from the other dialect (`nullable` in 3.1, `mutualTLS` in 3.0), `security` on a Path Item. The fault is in the document; the error cites the section of the specification that states the rule.

Not to be confused with an **Unsupported feature**.

## Unsupported feature

A document that is valid OpenAPI but uses something genoc does not handle — Swagger 2.0, OpenAPI 3.2, external-document `$ref`s. The fault is genoc's limitation, not the document's, so the error never cites the OpenAPI specification as the rule being broken.
