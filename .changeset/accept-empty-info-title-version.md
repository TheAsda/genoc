---
'genoc': patch
---

Accept empty-string `info.title` and `info.version`. The OpenAPI specification requires these fields to be present strings but imposes no requirement on the value, so `title: ""` / `version: ""` are no longer rejected. Fixes #85.
