// lint-staged: runs on staged files pre-commit (husky). Only changed files.
//
// Two separate ESLint configs — the root `eslint.config.js` ignores `api/`,
// and `api/` has its own — but one shared Prettier config. `eslint --fix` and
// `prettier --write` are kept in the same array so they run sequentially on a
// file rather than racing across concurrent glob groups.
//
// Type checks are the third step in each array. tsc/svelte-check are
// *whole-project* — a change in one file can surface a type error in another —
// so they can't be scoped to individual files. Written as a function that
// ignores the staged file list (lint-staged appends filenames to string
// commands, but not to a function's return value), so it runs the full check
// once; the glob only decides *whether* to run it. Keeping it last in the array
// means it runs after eslint/prettier have fixed the same files, and (unlike a
// raw hook command) it type-checks lint-staged's isolated staged state, not the
// working tree. Both gates currently pass with 0 errors; `yarn check` emits only
// non-fatal warnings (svelte-check exits 0), so warnings don't block commits.
//
// Note: lint-staged appends the specific files to be linted to the STRING
// commands specified below as arguments (but not to function commands).
export default {
  // Frontend code → frontend ESLint + Prettier, then whole-project svelte-check.
  '{src,tests}/**/*.{js,ts,svelte}': [
    'eslint --fix --no-warn-ignored',
    'prettier --write',
    () => 'yarn check'
  ],

  // The api type gate (`yarn check:api`) also consumes these frontend model/type
  // definitions, so re-run it when they change — mirrors the trigger paths the
  // deleted api-typecheck.yml watched. These files also match the frontend glob
  // above, so `yarn check` runs too.
  'src/lib/{models,types}/**/*.ts': () => 'yarn check:api',

  // Root config files (svelte/vite/eslint/playwright/capacitor.config.*).
  '*.config.{js,ts,cjs,mjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],

  // api/ code → api ESLint config + Prettier (includes scripts/*.mjs), then the
  // api type gate (checkJs, whole-of-api/src). checkJs means .js changes can
  // introduce type errors, so the gate runs for these too.
  'api/**/*.{js,cjs,mjs}': [
    'eslint --config api/eslint.config.js --no-config-lookup --fix --no-warn-ignored',
    'prettier --write',
    () => 'yarn check:api'
  ],

  // api/ TypeScript (.ts/.d.ts) → Prettier only (the api ESLint config is
  // CommonJS/JS and can't parse TS; mirrors `cd api && yarn lint`), then the
  // api type gate.
  'api/**/*.ts': ['prettier --write', () => 'yarn check:api'],

  // Everything else formattable, repo-wide (api + frontend + root docs/config).
  // Prettier silently skips `.prettierignore`d paths, e.g. api/test/input.
  '**/*.{json,jsonc,md,mdx,css,scss,html,yml,yaml}': 'prettier --write'
};
