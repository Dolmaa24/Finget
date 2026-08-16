import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  /**
   * `extension/` is a standalone package with its own install, its own
   * tsconfig and its own `npm run lint`. Linting it from here would apply the
   * web app's React rules to MV3 service-worker code and would need its
   * dependencies installed at the root, which they deliberately are not.
   */
  globalIgnores(['dist', 'extension']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
