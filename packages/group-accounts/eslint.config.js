import baseConfig, { restrictEnvAccess } from "@laundryroom/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: ["dist/**"],
  },
  ...baseConfig,
  ...restrictEnvAccess,
  {
    files: ["**/*.test.ts"],
    rules: {
      // node:test's describe/it return promises the test runner awaits itself
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["describe", "it", "suite", "test"],
            },
          ],
        },
      ],
    },
  },
];
