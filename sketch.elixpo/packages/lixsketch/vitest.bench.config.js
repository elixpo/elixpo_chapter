import { defineConfig } from 'vitest/config'

// Save/load timing harness. Not part of `npm test`; run with `npm run bench`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/bench/**/*.bench.test.js'],
    testTimeout: 600_000,
  },
})
