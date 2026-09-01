import type { CommandContext } from '@stricli/core';

import { generateFullOutput } from '../generator/client-generator.js';
import { load } from '../parser/spec-reader.js';
import { validateSpec } from '../parser/validators.js';
import { defaultRegistry } from '../parser/version/index.js';
import type { AppFlags as Flags } from './app.js';
import { UserError } from './errors.js';

export default async function (
  this: CommandContext,
  flags: Flags,
  spec: string
): Promise<void | Error> {
  try {
    this.process.stdout.write(`Loading spec from ${spec}...\n`);
    const doc = await load(spec);
    this.process.stdout.write(`Loaded OpenAPI ${doc.openapi} spec\n`);

    const strategy = flags.specVersion
      ? defaultRegistry.get(flags.specVersion)
      : defaultRegistry.detectAndResolve(doc);

    if (flags.specVersion && flags.strictVersion !== false) {
      const detected = defaultRegistry.detectAndResolve(doc);
      if (detected.version() !== flags.specVersion) {
        this.process.stderr.write(
          `Warning: Specified version ${flags.specVersion} does not match detected version ${detected.version()}\n`
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
      input: spec,
      outputDir: flags.outputDir,
      methodNameStrategy: flags.methodNameStrategy || 'path-based',
      specVersion: flags.specVersion,
      strictVersion: flags.strictVersion,
      runtimeImportPath: flags.runtimeImportPath,
    };

    const preserveRefSiblings = strategy.version() === '3.1';
    this.process.stdout.write('Generating client...\n');
    await generateFullOutput(doc, config, { preserveRefSiblings });

    this.process.stdout.write(`✅ Success! Generated client files:\n`);
    this.process.stdout.write(`  - ${flags.outputDir}/contracts.ts\n`);
    this.process.stdout.write(`  - ${flags.outputDir}/client.ts\n`);
  } catch (error) {
    if (error instanceof UserError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new Error(message);
  }
}
