# OpenAPI 3.1 Support

This document lists all OpenAPI 3.1.x features supported by genoc. OpenAPI 3.1 is aligned with JSON Schema 2020-12, introducing type arrays, $ref siblings, webhooks, and other changes.

**OpenAPI Specification reference:** https://spec.openapis.org/oas/v3.1.2.html

## Data Types

| Feature     | Status       | OpenAPI Spec Section | Notes                                                                           |
| ----------- | ------------ | -------------------- | ------------------------------------------------------------------------------- |
| string      | ✅ Supported | 4.8.24.1             | Maps to TypeScript `string`, with format-specific types (date, date-time, etc.) |
| number      | ✅ Supported | 4.8.24.1             | Maps to TypeScript `number` for both float and integer values                   |
| integer     | ✅ Supported | 4.8.24.1             | Maps to TypeScript `number` (no runtime distinction from number)                |
| boolean     | ✅ Supported | 4.8.24.1             | Maps to TypeScript `boolean`                                                    |
| array       | ✅ Supported | 4.8.24.1             | Maps to TypeScript `Array<T>` using `items` schema                              |
| object      | ✅ Supported | 4.8.24.1             | Maps to TypeScript `Record<string, T>` or interface with properties             |
| null        | ✅ Supported | 4.8.24.1             | Via `type: ["string", "null"]` syntax for explicit nullability                  |
| type arrays | ✅ Supported | 4.8.24.1             | Supports `type: ["string", "number"]` for union types                           |

## Schema Keywords

| Feature              | Status           | OpenAPI Spec Section | Notes                                                                                     |
| -------------------- | ---------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| allOf                | ✅ Supported     | 4.8.24.4             | Maps to TypeScript intersection types (`&`)                                               |
| oneOf                | ✅ Supported     | 4.8.24.4             | Maps to TypeScript union types with explicit validation                                   |
| anyOf                | ✅ Supported     | 4.8.24.4             | Maps to TypeScript union types with explicit validation                                   |
| discriminator        | ✅ Supported     | 4.8.24.4             | Full discriminated union support with `propertyName` and `mapping`                        |
| enum                 | ✅ Supported     | 4.8.24.4             | Maps to TypeScript `enum` or string union with `as const`                                 |
| const                | ⚠️ Partial       | 4.8.24.1             | Maps to `unknown` when used without `type`; ignored when `type` is present                |
| default              | ❌ Not supported | 4.8.24.2             | Schema-level defaults stored but not emitted in TypeScript output                         |
| description          | ✅ Supported     | 4.8.24.2             | Added as JSDoc comments in generated TypeScript                                           |
| readOnly             | ✅ Supported     | 4.8.24.2             | Excluded from request body types (write-only context)                                     |
| writeOnly            | ✅ Supported     | 4.8.24.2             | Excluded from response body types (read-only context)                                     |
| deprecated           | ⚠️ Partial       | 4.8.24.2             | Operation-level deprecated generates @deprecated tag; schema-level deprecated not emitted |
| format               | ✅ Supported     | 4.8.24.2             | Applies format-specific validation (date-time, email, etc.)                               |
| additionalProperties | ✅ Supported     | 4.8.24.4             | Maps to TypeScript `Record<string, T>` or wildcard types                                  |
| required             | ✅ Supported     | 4.8.24.4             | Maps to TypeScript required vs optional properties                                        |
| minItems             | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| maxItems             | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| minLength            | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| maxLength            | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| pattern              | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| minimum              | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| maximum              | ⚠️ Partial       | 4.8.24.3             | Stored in normalized spec, not enforced in generated types                                |
| exclusiveMinimum     | ✅ Supported     | 4.8.24.3             | Uses numeric values (`exclusiveMinimum: 5`), maps to `> minimum` validation               |
| exclusiveMaximum     | ✅ Supported     | 4.8.24.3             | Uses numeric values (`exclusiveMaximum: 5`), maps to `< maximum` validation               |
| examples             | ✅ Supported     | 4.8.24.3.1           | Handles `examples` array from converted `example` keyword                                 |

## Parameters

| Feature           | Status           | OpenAPI Spec Section | Notes                                                                                         |
| ----------------- | ---------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| path parameters   | ✅ Supported     | 4.8.12.1             | Required by default, maps to template variables in URL paths                                  |
| query parameters  | ✅ Supported     | 4.8.12.1             | Maps to query string parameters with URL encoding                                             |
| header parameters | ✅ Supported     | 4.8.12.1             | Maps to HTTP headers with proper capitalization                                               |
| cookie parameters | ✅ Supported     | 4.8.12.1             | Maps to HTTP cookies with proper naming                                                       |
| required/optional | ✅ Supported     | 4.8.12               | Maps to required vs optional TypeScript parameters                                            |
| style             | ⚠️ Partial       | 4.8.12.3             | `style` and `explode` values preserved in normalized spec, not processed in method generation |
| explode           | ⚠️ Partial       | 4.8.12.3             | Preserved but not processed in URL serialization                                              |
| allowEmptyValue   | ⚠️ Partial       | 4.8.12.2             | Preserved in normalized spec, not processed in method generation                              |
| deprecated        | ❌ Not supported | 4.8.12               | Parameter-level deprecated stored but not emitted in generated code                           |
| description       | ❌ Not supported | 4.8.12.2             | Parameter descriptions stored but not emitted in generated JSDoc                              |

## Request Bodies

| Feature                           | Status           | OpenAPI Spec Section | Notes                                                          |
| --------------------------------- | ---------------- | -------------------- | -------------------------------------------------------------- |
| application/json                  | ✅ Supported     | 4.8.13               | Maps to TypeScript object types with proper serialization      |
| multipart/form-data               | ✅ Supported     | 4.8.13               | Maps to FormData with proper file handling                     |
| application/x-www-form-urlencoded | ✅ Supported     | 4.8.13               | Maps to URL-encoded form data                                  |
| application/octet-stream          | ✅ Supported     | 4.8.13               | Maps to binary data with StreamResponse handling               |
| content negotiation               | ✅ Supported     | 4.8.13               | Handles multiple content types per request body                |
| required/optional                 | ✅ Supported     | 4.8.13               | Maps to required vs optional request body types                |
| examples in request body          | ❌ Not supported | 4.8.13               | Request body examples stored but not emitted in generated code |

## File Uploads

| Feature              | Status           | OpenAPI Spec Section | Notes                                                    |
| -------------------- | ---------------- | -------------------- | -------------------------------------------------------- |
| format: binary       | ✅ Supported     | 4.8.14.3             | Maps to `FileInput { data: Blob, filename: string }`     |
| format: byte         | ✅ Supported     | 4.8.14.3             | Maps to `FileInput { data: Blob, filename: string }`     |
| multipart with files | ✅ Supported     | 4.8.14.5             | Supports multiple file uploads in single request         |
| file metadata        | ✅ Supported     | 4.8.14.3             | `FileInput` includes `data: Blob` and `filename: string` |
| file validation      | ❌ Not supported | 4.8.14.3             | No file size or type validation in generated code        |

## Responses

| Feature             | Status       | OpenAPI Spec Section | Notes                                                  |
| ------------------- | ------------ | -------------------- | ------------------------------------------------------ |
| 2xx success codes   | ✅ Supported | 4.8.16               | Maps to typed response data with proper types          |
| 4xx/5xx error codes | ✅ Supported | 4.8.16               | Maps to error types with proper status codes           |
| default response    | ✅ Supported | 4.8.16               | Maps to `DefaultErrorBody` type for unspecified errors |
| binary responses    | ✅ Supported | 4.8.17               | Maps to `StreamResponse` with binary data handling     |
| empty responses     | ✅ Supported | 4.8.17               | Maps to `void` type for no content responses           |
| content types       | ✅ Supported | 4.8.17               | Handles multiple content types per response            |
| response headers    | ✅ Supported | 4.8.21               | Maps to typed response headers with proper names       |
| response examples   | ✅ Supported | 4.8.17               | Generates example types and documentation              |

## Error Handling

| Feature                    | Status           | OpenAPI Spec Section | Notes                                                      |
| -------------------------- | ---------------- | -------------------- | ---------------------------------------------------------- |
| ApiError<TStatus, TData>   | ✅ Supported     | Generated code       | Generic error type with status and data generics           |
| UnspecifiedApiError        | ✅ Supported     | Generated code       | Fallback error type for unexpected error formats           |
| isDefinedError type guard  | ✅ Supported     | Generated code       | Runtime type guard for error detection                     |
| per-operation error unions | ✅ Supported     | Generated code       | Union types for all possible error responses per operation |
| default error body         | ❌ Not supported | 4.8.16               | `default` responses excluded from error type generation    |
| status-based errors        | ✅ Supported     | 4.8.16               | Separate error types for different HTTP status codes       |
| error response mapping     | ✅ Supported     | 4.8.17               | Maps API error responses to TypeScript error types         |

## $ref Resolution

| Feature                 | Status           | OpenAPI Spec Section | Notes                                                                             |
| ----------------------- | ---------------- | -------------------- | --------------------------------------------------------------------------------- |
| JSON pointer resolution | ✅ Supported     | 4.8.23               | Resolves `$ref` using JSON pointer syntax                                         |
| chained refs            | ✅ Supported     | 4.8.23               | Supports multiple levels of `$ref` resolution                                     |
| circular ref detection  | ✅ Supported     | 4.8.23               | Prevents infinite loops in ref resolution                                         |
| $ref siblings           | ✅ Supported     | 4.8.23               | Sibling properties preserved and merged (shallow merge, siblings override target) |
| local refs              | ✅ Supported     | 4.8.23               | Resolves `#/components/...` JSON pointer references                               |
| remote refs             | ❌ Not supported | 4.8.23               | External/HTTP refs throw an error                                                 |

## Components

| Feature         | Status           | OpenAPI Spec Section | Notes                                                                |
| --------------- | ---------------- | -------------------- | -------------------------------------------------------------------- |
| schemas         | ✅ Supported     | 4.8.7                | Central schema definitions with proper naming                        |
| responses       | ✅ Supported     | 4.8.7                | Reusable response definitions                                        |
| parameters      | ✅ Supported     | 4.8.7                | Reusable parameter definitions                                       |
| requestBodies   | ✅ Supported     | 4.8.7                | Reusable request body definitions                                    |
| headers         | ✅ Supported     | 4.8.7                | Reusable header definitions                                          |
| securitySchemes | ✅ Supported     | 4.8.7                | Reusable security scheme definitions with TypeScript type generation |
| links           | ❌ Not supported | 4.8.7                | Link specifications are not processed                                |
| callbacks       | ❌ Not supported | 4.8.7                | Callback specifications are not processed                            |
| examples        | ✅ Supported     | 4.8.7                | Reusable example definitions                                         |

## Security Schemes

| Feature                   | Status       | OpenAPI Spec Section | Notes                                              |
| ------------------------- | ------------ | -------------------- | -------------------------------------------------- |
| apiKey (query)            | ✅ Supported | 4.8.27.1             | Maps to query parameter authentication             |
| apiKey (header)           | ✅ Supported | 4.8.27.1             | Maps to header authentication                      |
| apiKey (cookie)           | ✅ Supported | 4.8.27.1             | Maps to cookie authentication                      |
| http basic                | ✅ Supported | 4.8.27.2             | Maps to Basic authentication header                |
| http bearer               | ✅ Supported | 4.8.27.2             | Maps to Bearer token authentication                |
| http digest               | ✅ Supported | 4.8.27.2             | Maps to Digest authentication                      |
| oauth2 implicit           | ✅ Supported | 4.8.27.3             | Handles OAuth2 implicit flow                       |
| oauth2 password           | ✅ Supported | 4.8.27.3             | Handles OAuth2 password flow                       |
| oauth2 client credentials | ✅ Supported | 4.8.27.3             | Handles OAuth2 client credentials flow             |
| oauth2 authorization code | ✅ Supported | 4.8.27.3             | Handles OAuth2 authorization code flow             |
| openIdConnect             | ✅ Supported | 4.8.27.4             | Handles OpenID Connect authentication              |
| security requirements     | ✅ Supported | 4.8.27               | Maps to proper authentication in generated clients |

## Servers

| Feature                 | Status       | OpenAPI Spec Section | Notes                                           |
| ----------------------- | ------------ | -------------------- | ----------------------------------------------- |
| server URLs             | ✅ Supported | 4.8.5                | Maps to base URL configuration                  |
| server variables        | ✅ Supported | 4.8.5                | Maps to configurable URL variables              |
| enum for variables      | ✅ Supported | 4.8.5                | Supports enumerated values for server variables |
| default variable values | ✅ Supported | 4.8.5                | Uses default values when not specified          |
| multiple servers        | ✅ Supported | 4.8.5                | Supports multiple server configurations         |

## Path Operations

| Feature         | Status       | OpenAPI Spec Section | Notes                                             |
| --------------- | ------------ | -------------------- | ------------------------------------------------- |
| GET             | ✅ Supported | 4.8.10               | Maps to GET method with proper URL handling       |
| POST            | ✅ Supported | 4.8.10               | Maps to POST method with request body support     |
| PUT             | ✅ Supported | 4.8.10               | Maps to PUT method with request body support      |
| PATCH           | ✅ Supported | 4.8.10               | Maps to PATCH method with request body support    |
| DELETE          | ✅ Supported | 4.8.10               | Maps to DELETE method with optional request body  |
| OPTIONS         | ✅ Supported | 4.8.10               | Maps to OPTIONS method for CORS handling          |
| HEAD            | ✅ Supported | 4.8.10               | Maps to HEAD method for header-only responses     |
| TRACE           | ✅ Supported | 4.8.10               | Maps to TRACE method for debugging                |
| operationId     | ✅ Supported | 4.8.10               | Uses operationId for method naming when available |
| summary         | ✅ Supported | 4.8.10               | Adds summary as JSDoc description                 |
| description     | ✅ Supported | 4.8.10               | Adds detailed description as JSDoc comments       |
| tags            | ✅ Supported | 4.8.10               | Groups methods by tags in generated clients       |
| deprecated      | ✅ Supported | 4.8.10               | Marks operations as deprecated in generated code  |
| path templating | ✅ Supported | 4.8.10               | Handles path templating with variables            |

## Webhooks

| Feature                | Status           | OpenAPI Spec Section | Notes                                              |
| ---------------------- | ---------------- | -------------------- | -------------------------------------------------- |
| webhook definition     | ✅ Supported     | 4.8.18               | Top-level `webhooks` object parsed and normalized  |
| webhook operations     | ❌ Not supported | 4.8.18               | Webhooks not processed into generated client code  |
| webhook parameters     | ❌ Not supported | 4.8.18               | Webhook parameters not emitted in generated code   |
| webhook request bodies | ❌ Not supported | 4.8.18               | Webhook request bodies not processed in generation |
| webhook responses      | ❌ Not supported | 4.8.18               | Webhook responses not emitted in generated code    |
| webhook security       | ❌ Not supported | 4.8.18               | Webhook security requirements not applied          |

## Differences from OpenAPI 3.0

| Feature          | OpenAPI 3.0                         | OpenAPI 3.1                           |
| ---------------- | ----------------------------------- | ------------------------------------- |
| Nullability      | 4.7.24.2 (`nullable: true`)         | 4.8.24.1 (`type: ["string", "null"]`) |
| Exclusive bounds | 4.7.24.3 (`exclusiveMinimum: true`) | 4.8.24.3 (`exclusiveMinimum: 5`)      |
| $ref siblings    | 4.7.23 (Ignored)                    | 4.8.23 (Merged with target)           |
| Examples         | 4.7.24.2 (`example: value`)         | 4.8.24.3.1 (`examples: [...]`)        |
| Webhooks         | Not available                       | 4.8.18 (Supported at top level)       |
| JSON Schema      | Draft 04/05 subset                  | JSON Schema 2020-12 aligned           |

## JSON Schema 2020-12 Alignment

| Feature                | Status           | OpenAPI Spec Section | Notes                                 |
| ---------------------- | ---------------- | -------------------- | ------------------------------------- |
| $dynamicRef            | ❌ Not supported | 4.8.24               | Dynamic references not implemented    |
| $dynamicAnchor         | ❌ Not supported | 4.8.24               | Dynamic anchors not implemented       |
| $comment               | ❌ Not supported | 4.8.24               | Comments not processed                |
| unevaluatedProperties  | ❌ Not supported | 4.8.24               | Unevaluated properties not supported  |
| unevaluatedItems       | ❌ Not supported | 4.8.24               | Unevaluated items not supported       |
| prefixItems            | ❌ Not supported | 4.8.24               | Prefix items not implemented          |
| contains               | ❌ Not supported | 4.8.24               | Contains keyword not supported        |
| contentEncoding        | ❌ Not supported | 4.8.14.3             | Content encoding not implemented      |
| contentMediaType       | ❌ Not supported | 4.8.14.3             | Content media type not implemented    |
| patternProperties      | ❌ Not supported | 4.8.24               | Pattern properties not implemented    |
| dependentSchemas       | ❌ Not supported | 4.8.24               | Dependent schemas not implemented     |
| if/then/else           | ❌ Not supported | 4.8.24               | Conditional schemas not implemented   |
| allOf with unevaluated | ❌ Not supported | 4.8.24               | Unevaluated composition not supported |
