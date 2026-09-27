import path from "node:path";
import os from "node:os";
import type { NextConfig } from "next";

const localAddresses = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);
const additionalDevOrigins = (process.env.CODYSSEIA_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...localAddresses, ...additionalDevOrigins],
  // 엔진은 빌드 없이 TypeScript 소스 그대로 쓴다.
  transpilePackages: ["@codysseia/engine"],
  // 섬 원본과 루트 node_modules의 워크스페이스 패키지를 모두 포함한다.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
