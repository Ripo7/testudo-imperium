// Lint for mistakes only (undefined or unused names, duplicate imports), not for style.
import globals from 'globals';

export default [
  { ignores: ['dist/', 'tools/out/', 'node_modules/'] },
  {
    files: ['src/**/*.js', 'lab/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-import-assign': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-duplicate-imports': 'error' },
  },
];
