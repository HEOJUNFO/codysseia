// 섬 장면(islands/<섬_id>/web/)이 쓸 수 있는 플레이 API. import "@codysseia/play"
// 훅은 클라이언트 컴포넌트("use client")에서만 쓴다.
// 상태는 읽기만 한다. 이동은 useMove, 그 밖의 행동은 useSendAction 으로 보낸다 (대전제 2.1, 8.5, 8.6).

export { useGameState, useMove, useSendAction } from "./provider";
export { formatHours } from "./time";
// 코어 지도 부품. 장면에서 그대로 쓰거나, 상태만 받아 직접 그려도 된다 (대전제 8.7).
export { ArchipelagoMap } from "@/components/play/archipelago-map";
export { IslandMap } from "@/components/play/island-map";
export { LocationView } from "@/components/play/location-view";
export type { ArchipelagoIsland, Character, GameState, IslandMapData, Item, LocationViewData, LogEntry, Moves, Place, Point, Voyage } from "./types";
