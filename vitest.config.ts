import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    watch: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    pool: 'forks',
    include: ['packages/*/tests/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/build/**', '**/node_modules/**', '**/tests/**', '**/*.d.ts', 'packages/test-utils/**'],
    },
  },
  resolve: {
    alias: [
      { find: /^@2060\.io\/credo-ts-didcomm-(.*)$/, replacement: `${import.meta.dirname}/packages/$1/src` },
      { find: '@2060.io/credo-ts-ayni-test-utils', replacement: `${import.meta.dirname}/packages/test-utils/src` },
    ],
  },
})
