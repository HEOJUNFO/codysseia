// 파일 시스템 어댑터: 섬 패키지의 플레이 가능 여부를 한 번 판정해 호스트와 라우트 생성기에 제공한다.
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { archipelagoWarnings, loadIsland } from "../engine/src/index.ts";

export const WEB_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const ISLAND_ID = /^[a-z][a-z0-9_]*$/;

function islandInfo(islandDir, islandId, islandsDir) {
  const info = { name: islandId, author: null, concept: null, tone: null, recommendedLevel: null, position: null };
  const file = path.join(islandDir, "island.yaml");
  if (!fs.existsSync(file)) return info;
  let data;
  try {
    data = parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`[island-catalog] ${path.relative(islandsDir, file)} 읽기 실패: ${error.message}`);
    return info;
  }
  const text = (value) => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
  const position = data?.archipelago_position;
  const inRange = (value) => typeof value === "number" && value >= 0 && value <= 100;
  return {
    name: text(data?.name) ?? islandId,
    author: text(data?.author),
    concept: text(data?.concept),
    tone: text(data?.tone),
    recommendedLevel: text(data?.recommended_level),
    position: inRange(position?.x) && inRange(position?.y) ? { x: position.x, y: position.y } : null,
  };
}

export function loadIslandCatalog(islandsDir) {
  const islands = [];
  const loadedIslands = [];
  const skipped = [];
  const world = { islands: {}, locations: {} };
  const entries = fs.existsSync(islandsDir) ? fs.readdirSync(islandsDir, { withFileTypes: true }) : [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!ISLAND_ID.test(entry.name)) { skipped.push(entry.name); continue; }

    const id = entry.name;
    const islandDir = path.join(islandsDir, id);
    const problems = [];
    if (!fs.existsSync(path.join(islandDir, "gm.md"))) problems.push("gm.md 없음");
    if (!WEB_EXTENSIONS.some((ext) => fs.existsSync(path.join(islandDir, "web", `page${ext}`)))) problems.push("web/page.tsx 없음");
    const loaded = loadIsland(islandDir);
    problems.push(...loaded.errors);
    const playable = problems.length === 0;
    if (playable) {
      loadedIslands.push(loaded.island);
      world.islands[id] = loaded.island;
      for (const location of loaded.locations) world.locations[location.id] = location;
    }
    islands.push({ id, ...islandInfo(islandDir, id, islandsDir), playable, problems, warnings: [] });
  }

  const warnings = archipelagoWarnings(loadedIslands);
  for (const island of islands) island.warnings = warnings[island.id] ?? [];
  islands.sort((a, b) => a.id.localeCompare(b.id));
  return { islands, world, skipped };
}
