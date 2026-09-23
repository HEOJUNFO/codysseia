// 섬 장면(islands/<섬_id>/web/)이 쓸 수 있는 플레이 API. import "@codysseia/play"
// 훅은 클라이언트 컴포넌트("use client")에서만 쓴다.
// 상태는 읽기만 하고, 바꾸고 싶으면 useSendAction 으로 행동을 보낸다 (대전제 2.1, 8.5).

export { useGameState, useSendAction } from "./provider";
export type { Character, GameState, Item, LogEntry } from "./types";
