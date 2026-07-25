const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

const noopRule = {
  meta: { type: "problem", schema: [] },
  create: () => ({}),
};

const compatibilityPlugin = {
  rules: {
    "no-hardcoded-styles": noopRule,
    "rules-of-hooks": noopRule,
    "exhaustive-deps": noopRule,
  },
};

module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "coverage/**",
      "mobile-migration/**",
      "frontend/**",
      ".claude/**",
      ".wt-*/**",
      "artifacts/**",
      "test_yfinance_env/**",
      "venv/**",
      ".venv/**",
    ],
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "constants/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
      "services/**/*.{ts,tsx}",
      "__tests__/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        __DEV__: "readonly",
        console: "readonly",
        process: "readonly",
        window: "readonly",
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "custom-styles": compatibilityPlugin,
      "react-hooks": compatibilityPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "warn",
    },
  },
];
