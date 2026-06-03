// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Root flat ESLint config shared by plain-TS workspaces (apps/api, packages/shared).
 * The Next.js app (apps/web) has its own flat config that extends Next's rules and
 * re-uses these base rules.
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow intentionally-unused args/vars prefixed with `_` (e.g. the `_next`
      // param required to keep Express error middleware at 4-arg arity).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
