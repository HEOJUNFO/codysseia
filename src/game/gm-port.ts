// GM 공급자 포트. 방은 턴 입력을 넘기고 서술만 받는다. 상태 변경은 반환값이 아니라 턴 중 도구 호출로만 일어난다.
import type { Moves } from "../protocol/play.ts";

export type GMInput = { kind: "action"; characterId: string; characterName: string; text: string };

/** 엔진 상태에서 만든 이번 턴의 GM 입력 (대전제 9.1 현재 상태 + 이번 턴 입력) */
export type GMTurn = {
  island: { id: string; name: string };
  location: { id: string; name: string; description?: string; spots: { id: string; name: string; description?: string }[] };
  party: { id: string; name: string; hp: number; maxHp: number; mind: number; maxMind: number; spot: string | null }[];
  moves: Moves;
  flags: string[];
  time: number;
  recentLog: { role: "gm" | "player" | "system"; text: string }[];
  inputs: GMInput[];
};

export type GMProvider = {
  /** 서술 텍스트를 돌려준다. 방이 닫히면 signal 이 중단된다. 실패는 짧고 공개해도 되는 메시지의 Error 로 던진다. */
  narrate(turn: GMTurn, signal: AbortSignal): Promise<string>;
};
