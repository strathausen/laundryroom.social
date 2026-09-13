import path from "path";
import { fileURLToPath } from "url";
import createMDX from "@next/mdx";
import createJiti from "jiti";
import createNextIntlPlugin from "next-intl/plugin";

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
createJiti(fileURLToPath(import.meta.url))("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /** Self-contained build for the docker image; lands at .next/standalone/apps/nextjs/server.js */
  output: "standalone",
  experimental: {
    /** trace from the monorepo root so the workspace packages end up in the standalone bundle */
    outputFileTracingRoot: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../",
    ),
  },

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
    // next 14 is not patched for the image-optimizer rce advisories (fix is
    // next >= 15.5.24); serve originals and block /_next/image at nginx until
    // the next 15 upgrade lands
    unoptimized: true,
    remotePatterns: [
      {
        hostname: "utfs.io",
      },
      {
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(withMDX(config));
