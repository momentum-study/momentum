import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./src/test-setup.ts'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/features/**/*.ts', 'src/features/**/*.tsx'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    },
  },
})
