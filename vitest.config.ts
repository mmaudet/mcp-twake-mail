import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/cli/**', // CLI prompts are hard to test
        'src/index.ts', // Entry point
        'src/mcp/server.ts', // MCP server setup - integration test territory
        'src/mcp/tools/index.ts', // Tool registration aggregator
        'src/types/**', // Type definitions (no runtime code)
        'src/auth/index.ts', // Re-exports only
        'src/transformers/index.ts', // Re-exports only
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65, // Lower threshold for branches due to error handling edge cases
        statements: 80,
      },
    },
  },
});
