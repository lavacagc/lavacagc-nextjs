import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees live under .claude/worktrees inside the repo; each has its
    // own node_modules and .next, and linting them from here reported two
    // hundred thousand phantom problems (Home Services build, 2026-10-29).
    ".claude/worktrees/**",
  ]),
  // `.cjs` is CommonJS by definition, so `require()` is the only import form
  // available there.
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
