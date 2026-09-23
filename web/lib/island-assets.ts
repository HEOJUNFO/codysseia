// islands/<섬_id>/assets/ 파일을 /islands/<섬_id>/assets/... 로 제공한다.
// 라우트는 sync-island-routes 가 플레이 가능한 섬마다 만든다.

import fs from "node:fs/promises";
import path from "node:path";

const ISLANDS_DIR = path.resolve(process.cwd(), "..", "islands");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

const notFound = () => new Response("Not found", { status: 404 });

export function islandAssetHandler(islandId: string) {
  const root = path.join(ISLANDS_DIR, islandId, "assets");
  return async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
    const { path: parts } = await ctx.params;
    const file = path.resolve(root, ...parts);
    if (!file.startsWith(root + path.sep)) return notFound();
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (!type) return notFound();
    try {
      const data = await fs.readFile(file);
      return new Response(data, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          // SVG 안의 스크립트가 실행되지 않게 막는다
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    } catch {
      return notFound();
    }
  };
}

/** 섬 폴더 기준 assets/ 경로 → 브라우저 URL */
export function assetUrl(islandId: string, asset: string | undefined): string | null {
  return asset ? `/islands/${islandId}/assets/${asset.replace(/^assets\//, "")}` : null;
}
