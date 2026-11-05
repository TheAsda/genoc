---
'genoc': patch
---

Concrete discriminator bases now join their own `{Base}Variant` unions. Previously, refs to a base with no `oneOf`/`anyOf` (or listed in its own `mapping`) could name an undeclared union type, a self-mapped base collapsed its children to `never` through conflicting discriminant literals, and mapping-children-only families omitted the base from its own union. Variants of a concrete base now strip the discriminant via `Omit<Base, '$disc'>`, implicit direct-`allOf` children count as variants, and families with no members fall back to bare base names instead of emitting an unused union. Generated output shape changes for specs with concrete discriminator bases: existing variant unions gain the base as a member. Fixes #93.
