// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Allow unused vars starting with underscore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Warn on missing return types (not error - too noisy for callbacks)
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow explicit any in some cases (MCP SDK types)
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['build/**', 'node_modules/**', 'coverage/**', '*.config.*'],
  }
);
