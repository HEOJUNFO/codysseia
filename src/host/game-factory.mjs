// 호스트 어댑터: 검증된 섬 데이터를 읽어 방 애플리케이션에 주입한다.
import { fileURLToPath } from "node:url";
import { loadWorld } from "@codysseia/engine";
import { GameRoom } from "../game/room.ts";
import { islands } from "../web/lib/islands.generated.ts";

const islandsDirectory = fileURLToPath(new URL("../islands/", import.meta.url));
const playableIds = islands.filter((island) => island.playable).map((island) => island.id);
let loadedWorld;

function gameWorld() {
  if (loadedWorld) return loadedWorld;
  const { world, errors } = loadWorld(islandsDirectory, playableIds);
  for (const [id, messages] of Object.entries(errors)) console.warn(`[game] ${id} 로드 실패: ${messages.join("; ")}`);
  loadedWorld = world;
  return world;
}

export function createGameRoom(startIslandId, members) {
  if (!playableIds.includes(startIslandId)) throw new Error("시작할 섬을 플레이할 수 없습니다.");
  const world = gameWorld();
  if (!world.islands[startIslandId]) throw new Error("시작할 섬을 불러오지 못했습니다.");
  return new GameRoom(world, startIslandId, members, (id, asset) =>
    asset ? `/islands/${id}/assets/${asset.replace(/^assets\//, "")}` : null,
  );
}
