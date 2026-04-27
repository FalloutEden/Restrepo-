import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Point dompurify at the CJS build — bypasses the broken exports map
      dompurify$: path.resolve("node_modules/dompurify/dist/purify.cjs.js")
    };

    return config;
  }
};

export default nextConfig;
