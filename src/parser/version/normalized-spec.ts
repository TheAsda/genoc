/**
 * Normalized schema with consistent types across OpenAPI versions
 */
export interface NormalizedSchema {
  /** Normalized types - always an array, even for single types */
  types: string[];
  /** Format information */
  format?: string;
  /** Properties object */
  properties?: Record<string, NormalizedSchema>;
  /** Required properties array */
  required?: string[];
  /** Array items schema */
  items?: NormalizedSchema;
  /** Additional properties flag or schema */
  additionalProperties?: boolean | NormalizedSchema;
  /** Reference pointer */
  $ref?: string;
  /** AllOf composition */
  allOf?: NormalizedSchema[];
  /** OneOf composition */
  oneOf?: NormalizedSchema[];
  /** AnyOf composition */
  anyOf?: NormalizedSchema[];
  /** Enum values */
  enum?: unknown[];
  /** Const value */
  const?: unknown;
  /** Default value */
  default?: unknown;
  /** Description */
  description?: string;
  /** Whether nullable */
  nullable: boolean;
  /** Examples - always normalized to array */
  examples: unknown[];
  /** File upload information */
  fileUpload?: {
    binary: boolean;
    base64: boolean;
  };
  /** Exclusive minimum (always number) */
  exclusiveMinimum?: number;
  /** Exclusive maximum (always number) */
  exclusiveMaximum?: number;
  /** Minimum value */
  minimum?: number;
  /** Maximum value */
  maximum?: number;
  /** Read only */
  readOnly?: boolean;
  /** Write only */
  writeOnly?: boolean;
  /** Deprecated */
  deprecated?: boolean;
  /** Discriminator information */
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
}

/**
 * Normalized OpenAPI specification with consistent structure
 */
export interface NormalizedSpec {
  /** Original OpenAPI version string */
  openapi: string;
  /** Info object */
  info: {
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
  /** Servers array */
  servers?: Array<{
    url: string;
    description?: string;
    variables?: Record<
      string,
      {
        default: string;
        description?: string;
        enum?: string[];
      }
    >;
  }>;
  /** Paths object - simplified version */
  paths?: Record<
    string,
    {
      $ref?: string;
      summary?: string;
      description?: string;
      get?: NormalizedOperation;
      put?: NormalizedOperation;
      post?: NormalizedOperation;
      delete?: NormalizedOperation;
      options?: NormalizedOperation;
      head?: NormalizedOperation;
      patch?: NormalizedOperation;
      trace?: NormalizedOperation;
      parameters?: Array<NormalizedParameter>;
      servers?: unknown[];
    }
  >;
  /** Components object */
  components?: {
    schemas?: Record<string, NormalizedSchema>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    links?: Record<string, unknown>;
    callbacks?: Record<string, unknown>;
    examples?: Record<string, unknown>;
  };
  /** Security requirements */
  security?: unknown[];
  /** Tags */
  tags?: unknown[];
  /** External documentation */
  externalDocs?: {
    description?: string;
    url: string;
  };
  /** Webhooks */
  webhooks?: Record<
    string,
    {
      $ref?: string;
      summary?: string;
      description?: string;
      get?: NormalizedOperation;
      put?: NormalizedOperation;
      post?: NormalizedOperation;
      delete?: NormalizedOperation;
      options?: NormalizedOperation;
      head?: NormalizedOperation;
      patch?: NormalizedOperation;
      trace?: NormalizedOperation;
      parameters?: Array<NormalizedParameter>;
      servers?: unknown[];
    }
  >;
}

/**
 * Normalized operation object
 */
interface NormalizedOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<NormalizedParameter>;
  requestBody?: {
    description?: string;
    content: Record<
      string,
      {
        schema?: NormalizedSchema;
        examples?: Record<string, unknown>;
        example?: unknown;
        encoding?: Record<string, unknown>;
      }
    >;
    required?: boolean;
  };
  responses: Record<
    string,
    {
      description: string;
      headers?: Record<string, unknown>;
      content?: Record<
        string,
        {
          schema?: NormalizedSchema;
          examples?: Record<string, unknown>;
          example?: unknown;
          encoding?: Record<string, unknown>;
        }
      >;
      links?: Record<string, unknown>;
    }
  >;
  deprecated?: boolean;
  security?: unknown[];
  servers?: unknown[];
}

/**
 * Normalized parameter object
 */
interface NormalizedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: NormalizedSchema;
  style?: string;
  explode?: boolean;
  allowEmptyValue?: boolean;
  example?: unknown;
  examples?: Record<string, unknown>;
}
