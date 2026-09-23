// islands/<섬_id>/web/ 아래의 App Router 파일을 web/app/islands/<섬_id>/ 로 연결한다.
//
// 각 섬의 web/ 폴더는 /islands/<섬_id> 에 붙는 App Router 하위 트리처럼 동작한다.
//   islands/ash_harbor/web/page.tsx         → /islands/ash_harbor
//   islands/ash_harbor/web/map/page.tsx     → /islands/ash_harbor/map
//
// 연결 파일은 원본을 re-export 하는 한 줄짜리라 원본 편집은 바로 핫 리로드된다.
// 라우트 파일을 새로 만들거나 지웠을 때만 다시 실행한다 (npm run sync:islands).
// web/app/islands/ 와 web/lib/islands.generated.ts 는 이 스크립트가 만든다. 직접 고치지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const islandsDir = path.resolve(webDir, "..", "islands");
const outDir = path.join(webDir, "app", "islands");
const manifestFile = path.join(webDir, "lib", "islands.generated.ts");

// 섬이 쓸 수 있는 App Router 파일. route.ts(API)는 넣지 않는다.
// 섬 페이지가 서버 코드로 게임 상태를 바꾸지 못하게 하기 위해서다 (대전제 2.1).
const ROUTE_FILES = ["page", "layout", "loading", "error", "not-found", "template"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const ISLAND_ID = /^[a-z][a-z0-9_]*$/;

function toImportPath(fromDir, file) {
  const rel = path.relative(fromDir, file).split(path.sep).join("/");
  return rel.replace(/\.(tsx|ts|jsx|js)$/, "");
}

function isClientModule(file) {
  const head = fs.readFileSync(file, "utf8").trimStart();
  return /^["']use client["']/.test(head);
}

function findRouteFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findRouteFiles(full));
      continue;
    }
    const ext = path.extname(entry.name);
    if (EXTENSIONS.includes(ext) && ROUTE_FILES.includes(path.basename(entry.name, ext))) {
      found.push(full);
    }
  }
  return found;
}

function writeStub(islandId, webRoot, source) {
  const rel = path.relative(webRoot, source);
  const target = path.join(outDir, islandId, rel.replace(/\.(ts|jsx|js)$/, ".tsx"));
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const from = toImportPath(path.dirname(target), source);
  const origin = path.relative(path.resolve(webDir, ".."), source).split(path.sep).join("/");
  const lines = [`// 자동 생성 — 직접 고치지 않는다. 원본: ${origin}`];
  // "use client" 모듈에서는 export * 를 쓸 수 없고, metadata 도 내보낼 수 없다.
  if (!isClientModule(source)) lines.push(`export * from "${from}";`);
  lines.push(`export { default } from "${from}";`, "");
  fs.writeFileSync(target, lines.join("\n"));
}

function sync() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const islands = [];
  const skipped = [];
  const entries = fs.existsSync(islandsDir) ? fs.readdirSync(islandsDir, { withFileTypes: true }) : [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const webRoot = path.join(islandsDir, entry.name, "web");
    if (!fs.existsSync(webRoot)) continue;
    if (!ISLAND_ID.test(entry.name)) {
      skipped.push(entry.name);
      continue;
    }
    const files = findRouteFiles(webRoot);
    if (files.length === 0) continue;
    for (const file of files) writeStub(entry.name, webRoot, file);
    islands.push(entry.name);
  }

  islands.sort();
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    [
      "// 자동 생성 — 직접 고치지 않는다. (web/scripts/sync-island-routes.mjs)",
      `export const islandIds: readonly string[] = ${JSON.stringify(islands)};`,
      "",
    ].join("\n"),
  );

  console.log(`[sync-island-routes] 섬 페이지 ${islands.length}개: ${islands.join(", ") || "(없음)"}`);
  if (skipped.length > 0) {
    console.warn(`[sync-island-routes] snake_case 가 아닌 폴더는 건너뜀: ${skipped.join(", ")}`);
  }
}

sync();
