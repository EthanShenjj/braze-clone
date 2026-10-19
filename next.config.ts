import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: { NEXT_PUBLIC_CANVAS_BROWSER_STORAGE: process.env.VERCEL ? "true" : "false" },
};

export default nextConfig;
