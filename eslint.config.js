// ESLint finds likely bugs in the JavaScript: ESLint's recommended rules, with each
// file's real runtime globals. Formatting belongs to Prettier. Run: npm run lint:js
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Build output, the compiled Elm program, and other tools' working copies.
  {
    ignores: [
      'dist/',
      'public/elm.js',
      '**/elm-stuff/',
      'engine/target/',
      '.claude/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: {
      // Best-effort cleanup and storage access ignore failures on purpose: `catch {}`.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `const { drop, ...rest } = value` is how the code leaves out properties.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  // index.html loads the compiled Elm program (public/elm.js) as a classic script.
  { files: ['src/main.js'], languageOptions: { globals: { Elm: 'readonly' } } },
  // The audio worklets and the waveform worker are classic scripts with their own globals.
  {
    files: ['public/audio-worklet.js', 'public/mic-worklet.js'],
    languageOptions: { sourceType: 'script', globals: globals.audioWorklet },
  },
  { files: ['public/waveform-worker.js'], languageOptions: { sourceType: 'script', globals: globals.worker } },
  // Node: build scripts, tool configs and tests (Playwright callbacks also run in the page).
  {
    files: ['scripts/**', 'tests/**', 'engine/tests/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
];
