import baseConfig, { restrictEnvAccess } from "@laundryroom/eslint-config/base";
import nextjsConfig from "@laundryroom/eslint-config/nextjs";
import reactConfig from "@laundryroom/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: [".next/**"],
  },
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  ...restrictEnvAccess,
];
