import { readFileSync } from 'fs';

import { buildCommand, buildApplication } from '@stricli/core';

const VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url)).toString()
).version;

interface Flags {
  outputDir?: string;
  methodNameStrategy: 'path-based' | 'operationId' | 'operationId-with-fallback';
  specVersion?: string;
  strictVersion?: boolean;
  runtimeImportPath?: string;
  proxy?: string;
  config?: string;
  project?: string;
}

const command = buildCommand<Flags, [string | undefined]>({
  loader: async () => import('./impl.js'),
  parameters: {
    flags: {
      outputDir: {
        kind: 'parsed',
        parse: String,
        brief: 'Directory to write generated files (or set outputDir in the config file)',
        placeholder: 'dir',
        optional: true,
      },
      methodNameStrategy: {
        kind: 'enum',
        values: ['path-based', 'operationId', 'operationId-with-fallback'] as const,
        default: 'path-based',
        brief: 'Method naming strategy',
      },
      specVersion: {
        kind: 'parsed',
        parse: String,
        brief: 'Override auto-detected OpenAPI version (e.g. "3.0", "3.1")',
        optional: true,
        placeholder: 'version',
      },
      strictVersion: {
        kind: 'boolean',
        brief: 'Warn when --spec-version mismatches the detected version (default: true)',
        optional: true,
      },
      runtimeImportPath: {
        kind: 'parsed',
        parse: String,
        brief: 'Module specifier for runtime imports (default: genoc/runtime)',
        optional: true,
        placeholder: 'module',
      },
      proxy: {
        kind: 'parsed',
        parse: String,
        brief: 'HTTP(S) proxy URL for fetching specs (overrides HTTP_PROXY/HTTPS_PROXY env vars)',
        optional: true,
        placeholder: 'url',
      },
      config: {
        kind: 'parsed',
        parse: String,
        brief: 'Path to a genoc config file (.genocrc.yml / .genocrc.json); skips discovery',
        optional: true,
        placeholder: 'path',
      },
      project: {
        kind: 'parsed',
        parse: String,
        brief: 'Run only the named client from a multi-client config',
        optional: true,
        placeholder: 'name',
      },
    },
    aliases: {
      o: 'outputDir',
    },
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Path or URL to OpenAPI 3.0 or 3.1 spec (JSON/YAML); omit to use a config file',
          parse: String,
          placeholder: 'spec',
          optional: true,
        },
      ],
    },
  },
  docs: {
    brief: 'Generate typed HTTP clients from OpenAPI specifications',
    fullDescription:
      'Generate typed TypeScript HTTP clients from OpenAPI 3.0 / 3.1 specs (JSON/YAML, file or URL).',
  },
});

export type AppFlags = Flags;

export const app = buildApplication(command, {
  name: 'genoc',
  versionInfo: {
    currentVersion: VERSION,
  },
  scanner: {
    caseStyle: 'allow-kebab-for-camel',
  },
  documentation: {
    caseStyle: 'convert-camel-to-kebab',
  },
});
