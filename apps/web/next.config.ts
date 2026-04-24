import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: require("path").resolve(__dirname, "../.."),
};

export default config;
