// islands/<섬_id>/ 를 /islands/<섬_id> 플레이 화면의 장면 영역으로 연결한다 (대전제 8.5).
//
// 코어 틀(GM 로그, 행동 입력, 파티 상태)은 web/app/islands/layout.tsx 가 그리고,
// 이 스크립트는 그 안에 들어갈 섬별 장면 페이지만 web/app/islands/(generated)/ 에 만든다.
//   islands/ash_harbor/web/page.tsx         → /islands/ash_harbor
//   islands/ash_harbor/web/map/page.tsx     → /islands/ash_harbor/map
//   islands/ash_harbor/assets/map.png       → /islands/ash_harbor/assets/map.png
//
// 플레이 조건(PLAY_REQUIREMENTS)을 모두 채운 섬만 라우트를 만든다 (대전제 8.5).
// 못 채운 섬은 목록에 '준비 중'과 문제 목록으로만 나오고 /islands/<섬_id> 는 404 다.
//
// 연결 파일은 원본을 re-export 하는 한 줄짜리라 원본 편집은 바로 핫 리로드된다.
// 섬이나 라우트 파일을 새로 만들거나 지웠을 때만 다시 실행한다 (npm run sync:islands).
// web/app/islands/(generated)/ 와 web/lib/islands.generated.ts 는 직접 고치지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { archipelagoWarnings, loadIsland } from "../../engine/src/index.ts";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(webDir, "..");
const islandsDir = path.join(repoDir, "islands");
const outDir = path.join(webDir, "app", "islands", "(generated)");
const manifestFile = path.join(webDir, "lib", "islands.generated.ts");

// 섬이 쓸 수 있는 App Router 파일. route.ts(API)는 넣지 않는다.
// 섬 페이지가 서버 코드로 게임 상태를 바꾸지 못하게 하기 위해서다 (대전제 2.1).
const ROUTE_FILES = ["page", "layout", "loading", "error", "not-found", "template"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const ISLAND_ID = /^[a-z][a-z0-9_]*$/;

const HEADER = "// 자동 생성 — 직접 고치지 않는다. (web/scripts/sync-island-routes.mjs)";

// 플레이 가능한 섬의 조건 (대전제 8.5). 문제 목록이 비어 있어야 플레이할 수 있다.
// island.yaml·locations/ 는 엔진이 스키마와 참조까지 검증한다.
function checkIsland(dir) {
  const problems = [];
  if (!fs.existsSync(path.join(dir, "gm.md"))) problems.push("gm.md 없음");
  if (!EXTENSIONS.some((ext) => fs.existsSync(path.join(dir, "web", `page${ext}`)))) problems.push("web/page.tsx 없음");
  const loaded = loadIsland(dir);
  problems.push(...loaded.errors);
  return { problems, island: loaded.island };
}

function writeAssetRoute(islandId) {
  const target = path.join(outDir, islandId, "assets", "[...path]", "route.ts");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
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
    if (EXTENSIONS.includes(ext) && ROUTE_FILES.includes(path.basename(entry.name, ext))) {
      found.push(full);
    }
  }
  return found;
}

// 섬 목록·메인 군도 지도에 보여줄 소개. 준비 중인 섬도 island.yaml 을 읽을 수 있는 만큼 읽는다.
function readIslandInfo(islandDir, islandId) {
  const info = { name: islandId, author: null, concept: null, tone: null, recommendedLevel: null, position: null };
  const file = path.join(islandDir, "island.yaml");
  if (!fs.existsSync(file)) return info;
  let data;
  try {
    data = parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`[sync-island-routes] ${posix(path.relative(repoDir, file))} 읽기 실패: ${err.message}`);
    return info;
  }
  const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
  const pos = data?.archipelago_position;
  const inRange = (n) => typeof n === "number" && n >= 0 && n <= 100;
  return {
    name: text(data?.name) ?? islandId,
    author: text(data?.author),
    concept: text(data?.concept),
    tone: text(data?.tone),
    recommendedLevel: text(data?.recommended_level),
    position: inRange(pos?.x) && inRange(pos?.y) ? { x: pos.x, y: pos.y } : null,
  };
}

function writeStub(islandId, webRoot, source) {
  const rel = path.relative(webRoot, source);
  const target = path.join(outDir, islandId, rel.replace(/\.(ts|jsx|js)$/, ".tsx"));
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const from = toImportPath(path.dirname(target), source);
  const lines = [`// 자동 생성 — 직접 고치지 않는다. 원본: ${posix(path.relative(repoDir, source))}`];
  // "use client" 모듈에서는 export * 를 쓸 수 없고, metadata 도 내보낼 수 없다.
  if (!isClientModule(source)) lines.push(`export * from "${from}";`);
  lines.push(`export { default } from "${from}";`, "");
  fs.writeFileSync(target, lines.join("\n"));
}

function sync() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const islands = [];
  const loadedIslands = [];
  const skipped = [];
  const entries = fs.existsSync(islandsDir) ? fs.readdirSync(islandsDir, { withFileTypes: true }) : [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!ISLAND_ID.test(entry.name)) {
      skipped.push(entry.name);
      continue;
    }

    const id = entry.name;
    const islandDir = path.join(islandsDir, id);
    const { problems, island } = checkIsland(islandDir);
    const playable = problems.length === 0;
    if (playable) {
      const webRoot = path.join(islandDir, "web");
      for (const file of findRouteFiles(webRoot)) writeStub(id, webRoot, file);
      if (fs.existsSync(path.join(islandDir, "assets"))) writeAssetRoute(id);
      loadedIslands.push(island);
    }
    islands.push({ id, ...readIslandInfo(islandDir, id), playable, problems, warnings: [] });
  }

  const warnings = archipelagoWarnings(loadedIslands);
  for (const entry of islands) entry.warnings = warnings[entry.id] ?? [];

  islands.sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
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
