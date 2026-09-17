import type { CommandContext } from '@stricli/core';

import { generateFullOutput } from '../generator/client-generator.js';
import { load } from '../parser/spec-reader.js';
import { resolveVersion, validateSpec } from '../parser/version/index.js';
import { assertValidProxyUrl } from '../utils/proxy.js';
import type { AppFlags as Flags } from './app.js';
import { loadConfigFile } from './config-loader.js';
import type { FlatConfig } from './config-schema.js';
import { UserError } from './errors.js';

type GenerationTarget = {
  name: string;
  input: string;
  outputDir: string;
  methodNameStrategy: Flags['methodNameStrategy'];
  specVersion?: string;
  strictVersion: boolean;
  runtimeImportPath?: string;
  proxy?: string;
};

/**
 * Compare-to-default table for flags that declare a default in app.ts.
 *
 * A defaulted flag counts as "explicitly passed" only when its value differs
 * from the declared default. KNOWN LIMITATION: an explicitly-passed flag whose
 * value equals the declared default (e.g. `--method-name-strategy path-based`)
 * is indistinguishable from an omitted flag, so a config-file value wins in
 * that case. This is pinned by a characterization test.
 *
 * `strictVersion` avoids this limitation entirely: it is declared WITHOUT a
 * default (`strictVersion?: boolean`), so `undefined` reliably means "not
 * passed" and any explicit value — including `true` — beats the file value.
 */
const FLAG_DEFAULTS = {
  methodNameStrategy: 'path-based',
  strictVersion: true,
} as const;

type MergeSource = {
  outputDir?: string;
  methodNameStrategy?: Flags['methodNameStrategy'];
  specVersion?: string;
  strictVersion?: boolean;
  runtimeImportPath?: string;
  proxy?: string;
};

function mergeExplicitFlags(flags: Flags): MergeSource {
  return {
    outputDir: flags.outputDir,
    methodNameStrategy:
      flags.methodNameStrategy === FLAG_DEFAULTS.methodNameStrategy
        ? undefined
        : flags.methodNameStrategy,
    specVersion: flags.specVersion,
    strictVersion: flags.strictVersion,
    runtimeImportPath: flags.runtimeImportPath,
    proxy: flags.proxy,
  };
}

function buildTarget(
  name: string,
  input: string,
  cli: MergeSource,
  file: MergeSource | undefined
): GenerationTarget {
  const outputDir = cli.outputDir ?? file?.outputDir;
  if (outputDir === undefined) {
    throw new UserError(
      'No output directory provided. Pass --output-dir, or set "outputDir" in a config file ' +
        '(.genocrc.yml / .genocrc.json).'
    );
  }
  return {
    name,
    input,
    outputDir,
    methodNameStrategy:
      cli.methodNameStrategy ?? file?.methodNameStrategy ?? FLAG_DEFAULTS.methodNameStrategy,
    specVersion: cli.specVersion ?? file?.specVersion,
    strictVersion: cli.strictVersion ?? file?.strictVersion ?? FLAG_DEFAULTS.strictVersion,
    runtimeImportPath: cli.runtimeImportPath ?? file?.runtimeImportPath,
    proxy: cli.proxy ?? file?.proxy,
  };
}

/**
 * Display name for a target that does not come from a `clients` map entry:
 * the spec filename base (`petstore.yaml` -> `petstore`, URL last segment for
 * remote specs). Chosen over the outputDir basename because several targets
 * can share an input spec, but the input is what identifies the client being
 * generated in the failure/aggregation output.
 */
export function targetNameFromInput(input: string): string {
  const withoutQuery = input.split('?')[0] ?? input;
  const base = withoutQuery.split(/[\\/]/).pop() ?? withoutQuery;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function processCwd(proc: CommandContext['process']): string {
  const cwd = (proc as { cwd?: () => string }).cwd;
  return cwd === undefined ? process.cwd() : cwd.call(proc);
}

async function resolveTargets(
  flags: Flags,
  spec: string | undefined,
  context: CommandContext
): Promise<{ targets: GenerationTarget[]; configDriven: boolean }> {
  const loaded = await loadConfigFile({
    explicitPath: flags.config,
    searchDir: processCwd(context.process),
  });
  const cli = mergeExplicitFlags(flags);

  if (loaded !== null) {
    const { config, filepath } = loaded;

    if ('clients' in config) {
      if (spec !== undefined) {
        throw new UserError(
          `Config file ${filepath} defines named clients; a spec argument cannot be combined ` +
            'with it. Use --project <name> to select one client, or omit the spec argument to run all clients.'
        );
      }
      const names = Object.keys(config.clients);
      if (flags.project !== undefined) {
        const entry = config.clients[flags.project];
        if (entry === undefined) {
          throw new UserError(
            `Unknown client name "${flags.project}" for --project. Available clients: ${names.join(', ')}`
          );
        }
        return {
          targets: [buildTarget(flags.project, entry.input, cli, entry)],
          configDriven: true,
        };
      }
      if (cli.outputDir !== undefined) {
        throw new UserError(
          `--output-dir cannot be combined with running all clients from config file ${filepath}: ` +
            'every client would be written to the same directory. Use --project <name> to select a ' +
            'single client, or remove --output-dir.'
        );
      }
      const targets = names.map((name) =>
        buildTarget(name, config.clients[name].input, cli, config.clients[name])
      );
      return { targets, configDriven: true };
    }

    if (flags.project !== undefined) {
      throw new UserError(
        `Config file ${filepath} defines no clients; --project requires a multi-client config ` +
          '(a "clients" map).'
      );
    }

    return resolveFlatOrSingleTarget(spec, cli, config, true);
  }

  if (flags.project !== undefined) {
    throw new UserError(
      'No config file found; --project requires a config file (.genocrc.yml / .genocrc.json) ' +
        'that defines clients.'
    );
  }

  return resolveFlatOrSingleTarget(spec, cli, undefined, false);
}

function resolveFlatOrSingleTarget(
  spec: string | undefined,
  cli: MergeSource,
  flat: FlatConfig | undefined,
  configDriven: boolean
): { targets: GenerationTarget[]; configDriven: boolean } {
  const input = spec ?? flat?.input;
  if (input === undefined) {
    if (cli.outputDir === undefined && flat?.outputDir === undefined) {
      throw new UserError(
        'No spec input and no output directory were provided. Pass a spec path as the positional ' +
          'argument and --output-dir, or use a config file (.genocrc.yml / .genocrc.json) that ' +
          'provides "input" and "outputDir".'
      );
    }
    throw new UserError(
      'No spec input provided. Pass a spec path as the positional argument, or set "input" in a ' +
        'config file (.genocrc.yml / .genocrc.json).'
    );
  }
  return {
    targets: [buildTarget(targetNameFromInput(input), input, cli, flat)],
    configDriven,
  };
}

async function runOneTarget(target: GenerationTarget, context: CommandContext): Promise<void> {
  if (target.proxy) {
    try {
      assertValidProxyUrl(target.proxy);
    } catch (err) {
      throw new UserError((err as Error).message);
    }
  }

  context.process.stdout.write(`Loading spec from ${target.input}...\n`);
  const doc = await load(target.input, { proxy: target.proxy });
  context.process.stdout.write(`Loaded OpenAPI ${doc.openapi} spec\n`);

  const override = target.specVersion;
  if (override !== undefined && override !== '3.0' && override !== '3.1') {
    throw new Error(`No strategy registered for version: ${override}`);
  }

  const profile = resolveVersion(doc, override);

  if (
    override !== undefined &&
    target.strictVersion !== false &&
    profile.detected !== profile.effective
  ) {
    context.process.stderr.write(
      `Warning: Specified version ${override} does not match detected version ${profile.detected}\n`
    );
  }

  try {
    validateSpec(doc, profile.effective);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserError(message);
  }

  const config = {
    input: target.input,
    outputDir: target.outputDir,
    methodNameStrategy: target.methodNameStrategy,
    strictVersion: target.strictVersion,
    runtimeImportPath: target.runtimeImportPath,
  };

  const { preserveRefSiblings } = profile;
  context.process.stdout.write('Generating client...\n');
  await generateFullOutput(doc, config, { preserveRefSiblings });

  context.process.stdout.write(`✅ Success! Generated client files:\n`);
  context.process.stdout.write(`  - ${target.outputDir}/contracts.ts\n`);
  context.process.stdout.write(`  - ${target.outputDir}/client.ts\n`);
  context.process.stdout.write(`  - ${target.outputDir}/index.ts\n`);
}

export default async function (
  this: CommandContext,
  flags: Flags,
  spec: string | undefined
): Promise<void | Error> {
  try {
    const { targets, configDriven } = await resolveTargets(flags, spec, this);
    const failures: Array<{ name: string; message: string }> = [];
    for (const target of targets) {
      try {
        await runOneTarget(target, this);
      } catch (error) {
        if (!configDriven) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: target.name, message });
      }
    }
    if (failures.length > 0) {
      const lines = failures.map((failure) => `× client "${failure.name}": ${failure.message}`);
      throw new UserError(
        `${lines.join('\n')}\n${failures.length}/${targets.length} targets failed`
      );
    }
    if (configDriven) {
      this.process.stdout.write(`Generated ${targets.length}/${targets.length} clients\n`);
    }
  } catch (error) {
    if (error instanceof UserError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new Error(message);
  }
}
