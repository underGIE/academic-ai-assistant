import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";

export default [
  { files: ["**/*.{js,mjs,cjs,jsx}"] },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: "readonly", // ← tells ESLint chrome exists in extensions
      },
      parserOptions: {
        sourceType: "module", // ← tells ESLint files use import/export
        ecmaVersion: "latest", // ← allows modern JS syntax
      },
    },
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
];
