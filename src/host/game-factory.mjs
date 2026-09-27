// 호스트 어댑터: 검증된 섬 데이터를 읽어 방 애플리케이션에 주입한다.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadIslandCatalog } from "../catalog/island-catalog.mjs";
import { GameRoom } from "../game/room.ts";
import { registeredIslandActions } from "../game/registered-island-actions.ts";
import { CodexCliProvider } from "../gm/codex-cli-provider.ts";

const islandsDirectory = fileURLToPath(new URL("../islands/", import.meta.url));
const gmHome = path.join(os.homedir(), ".tragic_trpg");
let loadedWorld;
let gmProvider;

function gameWorld() {
  if (loadedWorld) return loadedWorld;
  const { world, islands } = loadIslandCatalog(islandsDirectory);
  for (const island of islands) if (!island.playable) console.warn(`[game] ${island.id} 로드 실패: ${island.problems.join("; ")}`);
  loadedWorld = world;
  return world;
}

// GM Codex는 저장소 밖 작업 디렉터리와 전용 CODEX_HOME에서 돈다 (AGENTS.md "두 종류의 에이전트").
function gm() {
  gmProvider ??= new CodexCliProvider({
    workspace: process.env.CODYSSEIA_GM_WORKSPACE ?? path.join(gmHome, "gm-workspace"),
    codexHome: process.env.CODYSSEIA_GM_CODEX_HOME ?? path.join(gmHome, "gm-codex"),
    corePrompt: readFileSync(fileURLToPath(new URL("../gm/core-prompt.md", import.meta.url)), "utf8"),
    // 섬 ID는 검증된 월드에서 온 값이다.
    islandGuide: (islandId) => readFile(path.join(islandsDirectory, islandId, "gm.md"), "utf8").catch(() => null),
    timeoutMs: Number(process.env.CODYSSEIA_GM_TIMEOUT_MS ?? 180_000),
  });
  return gmProvider;
}

export function createGameRoom(startIslandId, members) {
  const world = gameWorld();
  if (!world.islands[startIslandId]) throw new Error("시작할 섬을 플레이할 수 없습니다.");
  return new GameRoom(world, startIslandId, members, (id, asset) =>
    asset ? `/islands/${id}/assets/${asset.replace(/^assets\//, "")}` : null,
    registeredIslandActions,
    gm(),
  );
}
