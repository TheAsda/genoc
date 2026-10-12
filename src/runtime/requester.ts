import type { ErrorResponse, StreamResponse } from './responses.js';

/**
 * OAuth 2.0 flow configuration, spec-agnostic structural twin of the OpenAPI
 * OAuth Flow Object. Which URLs are meaningful depends on the flow kind.
 */
export type OAuthFlow = {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
};

/**
 * OAuth 2.0 flows, spec-agnostic structural twin of the OpenAPI OAuth Flows
 * Object.
 */
export type OAuthFlows = {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
};

/**
 * Spec-agnostic structural twin of an OpenAPI security scheme object,
 * discriminated on `type` so implementations can narrow.
 */
export type SecurityScheme =
  | { type: 'apiKey'; name: string; in: string; description?: string }
  | { type: 'http'; scheme: string; bearerFormat?: string; description?: string }
  | { type: 'oauth2'; flows: OAuthFlows; description?: string }
  | { type: 'openIdConnect'; openIdConnectUrl: string; description?: string }
  | { type: 'mutualTLS'; description?: string };

/**
 * One scheme invocation inside a security requirement: the scheme name as
 * declared in the spec, the scopes requested for it, and the resolved scheme
 * object.
 */
export type SecurityCall = {
  schemeName: string;
  scopes: readonly string[];
  scheme: SecurityScheme;
};

/**
 * One security alternative. Several `SecurityCall`s inside one requirement are
 * conjunctive — all must be satisfied.
 */
export type SecurityRequirement = readonly SecurityCall[];

/**
 * Performs an HTTP request and returns the response.
 *
 * When `expectStream` is true, the implementation should return
 * a `StreamResponse` containing the stream data, filename (from
 * Content-Disposition header), and response headers.
 *
 * When `security` is present, it carries the operation's security requirements
 * as an OR-list of AND-alternatives (spec `security` semantics): satisfying any
 * one requirement authorizes the request. Each call carries the fully resolved
 * scheme object. Absent `security` means the operation is public.
 */
export type Requester = <TResponse>(
  method: string,
  path: string,
  options: {
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
    expectStream?: true;
    security?: readonly SecurityRequirement[];
  }
) => Promise<TResponse | StreamResponse | ErrorResponse>;
