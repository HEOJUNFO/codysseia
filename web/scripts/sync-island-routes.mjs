// islands/<섬_id>/ 를 /islands/<섬_id> 플레이 화면의 장면 영역으로 연결한다 (대전제 8.5).
//
// 코어 틀(GM 로그, 행동 입력, 파티 상태)은 web/app/islands/layout.tsx 가 그리고,
// 이 스크립트는 그 안에 들어갈 섬별 장면 페이지만 web/app/islands/(generated)/ 에 만든다.
//   islands/ash_harbor/web/page.tsx         → /islands/ash_harbor
//   islands/ash_harbor/web/map/page.tsx     → /islands/ash_harbor/map
//
// 플레이 조건(PLAY_REQUIREMENTS)을 모두 채운 섬만 라우트를 만든다 (대전제 8.5).
// 못 채운 섬은 목록에 '준비 중'으로만 나오고 /islands/<섬_id> 는 404 다.
//
// 연결 파일은 원본을 re-export 하는 한 줄짜리라 원본 편집은 바로 핫 리로드된다.
// 섬이나 라우트 파일을 새로 만들거나 지웠을 때만 다시 실행한다 (npm run sync:islands).
// web/app/islands/(generated)/ 와 web/lib/islands.generated.ts 는 직접 고치지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

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

// 플레이 가능한 섬의 조건. 파일이 있는지만 본다 (내용 검증은 /schemas 가 생기면 추가).
const PLAY_REQUIREMENTS = [
  { label: "island.yaml", ok: (dir) => fs.existsSync(path.join(dir, "island.yaml")) },
  { label: "gm.md", ok: (dir) => fs.existsSync(path.join(dir, "gm.md")) },
  {
    label: "locations/*.yaml",
    ok: (dir) => {
      const locDir = path.join(dir, "locations");
      return fs.existsSync(locDir) && fs.readdirSync(locDir).some((f) => /\.ya?ml$/.test(f));
    },
  },
  { label: "web/page.tsx", ok: (dir) => EXTENSIONS.some((ext) => fs.existsSync(path.join(dir, "web", `page${ext}`))) },
];

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

function readIslandName(islandDir, islandId) {
  const file = path.join(islandDir, "island.yaml");
  if (!fs.existsSync(file)) return islandId;
  try {
    const data = parse(fs.readFileSync(file, "utf8"));
    return typeof data?.name === "string" && data.name.trim() ? data.name.trim() : islandId;
  } catch (err) {
    console.warn(`[sync-island-routes] ${posix(path.relative(repoDir, file))} 읽기 실패: ${err.message}`);
    return islandId;
  }
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
    const missing = PLAY_REQUIREMENTS.filter((r) => !r.ok(islandDir)).map((r) => r.label);
    const playable = missing.length === 0;
    if (playable) {
      const webRoot = path.join(islandDir, "web");
      for (const file of findRouteFiles(webRoot)) writeStub(id, webRoot, file);
    }
    islands.push({ id, name: readIslandName(islandDir, id), playable, missing });
  }

  islands.sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    [
      HEADER,
      "export type IslandEntry = { id: string; name: string; playable: boolean; missing: string[] };",
      `export const islands: readonly IslandEntry[] = ${JSON.stringify(islands, null, 2)};`,
      "",
    ].join("\n"),
  );

  const playable = islands.filter((i) => i.playable).map((i) => i.id);
  console.log(`[sync-island-routes] 플레이 가능 ${playable.length}개: ${playable.join(", ") || "(없음)"}`);
  for (const i of islands.filter((i) => !i.playable)) {
    console.log(`[sync-island-routes] 준비 중 ${i.id} — 없음: ${i.missing.join(", ")}`);
  }
  if (skipped.length > 0) {
    console.warn(`[sync-island-routes] snake_case 가 아닌 폴더는 건너뜀: ${skipped.join(", ")}`);
  }
}

sync();
