import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "cloudflare:workers": "./lib/vercel-cloudflare-shim.ts",
    },
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "cloudflare:workers": "./lib/vercel-cloudflare-shim.ts",
    };
    return config;
  },
};

export default nextConfig;
