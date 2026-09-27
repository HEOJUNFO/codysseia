import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 엔진은 빌드 없이 TypeScript 소스 그대로 쓴다.
  transpilePackages: ["@codysseia/engine"],
  // 섬 원본과 루트 node_modules의 워크스페이스 패키지를 모두 포함한다.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
