import { defineConfig } from 'vitest/config'

// Engine/validation tests only — the planning engines are pure TS (no DOM),
// so we run in the node environment with coverage scoped to the pure logic.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: [
        'src/tabs/DeptTab/shared/engines/**/*.ts',
        'src/tabs/DeptTab/shared/deptRegistry.ts',
        'src/tabs/DeptTab/shared/lvType.ts',
        'src/tabs/DeptTab/shared/sapRates.ts',
        'src/tabs/DeptTab/shared/routingRates.ts',
      ],
      exclude: ['**/*.test.ts', 'src/test/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
