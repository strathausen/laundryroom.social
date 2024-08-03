import baseConfig from "@laundryroom/eslint-config/base";
import reactConfig from "@laundryroom/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: [],
  },
  ...baseConfig,
  ...reactConfig,
];
