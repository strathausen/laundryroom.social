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

  /**
   * dev only: atproto's loopback oauth client must call back on 127.0.0.1, so
   * the middleware moves local page views there; the dev server otherwise only
   * accepts localhost as an origin for /_next/* and hot reload
   */
  allowedDevOrigins: ["127.0.0.1"],

  /** Self-contained build for the docker image; lands at .next/standalone/apps/nextjs/server.js */
  output: "standalone",
  /** trace from the monorepo root so the workspace packages end up in the standalone bundle */
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../",
  ),

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
      {
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(withMDX(config));
