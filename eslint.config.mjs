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
  // eslint-config-next 16.4 ships the React Compiler lint rules. The upgrade
  // was a security condition from the Home Services review (Next 16.1.6 had
  // 38 advisories), not a licence to rewrite 56 pre-existing effect and ref
  // patterns across twenty unrelated files in the same change. These stay
  // off until a dedicated pass fixes them file by file
  // (docs/home-services/follow-ups.md); new code should not add to them.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // `.cjs` is CommonJS by definition, so `require()` is the only import form
  // available there.
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
