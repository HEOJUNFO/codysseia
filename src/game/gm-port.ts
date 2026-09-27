// GM 공급자 포트. 방은 턴 입력과 이번 턴에 묶인 도구를 넘기고 서술만 받는다. 상태 변경은 반환값이 아니라 턴 중 도구 호출로만 일어난다.
import type { JsonObject, JsonValue, Moves } from "../protocol/play.ts";

export type GMInput =
  | { kind: "action"; characterId: string; characterName: string; text: string }
  /** 섬 간 항해. 이름은 섬 이름이다 */
  | { kind: "voyage"; from: string; to: string; hours: number }
  /** 명확한 이동으로 도착한 장소. 현재 상태의 location 과 같다 */
  | { kind: "arrival"; locationId: string; locationName: string; firstVisit: boolean };

/** 엔진 상태에서 만든 현재 상태 (대전제 9.1 계층 3). get_state 도구도 같은 모양을 돌려준다 */
export type GMStateView = {
  island: { id: string; name: string };
  location: { id: string; name: string; description?: string; spots: { id: string; name: string; description?: string }[] };
  party: { id: string; name: string; hp: number; maxHp: number; mind: number; maxMind: number; spot: string | null }[];
  moves: Moves;
  flags: string[];
  time: number;
};

/** 이번 턴의 GM 입력 (현재 상태 + 최근 로그 + 이번 턴 입력) */
export type GMTurn = GMStateView & {
  recentLog: { role: "gm" | "player" | "system"; text: string }[];
  inputs: GMInput[];
};

/** MCP tools/list 에 그대로 실리는 도구 설명 */
export type GMToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  annotations: { readOnlyHint: boolean };
};

export type GMToolResult = { ok: true; value: JsonValue } | { ok: false; code: string; message: string };

/** 열린 GM 턴 하나에 묶인 도구. 턴이 끝나거나 방이 닫히면 호출은 turn_closed 로 거부된다. */
export type GMTools = {
  readonly definitions: readonly GMToolDefinition[];
  call(name: string, args: unknown): GMToolResult;
};

export type GMProvider = {
  /** 서술 텍스트를 돌려준다. 방이 닫히면 signal 이 중단된다. 실패는 짧고 공개해도 되는 메시지의 Error 로 던진다. */
  narrate(turn: GMTurn, tools: GMTools, signal: AbortSignal): Promise<string>;
};
