// ESLint 9 flat config: Node (CommonJS) server and tests, recommended rules.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    files: ['server/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // These files are owned elsewhere and not changed in this pass. Their only finding is an
    // unused `catch (err)` binding, so just that option is relaxed, and only for them.
    files: ['server/groq.js', 'server/hindsight.js', 'server/memory-routes.js', 'server/reset-bank.js', 'server/health-routes.js'],
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
