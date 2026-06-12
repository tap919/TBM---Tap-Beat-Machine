import globals from "globals";
import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,

  // ── Main config for all TS/TSX files ──
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        // Web Audio API globals used in worklets and engine
        RequestInit: "readonly",
        AudioContextOptions: "readonly",
        AudioContextLatencyCategory: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": ts,
      react: react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...ts.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,

      // Allow _prefixed unused variables (catch params, destructured rest, etc.)
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-unused-vars": "off", // defer to @typescript-eslint version

      // Allow explicit `any` in non-critical code (we'll tighten later)
      "@typescript-eslint/no-explicit-any": "warn",

      // Downgrade react-hooks/refs false positives to warnings
      "react-hooks/refs": "warn",
      // Downgrade preserve-manual-memoization to warning (compiler hint, not a bug)
      "react-hooks/preserve-manual-memoization": "warn",
      // Downgrade immutability false positives (e.g. AnalyserNode.fftSize)
      "react-hooks/immutability": "warn",
      // Downgrade set-state-in-effect (valid pattern for initial data fetch)
      "react-hooks/set-state-in-effect": "warn",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // ── Relaxed rules for test files ──
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ── AudioWorklet processor files (JS) ──
  {
    files: ["**/worklets/**/*.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        sampleRate: "readonly",
        console: "readonly",
      },
    },
  },
];
