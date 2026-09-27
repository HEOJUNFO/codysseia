// 섬 장면(src/islands/<섬_id>/web/)이 쓸 수 있는 플레이 API. import "@codysseia/play"
// 훅은 클라이언트 컴포넌트("use client")에서만 쓴다.
// 상태는 읽기만 한다. 이동·자유 행동·승인된 섬 행동은 각각 전용 훅으로 요청한다 (대전제 2.1, 8.5, 8.6).

export { useEndTurn, useGameState, useIslandAction, useIslandPlayerState, useMove, usePlayIdentity, useSendAction, useTurnState } from "./provider";
export { formatHours } from "./time";
// 코어 지도 부품. 장면에서 그대로 쓰거나, 상태만 받아 직접 그려도 된다 (대전제 8.7).
export { ArchipelagoMap } from "@/components/play/archipelago-map";
export { IslandMap } from "@/components/play/island-map";
export { LocationView } from "@/components/play/location-view";
export type { ActionBatch, ArchipelagoIsland, Character, DeepReadonly, GameState, IslandMapData, IslandPatch, IslandState, Item, JsonObject, JsonValue, LocationViewData, LogEntry, Moves, Place, Point, TurnState, Voyage } from "./types";
