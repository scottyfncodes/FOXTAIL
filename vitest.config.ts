import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Several tests run whole simulations (days of garden growth, every
    // putting hole). They pass or fail on what they compute, not how fast;
    // speed budgets live in tests/perf (npm run test:perf). The roomier
    // default keeps a busy CI runner from failing them on time alone.
    testTimeout: 30_000,
  },
});
