import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: require("path").resolve(__dirname, "../.."),
  experimental: {
    typedRoutes: true,
  },
};

export default config;
