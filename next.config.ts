import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      dompurify$: require.resolve("dompurify/dist/purify.es.mjs")
    };

    return config;
  }
};

export default nextConfig;
