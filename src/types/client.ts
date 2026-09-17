export type MethodNameStrategy = 'path-based' | 'operationId' | 'operationId-with-fallback';

export type GeneratorConfig = {
  input: string;
  outputDir: string;
  methodNameStrategy?: MethodNameStrategy;
  requesterModuleName?: string;
  strictVersion?: boolean;
  runtimeImportPath?: string;
  proxy?: string;
};

export type GeneratedMethod = {
  name: string;
  jsDoc: string;
  signature: string;
};
