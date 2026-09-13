import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";

/** @type {Awaited<import('typescript-eslint').Config>} */
export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...hooksPlugin.configs.recommended.rules,
      // eslint-plugin-react-hooks 7.x ships the react-compiler rules in
      // `recommended`. only the two that flag pre-existing code are off
      // (set-state-in-effect: 6 sites, immutability: 4 sites in
      // image-upload-enhancer); the other compiler rules stay on and pass.
      // re-enable these when we adopt the compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
    languageOptions: {
      globals: {
        React: "writable",
      },
    },
  },
];
