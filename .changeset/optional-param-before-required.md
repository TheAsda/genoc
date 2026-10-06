---
'genoc': patch
---

Fixed generated client signatures placing an optional (`?:`) parameter before a required one, which produced invalid TypeScript (`error TS1016: A required parameter cannot follow an optional parameter`) — for example an operation with an optional request body and a required header generated `body?: PostApiV1EntityBody, headers: PostApiV1EntityHeaders`. Optional parameters that precede a required one are now rendered as `name: T | undefined` instead of `name?: T`, uniformly for every parameter slot (query, body, headers), replacing the previous query-only special case. (#63)
