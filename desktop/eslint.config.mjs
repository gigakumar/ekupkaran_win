import js from "@eslint/js";

const sharedRules = {
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  "no-console": "off",
};

export default [
  js.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["main.js", "preload.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
    rules: sharedRules,
  },
  {
    files: ["renderer/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
      },
    },
    rules: sharedRules,
  },
];
