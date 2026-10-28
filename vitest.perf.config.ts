import { defineConfig } from 'vitest/config';

// Wall-clock benchmarks, kept out of `npm test` so a busy machine can't
// block a deploy. Run with `npm run test:perf`.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/perf/**/*.perf.ts'],
  },
});
