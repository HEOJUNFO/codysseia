import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 엔진은 빌드 없이 TypeScript 소스 그대로 쓴다.
  transpilePackages: ["@codysseia/engine"],
  // 섬 페이지 원본(islands/<섬_id>/web/)이 web/ 밖에 있어서 저장소 루트를 루트로 잡는다.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
