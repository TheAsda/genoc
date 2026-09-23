---
'genoc': patch
---

Fixed discriminator cross-variant inheritance collapsing generated variants to `never` (the .NET System.Text.Json polymorphism style, where each variant inherits the discriminated base). Discriminator literals are now injected exactly once — at each mapping target's own named definition — and same-family variant references render as `Omit<Sibling, 'Prop'>` instead of re-inlining the parent literal. Every discriminated family also emits a collision-safe `{Base}Variant` union (mapping values ∪ oneOf refs), and a `$ref` to a discriminator base resolves to that union at all usage sites. Also fixes four latent analyzer bugs: repeated sibling `$ref`s dropping all properties, injected literals binding only to the last member of a union, implicit variant literals using the sanitized type name instead of the raw ref segment, and mapping keys containing `'` / `\` producing syntactically invalid TypeScript.
