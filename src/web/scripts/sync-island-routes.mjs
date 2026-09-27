// src/islands/<섬_id>/ 를 /islands/<섬_id> 플레이 화면의 장면 영역으로 연결한다 (대전제 8.5).
//
// 코어 틀(GM 로그, 행동 입력, 파티 상태)은 src/web/app/islands/layout.tsx 가 그리고,
// 이 스크립트는 그 안에 들어갈 섬별 장면 페이지만 src/web/app/islands/(generated)/ 에 만든다.
//   src/islands/ash_harbor/web/page.tsx     → /islands/ash_harbor
//   src/islands/ash_harbor/web/map/page.tsx → /islands/ash_harbor/map
//   src/islands/ash_harbor/assets/map.png   → /islands/ash_harbor/assets/map.png
//
// 플레이 조건(PLAY_REQUIREMENTS)을 모두 채운 섬만 라우트를 만든다 (대전제 8.5).
// 못 채운 섬은 목록에 '준비 중'과 문제 목록으로만 나오고 /islands/<섬_id> 는 404 다.
//
// 연결 파일은 원본을 re-export 하는 한 줄짜리라 원본 편집은 바로 핫 리로드된다.
// 섬이나 라우트 파일을 새로 만들거나 지웠을 때만 다시 실행한다 (npm run sync:islands).
// src/web/app/islands/(generated)/ 와 src/web/lib/islands.generated.ts 는 직접 고치지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadIslandCatalog, WEB_EXTENSIONS } from "../../catalog/island-catalog.mjs";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.resolve(webDir, "..");
const islandsDir = path.join(sourceDir, "islands");
const outDir = path.join(webDir, "app", "islands", "(generated)");
const manifestFile = path.join(webDir, "lib", "islands.generated.ts");

// 섬이 쓸 수 있는 App Router 파일. route.ts(API)는 넣지 않는다.
// 섬 페이지가 서버 코드로 게임 상태를 바꾸지 못하게 하기 위해서다 (대전제 2.1).
const ROUTE_FILES = ["page", "layout", "loading", "error", "not-found", "template"];

const HEADER = "// 자동 생성 — 직접 고치지 않는다. (src/web/scripts/sync-island-routes.mjs)";
const expectedFiles = new Set();

function writeGenerated(target, content) {
  expectedFiles.add(target);
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function removeStaleGenerated(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeStaleGenerated(target);
      if (fs.readdirSync(target).length === 0) fs.rmdirSync(target);
    } else if (!expectedFiles.has(target) && fs.readFileSync(target, "utf8").startsWith("// 자동 생성 — 직접 고치지 않는다.")) {
      fs.unlinkSync(target);
    }
  }
}

function writeAssetRoute(islandId) {
  const target = path.join(outDir, islandId, "assets", "[...path]", "route.ts");
  writeGenerated(
    target,
    [HEADER, `import { islandAssetHandler } from "@/lib/island-assets";`, "", `export const GET = islandAssetHandler(${JSON.stringify(islandId)});`, ""].join("\n"),
  );
}

function posix(p) {
  return p.split(path.sep).join("/");
}

function toImportPath(fromDir, file) {
  return posix(path.relative(fromDir, file)).replace(/\.(tsx|ts|jsx|js)$/, "");
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
    if (WEB_EXTENSIONS.includes(ext) && ROUTE_FILES.includes(path.basename(entry.name, ext))) {
      found.push(full);
    }
  }
  return found;
}

function writeStub(islandId, webRoot, source) {
  const rel = path.relative(webRoot, source);
  const target = path.join(outDir, islandId, rel.replace(/\.(ts|jsx|js)$/, ".tsx"));

  const from = toImportPath(path.dirname(target), source);
  const lines = [`// 자동 생성 — 직접 고치지 않는다. 원본: ${posix(path.relative(sourceDir, source))}`];
  // "use client" 모듈에서는 export * 를 쓸 수 없고, metadata 도 내보낼 수 없다.
  if (!isClientModule(source)) lines.push(`export * from "${from}";`);
  lines.push(`export { default } from "${from}";`, "");
  writeGenerated(target, lines.join("\n"));
}

function sync() {
  const { islands, skipped } = loadIslandCatalog(islandsDir);
  for (const island of islands) {
    if (!island.playable) continue;
    const islandDir = path.join(islandsDir, island.id);
    const webRoot = path.join(islandDir, "web");
    for (const file of findRouteFiles(webRoot)) writeStub(island.id, webRoot, file);
    if (fs.existsSync(path.join(islandDir, "assets"))) writeAssetRoute(island.id);
  }
  removeStaleGenerated(outDir);

  writeGenerated(
    manifestFile,
    [
      HEADER,
      "export type IslandEntry = {",
      "  id: string;",
      "  name: string;",
      "  author: string | null;",
      "  concept: string | null;",
      "  tone: string | null;",
      "  recommendedLevel: string | null;",
      "  /** 군도 지도 위치. island.yaml 에 없거나 잘못되면 null */",
      "  position: { x: number; y: number } | null;",
      "  playable: boolean;",
      "  problems: string[];",
      "  warnings: string[];",
      "};",
      `export const islands: readonly IslandEntry[] = ${JSON.stringify(islands, null, 2)};`,
      "",
    ].join("\n"),
  );

  const playable = islands.filter((i) => i.playable).map((i) => i.id);
  console.log(`[sync-island-routes] 플레이 가능 ${playable.length}개: ${playable.join(", ") || "(없음)"}`);
  for (const i of islands.filter((i) => !i.playable)) {
    console.log(`[sync-island-routes] 준비 중 ${i.id}:\n  - ${i.problems.join("\n  - ")}`);
  }
  for (const i of islands.filter((i) => i.warnings.length > 0)) {
    console.warn(`[sync-island-routes] 경고 ${i.id}:\n  - ${i.warnings.join("\n  - ")}`);
  }
  if (skipped.length > 0) {
    console.warn(`[sync-island-routes] snake_case 가 아닌 폴더는 건너뜀: ${skipped.join(", ")}`);
  }
}

sync();
