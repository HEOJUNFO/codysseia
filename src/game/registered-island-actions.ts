import type { IslandActionHandler } from "./action-handler.ts";

/** 대전제 8.3의 코어 확장 절차를 통과한 섬 판정 구현만 이곳에 등록한다. */
export const registeredIslandActions: ReadonlyMap<string, IslandActionHandler> = new Map();
