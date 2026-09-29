// ESLint 9 flat config: Node (CommonJS) server and tests with recommended rules, and bug rules for the browser console.
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
    // Browser console: plain <script> files sharing one global scope, so no-undef and
    // no-unused-vars do not apply; these rules catch real bugs (dead code, bad comparisons,
    // duplicate keys, redeclared names).
    files: ['TrustMemory-AI-modular/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-dupe-keys': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error',
      'no-self-assign': 'error', 'no-self-compare': 'error', 'no-constant-condition': ['error', { checkLoops: false }],
      'no-unsafe-negation': 'error', 'no-cond-assign': 'error', 'use-isnan': 'error', 'valid-typeof': 'error',
      'no-sparse-arrays': 'error', 'no-unsafe-finally': 'error', 'no-func-assign': 'error', 'no-redeclare': 'error',
      'no-const-assign': 'error', 'no-dupe-args': 'error', 'no-loss-of-precision': 'error', 'no-useless-backreference': 'error',
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
