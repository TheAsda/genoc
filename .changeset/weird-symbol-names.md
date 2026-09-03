---
'genoc': patch
---

Handle special characters in schema names and routes: any run of non-identifier symbols (brackets, backticks, hyphens, spaces, dots, tildes, ...) is folded into PascalCase, leading digits and exact reserved words get an `_` prefix, and schemas whose sanitized names collide are renamed with a `Model` suffix. Route-derived type prefixes and method names go through the same sanitization.
