import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // Must match the 30s execSync budget of tsc compile tests; default 5s killed them under CI contention.
    testTimeout: 30_000,
  },
});
