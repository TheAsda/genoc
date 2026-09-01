export type MethodNameStrategy = 'path-based' | 'operationId' | 'operationId-with-fallback';

export type GeneratorConfig = {
  input: string;
  outputDir: string;
  methodNameStrategy?: MethodNameStrategy;
  requesterModuleName?: string;
  specVersion?: string;
  strictVersion?: boolean;
  runtimeImportPath?: string;
};

export type RequesterFunction = <TResponse>(
  method: string,
  path: string,
  options: {
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
  }
) => Promise<TResponse>;

export type GeneratedMethod = {
  name: string;
  jsDoc: string;
  signature: string;
  implementation: string;
};

export type ClientOutput = {
  imports: string[];
  methods: GeneratedMethod[];
  errorTypes: string[];
};
