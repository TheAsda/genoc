import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // Shares the module registry (and the heavy `typescript` import in
    // compile-check) per worker instead of re-evaluating it for every file.
    isolate: false,
  },
});
