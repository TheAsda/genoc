import type { CommandContext } from '@stricli/core';

import { generateFullOutput } from '../generator/client-generator.js';
import { load } from '../parser/spec-reader.js';
import { validateSpec } from '../parser/validators.js';
import { defaultRegistry } from '../parser/version/index.js';
import { assertValidProxyUrl } from '../utils/proxy.js';
import type { AppFlags as Flags } from './app.js';
import { UserError } from './errors.js';

type GenerationTarget = {
  input: string;
  outputDir: string;
  methodNameStrategy: Flags['methodNameStrategy'];
  specVersion: Flags['specVersion'];
  strictVersion: Flags['strictVersion'];
  runtimeImportPath: Flags['runtimeImportPath'];
  proxy: Flags['proxy'];
};

function targetFromFlags(spec: string, flags: Flags): GenerationTarget {
  return {
    input: spec,
    outputDir: flags.outputDir,
    methodNameStrategy: flags.methodNameStrategy || 'path-based',
    specVersion: flags.specVersion,
    strictVersion: flags.strictVersion,
    runtimeImportPath: flags.runtimeImportPath,
    proxy: flags.proxy,
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

  const strategy = target.specVersion
    ? defaultRegistry.get(target.specVersion)
    : defaultRegistry.detectAndResolve(doc);

  if (target.specVersion && target.strictVersion !== false) {
    const detected = defaultRegistry.detectAndResolve(doc);
    if (detected.version() !== target.specVersion) {
      context.process.stderr.write(
        `Warning: Specified version ${target.specVersion} does not match detected version ${detected.version()}\n`
      );
    }
  }

  const validation = validateSpec(doc, strategy);
  if (!validation.valid) {
    throw new UserError(
      `Invalid OpenAPI specification:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }

  const config = {
    input: target.input,
    outputDir: target.outputDir,
    methodNameStrategy: target.methodNameStrategy,
    specVersion: target.specVersion,
    strictVersion: target.strictVersion,
    runtimeImportPath: target.runtimeImportPath,
  };

  const preserveRefSiblings = strategy.version() === '3.1';
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
  spec: string
): Promise<void | Error> {
  try {
    const targets: GenerationTarget[] = [targetFromFlags(spec, flags)];
    for (const target of targets) {
      await runOneTarget(target, this);
    }
  } catch (error) {
    if (error instanceof UserError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new Error(message);
  }
}
