"use server";

// 플레이 화면 → 엔진 세션. 상태는 서버에서만 바뀐다.

import { act, move } from "./session";
import type { GameState, MoveRequest } from "./types";

export async function sendActionAction(text: string): Promise<GameState> {
  return act(text);
}

export async function moveAction(req: MoveRequest): Promise<GameState> {
  return move(req);
}
