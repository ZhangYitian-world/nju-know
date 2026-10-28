import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯静态导出，`npm run build` 后产物在 out/，可直接放到 GitHub Pages
  output: "export",
  // 自定义域名 njuknow.zhangyitian.com 使用根路径，无需 /nju-notice 前缀。
  trailingSlash: true,
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
