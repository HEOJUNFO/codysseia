// 호스트 어댑터: 검증된 섬 데이터를 읽어 방 애플리케이션에 주입한다.
import { fileURLToPath } from "node:url";
import { loadIslandCatalog } from "../catalog/island-catalog.mjs";
import { GameRoom } from "../game/room.ts";
import { registeredIslandActions } from "../game/registered-island-actions.ts";

const islandsDirectory = fileURLToPath(new URL("../islands/", import.meta.url));
let loadedWorld;

function gameWorld() {
  if (loadedWorld) return loadedWorld;
  const { world, islands } = loadIslandCatalog(islandsDirectory);
  for (const island of islands) if (!island.playable) console.warn(`[game] ${island.id} 로드 실패: ${island.problems.join("; ")}`);
  loadedWorld = world;
  return world;
}

export function createGameRoom(startIslandId, members) {
  const world = gameWorld();
  if (!world.islands[startIslandId]) throw new Error("시작할 섬을 플레이할 수 없습니다.");
  return new GameRoom(world, startIslandId, members, (id, asset) =>
    asset ? `/islands/${id}/assets/${asset.replace(/^assets\//, "")}` : null,
    registeredIslandActions,
  );
}
