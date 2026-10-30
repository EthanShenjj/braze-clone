import type { NextConfig } from "next";

// The brief parser runs in a native Node worker, outside Next's module bundle.
// Keep only its locked runtime dependency closure in this route's file trace.
const briefParserPackages = [
  "unpdf", "mammoth", "@xmldom/xmldom", "argparse", "base64-js", "core-util-is",
  "dingbat-to-unicode", "duck", "immediate", "inherits", "isarray", "jszip", "lie",
  "lop", "option", "pako", "process-nextick-args", "readable-stream", "safe-buffer",
  "setimmediate", "sprintf-js", "string_decoder", "underscore", "util-deprecate", "xmlbuilder",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["unpdf", "mammoth"],
  outputFileTracingIncludes: {
    "/api/campaign-operator": briefParserPackages.map(name => `./node_modules/${name}/**/*`),
  },
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: { NEXT_PUBLIC_CANVAS_BROWSER_STORAGE: process.env.VERCEL ? "true" : "false" },
};

export default nextConfig;
