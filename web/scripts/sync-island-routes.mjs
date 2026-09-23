// islands/<섬_id>/ 를 /islands/<섬_id> 플레이 화면의 장면 영역으로 연결한다 (대전제 8.5).
//
// 코어 틀(GM 로그, 행동 입력, 파티 상태)은 web/app/islands/layout.tsx 가 그리고,
// 이 스크립트는 그 안에 들어갈 섬별 장면 페이지만 web/app/islands/(generated)/ 에 만든다.
//   islands/ash_harbor/web/page.tsx         → /islands/ash_harbor
//   islands/ash_harbor/web/map/page.tsx     → /islands/ash_harbor/map
//   web/page.tsx 가 없는 섬                  → 코어 기본 장면
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

function writeDefaultScene(islandId, name) {
  const target = path.join(outDir, islandId, "page.tsx");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    [
      HEADER,
      `import { DefaultScene } from "@/components/play/default-scene";`,
      "",
      `export const metadata = { title: ${JSON.stringify(name)} };`,
      "",
      "export default function Page() {",
      `  return <DefaultScene name={${JSON.stringify(name)}} />;`,
      "}",
      "",
    ].join("\n"),
  );
}

function sync() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const islands = [];
  const skipped = [];
  const entries = fs.existsSync(islandsDir) ? fs.readdirSync(islandsDir, { withFileTypes: true }) : [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const islandDir = path.join(islandsDir, entry.name);
    const webRoot = path.join(islandDir, "web");
    const hasWeb = fs.existsSync(webRoot);
    if (!hasWeb && !fs.existsSync(path.join(islandDir, "island.yaml"))) continue;
    if (!ISLAND_ID.test(entry.name)) {
      skipped.push(entry.name);
      continue;
    }

    const id = entry.name;
    const name = readIslandName(islandDir, id);
    const files = hasWeb ? findRouteFiles(webRoot) : [];
    for (const file of files) writeStub(id, webRoot, file);

    const hasScene = files.some((f) => path.dirname(f) === webRoot && path.parse(f).name === "page");
    if (!hasScene) writeDefaultScene(id, name);
    islands.push({ id, name, hasScene });
  }

  islands.sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    [
      HEADER,
      "export type IslandEntry = { id: string; name: string; hasScene: boolean };",
      `export const islands: readonly IslandEntry[] = ${JSON.stringify(islands, null, 2)};`,
      "",
    ].join("\n"),
  );

  const summary = islands.map((i) => `${i.id}${i.hasScene ? "" : "(기본 장면)"}`).join(", ");
  console.log(`[sync-island-routes] 섬 ${islands.length}개: ${summary || "(없음)"}`);
  if (skipped.length > 0) {
    console.warn(`[sync-island-routes] snake_case 가 아닌 폴더는 건너뜀: ${skipped.join(", ")}`);
  }
}

sync();
