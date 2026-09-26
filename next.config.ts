import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/build/Release/*.node"],
  },
  outputFileTracingExcludes: {
    "/*": ["./data/extraction/**/*", "./data/research/**/*"],
  },
};

export default nextConfig;
