---
'genoc': minor
---

Always generate an `index.ts` barrel alongside `contracts.ts` and `client.ts` in the output directory — `export * from './contracts.js';` plus `export * from './client.js';` under the standard genoc header — so the client factory can be imported straight from the output directory. Barrel generation is always on: no flag, no config option. Regenerating overwrites all three files, including any hand-authored `index.ts`. A spec schema named `createClient` would collide with the barrel's re-exported factory, so such schemas now rename to `createClientModel`.
