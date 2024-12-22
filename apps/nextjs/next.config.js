import { fileURLToPath } from "url";
import createMDX from "@next/mdx";
import createJiti from "jiti";
import createNextIntlPlugin from "next-intl/plugin";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@laundryroom/api",
    "@laundryroom/auth",
    "@laundryroom/db",
    "@laundryroom/ui",
    "@laundryroom/validators",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  images: {
    remotePatterns: [
      {
        hostname: "utfs.io",
      },
    ],
  },
};

const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(withMDX(config));
