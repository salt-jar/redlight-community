import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: ['default'],
  },
});
