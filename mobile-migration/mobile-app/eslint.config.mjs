import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const noHardcodedStyles = require("./eslint-rules/no-hardcoded-styles.js");
const noLogicalProps = require("./eslint-rules/no-logical-props.js");
const customStylesPlugin = {
  rules: {
    "no-hardcoded-styles": noHardcodedStyles,
  },
};
const customRulesPlugin = {
  rules: {
    "no-logical-props": noLogicalProps,
  },
};

export default tseslint.config(
  // Global ignores (replaces ignorePatterns)
  { ignores: ["node_modules/", ".expo/", "dist/", "web-build/", "**/*.js"] },

  // Base recommended rules
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide settings
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "import/resolver": {
        alias: {
          map: [["@", "./"]],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
    plugins: {
      "custom-styles": customStylesPlugin,
      "custom-rules": customRulesPlugin,
    },
    rules: {
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "custom-styles/no-hardcoded-styles": "error",
      "custom-rules/no-logical-props": "off",
      // Allow console.warn/error/info — they map to platform logs in
      // production and are useful for diagnosability. console.log is the
      // dev-only chatter we want to keep out of shipping bundles.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/services/api.ts"], message: "Import from @/services/api (barrel) instead." },
          { group: ["**/services/api.old*"], message: "Legacy API file deleted — use @/services/api." },
        ],
      }],
    },
  },

  // Test files — relax rules that are impractical in jest mocks/fixtures
  {
    files: [
      "__tests__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "jest.setup.{js,ts}",
      "__mocks__/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "max-lines": "off",
      "no-console": "off",
    },
  },

  {
    files: ["theme/tokens.ts"],
    rules: {
      "custom-styles/no-hardcoded-styles": "off",
    },
  },

  {
    files: [
      "components/ui/**/*.{ts,tsx}",
      "components/form/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "theme/**/*.{ts,tsx}",
    ],
    rules: {
      "custom-rules/no-logical-props": "error",
    },
  },
);
