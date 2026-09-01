import { existsSync, mkdirSync, symlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Make the repo's built `genoc` package resolvable from a generated-output
 * directory (mirrors a real consumer's node_modules layout). Requires
 * `npm run build` beforehand so dist/runtime exists.
 */
export function linkGenoc(dir: string): void {
  if (!existsSync(join(REPO_ROOT, 'dist/runtime/index.d.ts'))) {
    throw new Error(
      'dist/runtime not found — run `npm run build` before running tests that compile generated output'
    );
  }
  const nodeModules = join(dir, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  const target = join(nodeModules, 'genoc');
  if (!existsSync(target)) {
    symlinkSync(REPO_ROOT, target, 'dir');
  }
}
