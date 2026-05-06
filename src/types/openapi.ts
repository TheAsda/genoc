export type ReferenceObject = {
  $ref: string;
};

export type SchemaObject = {
  type?: string | string[];
  format?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  additionalProperties?: boolean | SchemaObject;
  $ref?: string;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  externalDocs?: {
    description?: string;
    url: string;
  };
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
};

export type MediaTypeObject = {
  schema?: SchemaObject | ReferenceObject;
  examples?: Record<string, unknown>;
  example?: unknown;
  encoding?: Record<string, unknown>;
};

export type ParameterObject = {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject | ReferenceObject;
  style?: string;
  explode?: boolean;
  allowEmptyValue?: boolean;
  example?: unknown;
  examples?: Record<string, unknown>;
};

export type RequestBodyObject = {
  description?: string;
  content: Record<string, MediaTypeObject>;
  required?: boolean;
};

export type ResponseObject = {
  description: string;
  headers?: Record<string, unknown>;
  content?: Record<string, MediaTypeObject>;
  links?: Record<string, unknown>;
};

export type ResponsesObject = Record<string, ResponseObject | ReferenceObject>;

export type OperationObject = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses: ResponsesObject;
  deprecated?: boolean;
  security?: unknown[];
  servers?: unknown[];
};

export type PathItemObject = {
  $ref?: string;
  summary?: string;
  description?: string;
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
  trace?: OperationObject;
  parameters?: (ParameterObject | ReferenceObject)[];
  servers?: unknown[];
};

export type PathsObject = Record<string, PathItemObject>;

export type ServerVariableObject = {
  default: string;
  description?: string;
  enum?: string[];
};

export type ServerObject = {
  url: string;
  description?: string;
  variables?: Record<string, ServerVariableObject>;
};

export type InfoObject = {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
    identifier?: string;
  };
};

export type OAuth2FlowBase = {
  refreshUrl?: string;
  scopes: Record<string, string>;
};

export type OAuth2FlowImplicit = OAuth2FlowBase & {
  authorizationUrl: string;
};

export type OAuth2FlowPassword = OAuth2FlowBase & {
  tokenUrl: string;
};

export type OAuth2FlowClientCredentials = OAuth2FlowBase & {
  tokenUrl: string;
};

export type OAuth2FlowAuthorizationCode = OAuth2FlowBase & {
  authorizationUrl: string;
  tokenUrl: string;
};

export type OAuth2FlowsObject = {
  implicit?: OAuth2FlowImplicit;
  password?: OAuth2FlowPassword;
  clientCredentials?: OAuth2FlowClientCredentials;
  authorizationCode?: OAuth2FlowAuthorizationCode;
};

export type SecuritySchemeObject = {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  // apiKey specific
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  // http specific
  scheme?: string;
  bearerFormat?: string;
  // oauth2 specific
  flows?: OAuth2FlowsObject;
  // openIdConnect specific
  openIdConnectUrl?: string;
};

export type ComponentsObject = {
  schemas?: Record<string, SchemaObject | ReferenceObject>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  parameters?: Record<string, ParameterObject | ReferenceObject>;
  requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
  headers?: Record<string, unknown>;
  securitySchemes?: Record<string, SecuritySchemeObject>;
  links?: Record<string, unknown>;
  callbacks?: Record<string, unknown>;
  examples?: Record<string, unknown>;
};

export type OpenAPIDocument = {
  openapi: string;
  info: InfoObject;
  servers?: ServerObject[];
  paths?: PathsObject;
  components?: ComponentsObject;
  security?: unknown[];
  tags?: unknown[];
  externalDocs?: {
    description?: string;
    url: string;
  };
  webhooks?: Record<string, PathItemObject>;
};
