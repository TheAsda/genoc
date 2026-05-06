# OpenAPI 3.0 Support

This document lists all OpenAPI 3.0.x features supported by genoc. The tool auto-detects OpenAPI 3.0 specs and applies version-specific normalization.

**OpenAPI Specification reference:** https://spec.openapis.org/oas/v3.0.4.html

## Data Types

| Feature | Status       | OpenAPI Spec Section | Notes                                                                           |
| ------- | ------------ | -------------------- | ------------------------------------------------------------------------------- |
| string  | ✅ Supported | 4.4                  | Maps to TypeScript `string`, with format-specific types (date, date-time, etc.) |
| number  | ✅ Supported | 4.4                  | Maps to TypeScript `number` for both float and integer values                   |
| integer | ✅ Supported | 4.4                  | Maps to TypeScript `number` (no runtime distinction from number)                |
| boolean | ✅ Supported | 4.4                  | Maps to TypeScript `boolean`                                                    |
| array   | ✅ Supported | 4.4                  | Maps to TypeScript `Array<T>` using `items` schema                              |
| object  | ✅ Supported | 4.4                  | Maps to TypeScript `Record<string, T>` or interface with properties             |
| null    | ✅ Supported | 4.7.24.2             | Only via `nullable: true` keyword                                               |

## Schema Keywords

| Feature              | Status       | OpenAPI Spec Section | Notes                                                                 |
| -------------------- | ------------ | -------------------- | --------------------------------------------------------------------- |
| allOf                | ✅ Supported | 4.7.24               | Maps to TypeScript intersection types (`&`)                           |
| oneOf                | ✅ Supported | 4.7.24               | Maps to TypeScript union types with explicit validation               |
| anyOf                | ✅ Supported | 4.7.24               | Maps to TypeScript union types with explicit validation               |
| discriminator        | ✅ Supported | 4.7.24               | Full discriminated union support with `propertyName` and `mapping`    |
| enum                 | ✅ Supported | 4.7.24               | Maps to TypeScript `enum` or string union with `as const`             |
| const                | ✅ Supported | 4.7.24               | Maps to TypeScript `as const` literal type                            |
| default              | ✅ Supported | 4.7.24               | Included in generated types as optional properties with defaults      |
| description          | ✅ Supported | 4.7.24.2             | Added as JSDoc comments in generated TypeScript                       |
| readOnly             | ✅ Supported | 4.7.24.2             | Excluded from request body types (write-only context)                 |
| writeOnly            | ✅ Supported | 4.7.24.2             | Excluded from response body types (read-only context)                 |
| deprecated           | ✅ Supported | 4.7.24.2             | Adds JSDoc @deprecated tag to generated methods and types             |
| format               | ✅ Supported | 4.7.24.2             | Applies format-specific validation (date-time, email, etc.)           |
| additionalProperties | ✅ Supported | 4.7.24               | Maps to TypeScript `Record<string, T>` or wildcard types              |
| required             | ✅ Supported | 4.7.24               | Maps to TypeScript required vs optional properties                    |
| minItems             | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| maxItems             | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| minLength            | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| maxLength            | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| pattern              | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| minimum              | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| maximum              | ⚠️ Partial   | 4.7.24.4             | Stored in normalized spec, not enforced in generated types            |
| exclusiveMinimum     | ✅ Supported | 4.7.24.4             | Uses `exclusiveMinimum: true` boolean, maps to `> minimum` validation |
| exclusiveMaximum     | ✅ Supported | 4.7.24.4             | Uses `exclusiveMaximum: true` boolean, maps to `< maximum` validation |

## Parameters

| Feature           | Status       | OpenAPI Spec Section | Notes                                                                                         |
| ----------------- | ------------ | -------------------- | --------------------------------------------------------------------------------------------- |
| path parameters   | ✅ Supported | 4.7.12.1             | Required by default, maps to template variables in URL paths                                  |
| query parameters  | ✅ Supported | 4.7.12.1             | Maps to query string parameters with URL encoding                                             |
| header parameters | ✅ Supported | 4.7.12.1             | Maps to HTTP headers with proper capitalization                                               |
| cookie parameters | ✅ Supported | 4.7.12.1             | Maps to HTTP cookies with proper naming                                                       |
| required/optional | ✅ Supported | 4.7.12               | Maps to required vs optional TypeScript parameters                                            |
| style             | ⚠️ Partial   | 4.7.12.2             | `style` and `explode` values preserved in normalized spec, not processed in method generation |
| explode           | ⚠️ Partial   | 4.7.12.2             | Preserved but not processed in URL serialization                                              |
| allowEmptyValue   | ⚠️ Partial   | 4.7.12.2             | Preserved in normalized spec, not processed in method generation                              |
| deprecated        | ✅ Supported | 4.7.12               | Marks parameters as deprecated in generated code                                              |
| description       | ✅ Supported | 4.7.12.2             | Adds JSDoc documentation for parameters                                                       |

## Request Bodies

| Feature                           | Status       | OpenAPI Spec Section | Notes                                                     |
| --------------------------------- | ------------ | -------------------- | --------------------------------------------------------- |
| application/json                  | ✅ Supported | 4.7.13               | Maps to TypeScript object types with proper serialization |
| multipart/form-data               | ✅ Supported | 4.7.13               | Maps to FormData with proper file handling                |
| application/x-www-form-urlencoded | ✅ Supported | 4.7.13               | Maps to URL-encoded form data                             |
| application/octet-stream          | ✅ Supported | 4.7.14.3             | Maps to binary data with StreamResponse handling          |
| content negotiation               | ✅ Supported | 4.7.13               | Handles multiple content types per request body           |
| required/optional                 | ✅ Supported | 4.7.13               | Maps to required vs optional request body types           |
| examples in request body          | ✅ Supported | 4.7.13               | Generates example types and documentation                 |

## File Uploads

| Feature              | Status           | OpenAPI Spec Section | Notes                                                    |
| -------------------- | ---------------- | -------------------- | -------------------------------------------------------- |
| format: binary       | ✅ Supported     | 4.7.14.3             | Maps to `FileInput { data: Blob, filename: string }`     |
| format: byte         | ✅ Supported     | 4.7.14.3             | Maps to `FileInput { data: Blob, filename: string }`     |
| multipart with files | ✅ Supported     | 4.7.14.5             | Supports multiple file uploads in single request         |
| file metadata        | ✅ Supported     | 4.7.14.3             | `FileInput` includes `data: Blob` and `filename: string` |
| file validation      | ❌ Not supported | 4.7.14.3             | No file size or type validation in generated code        |

## Responses

| Feature             | Status       | OpenAPI Spec Section | Notes                                                  |
| ------------------- | ------------ | -------------------- | ------------------------------------------------------ |
| 2xx success codes   | ✅ Supported | 4.7.16               | Maps to typed response data with proper types          |
| 4xx/5xx error codes | ✅ Supported | 4.7.16               | Maps to error types with proper status codes           |
| default response    | ✅ Supported | 4.7.16               | Maps to `DefaultErrorBody` type for unspecified errors |
| binary responses    | ✅ Supported | 4.7.17               | Maps to `StreamResponse` with binary data handling     |
| empty responses     | ✅ Supported | 4.7.17               | Maps to `void` type for no content responses           |
| content types       | ✅ Supported | 4.7.17               | Handles multiple content types per response            |
| response headers    | ✅ Supported | 4.7.21               | Maps to typed response headers with proper names       |
| response examples   | ✅ Supported | 4.7.17               | Generates example types and documentation              |

## Error Handling

| Feature                    | Status       | OpenAPI Spec Section | Notes                                                      |
| -------------------------- | ------------ | -------------------- | ---------------------------------------------------------- |
| ApiError<TStatus, TData>   | ✅ Supported | Generated code       | Generic error type with status and data generics           |
| UnspecifiedApiError        | ✅ Supported | Generated code       | Fallback error type for unexpected error formats           |
| isDefinedError type guard  | ✅ Supported | Generated code       | Runtime type guard for error detection                     |
| per-operation error unions | ✅ Supported | Generated code       | Union types for all possible error responses per operation |
| default error body         | ✅ Supported | 4.7.16               | `DefaultErrorBody` for unspecified error responses         |
| status-based errors        | ✅ Supported | 4.7.16               | Separate error types for different HTTP status codes       |
| error response mapping     | ✅ Supported | 4.7.17               | Maps API error responses to TypeScript error types         |

## $ref Resolution

| Feature                 | Status           | OpenAPI Spec Section | Notes                                                         |
| ----------------------- | ---------------- | -------------------- | ------------------------------------------------------------- |
| JSON pointer resolution | ✅ Supported     | 4.7.23               | Resolves `$ref` using JSON pointer syntax                     |
| chained refs            | ✅ Supported     | 4.7.23               | Supports multiple levels of `$ref` resolution                 |
| circular ref detection  | ✅ Supported     | 4.7.23               | Prevents infinite loops in ref resolution                     |
| $ref siblings           | ❌ Not supported | 4.7.23               | Sibling properties are stripped in 3.0 (only ref target used) |
| local refs              | ✅ Supported     | 4.7.23               | Resolves `#/components/...` JSON pointer references           |
| remote refs             | ❌ Not supported | 4.7.23               | External/HTTP refs throw an error                             |

## Components

| Feature         | Status           | OpenAPI Spec Section | Notes                                         |
| --------------- | ---------------- | -------------------- | --------------------------------------------- |
| schemas         | ✅ Supported     | 4.7.7                | Central schema definitions with proper naming |
| responses       | ✅ Supported     | 4.7.7                | Reusable response definitions                 |
| parameters      | ✅ Supported     | 4.7.7                | Reusable parameter definitions                |
| requestBodies   | ✅ Supported     | 4.7.7                | Reusable request body definitions             |
| headers         | ✅ Supported     | 4.7.7                | Reusable header definitions                   |
| securitySchemes | ✅ Supported     | 4.7.7                | Reusable security scheme definitions          |
| links           | ❌ Not supported | 4.7.7                | Link specifications are not processed         |
| callbacks       | ❌ Not supported | 4.7.7                | Callback specifications are not processed     |
| examples        | ✅ Supported     | 4.7.7                | Reusable example definitions                  |

## Security Schemes

| Feature                   | Status       | OpenAPI Spec Section | Notes                                              |
| ------------------------- | ------------ | -------------------- | -------------------------------------------------- |
| apiKey (query)            | ✅ Supported | 4.7.27.1             | Maps to query parameter authentication             |
| apiKey (header)           | ✅ Supported | 4.7.27.1             | Maps to header authentication                      |
| apiKey (cookie)           | ✅ Supported | 4.7.27.1             | Maps to cookie authentication                      |
| http basic                | ✅ Supported | 4.7.27.2             | Maps to Basic authentication header                |
| http bearer               | ✅ Supported | 4.7.27.2             | Maps to Bearer token authentication                |
| http digest               | ✅ Supported | 4.7.27.2             | Maps to Digest authentication                      |
| oauth2 implicit           | ✅ Supported | 4.7.27.3             | Handles OAuth2 implicit flow                       |
| oauth2 password           | ✅ Supported | 4.7.27.3             | Handles OAuth2 password flow                       |
| oauth2 client credentials | ✅ Supported | 4.7.27.3             | Handles OAuth2 client credentials flow             |
| oauth2 authorization code | ✅ Supported | 4.7.27.3             | Handles OAuth2 authorization code flow             |
| openIdConnect             | ✅ Supported | 4.7.27.4             | Handles OpenID Connect authentication              |
| security requirements     | ✅ Supported | 4.7.27               | Maps to proper authentication in generated clients |

## Servers

| Feature                 | Status       | OpenAPI Spec Section | Notes                                           |
| ----------------------- | ------------ | -------------------- | ----------------------------------------------- |
| server URLs             | ✅ Supported | 4.7.5                | Maps to base URL configuration                  |
| server variables        | ✅ Supported | 4.7.5                | Maps to configurable URL variables              |
| enum for variables      | ✅ Supported | 4.7.5                | Supports enumerated values for server variables |
| default variable values | ✅ Supported | 4.7.5                | Uses default values when not specified          |
| multiple servers        | ✅ Supported | 4.7.5                | Supports multiple server configurations         |

## Path Operations

| Feature         | Status       | OpenAPI Spec Section | Notes                                             |
| --------------- | ------------ | -------------------- | ------------------------------------------------- |
| GET             | ✅ Supported | 4.7.10               | Maps to GET method with proper URL handling       |
| POST            | ✅ Supported | 4.7.10               | Maps to POST method with request body support     |
| PUT             | ✅ Supported | 4.7.10               | Maps to PUT method with request body support      |
| PATCH           | ✅ Supported | 4.7.10               | Maps to PATCH method with request body support    |
| DELETE          | ✅ Supported | 4.7.10               | Maps to DELETE method with optional request body  |
| OPTIONS         | ✅ Supported | 4.7.10               | Maps to OPTIONS method for CORS handling          |
| HEAD            | ✅ Supported | 4.7.10               | Maps to HEAD method for header-only responses     |
| TRACE           | ✅ Supported | 4.7.10               | Maps to TRACE method for debugging                |
| operationId     | ✅ Supported | 4.7.10               | Uses operationId for method naming when available |
| summary         | ✅ Supported | 4.7.10               | Adds summary as JSDoc description                 |
| description     | ✅ Supported | 4.7.10               | Adds detailed description as JSDoc comments       |
| tags            | ✅ Supported | 4.7.10               | Groups methods by tags in generated clients       |
| deprecated      | ✅ Supported | 4.7.10               | Marks operations as deprecated in generated code  |
| path templating | ✅ Supported | 4.7.10               | Handles path templating with variables            |
