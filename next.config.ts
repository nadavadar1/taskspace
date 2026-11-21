import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the lock-screen image reads its Hebrew font from disk
  outputFileTracingIncludes: { "/api/wallpaper": ["./src/app/api/wallpaper/*.woff"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
