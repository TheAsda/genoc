# CONTEXT.md — domain concepts

Named concepts of the codebase. Every entry is vocabulary worth using in commits, reviews, and conversation.

## VersionProfile

What `resolveVersion(doc, override?)` in `src/parser/version/` returns: the detected and effective spec dialect (`'3.0' | '3.1'`) plus every behavioral consequence derivation of that dialect (today: `preserveRefSiblings`).

It is the only sanctioned way code outside `src/parser/version/` learns about spec dialect — no string-comparing `doc.openapi` elsewhere.

## AnalyzedSpec

What the analyzer module (`src/analyzer/`) produces from one OpenAPI spec: everything generation consumes — operations, component schemas, security schemes, servers, spec version — expressed once, in generation-ready terms.

Generators read the AnalyzedSpec and nothing else. The raw OpenAPI document stays behind the parser/analyzer boundary.
