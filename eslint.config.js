import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["error"],
      "obsidianmd/no-static-styles-assignment": ["error"],
      "obsidianmd/prefer-create-el": ["error"],
      "obsidianmd/hardcoded-config-path": ["error"],
    },
  },
];
