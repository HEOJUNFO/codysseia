import type { TurnState } from "../protocol/play.ts";

export type TurnRequest =
  | { kind: "start"; order: readonly string[] }
  | { kind: "advance" }
  | { kind: "stop" };

export const FREE_TURN: TurnState = Object.freeze({ mode: "free" });

export function initialTurn(mode: "free" | "ordered", partyIds: Iterable<string>): TurnState {
  if (mode === "free") return FREE_TURN;
  const order = Object.freeze(Array.from(partyIds));
  if (order.length === 0) throw new Error("순서 턴을 시작할 캐릭터가 없습니다.");
  return Object.freeze({ mode: "ordered", round: 1, order, activeCharacterId: order[0] });
}

export function advanceTurn(current: TurnState): TurnState {
  if (current.mode !== "ordered") throw new Error("진행 중인 순서 턴이 없습니다.");
  const index = current.order.indexOf(current.activeCharacterId);
  if (index < 0) throw new Error("현재 턴의 캐릭터가 순서에 없습니다.");
  const next = (index + 1) % current.order.length;
  return Object.freeze({ ...current, round: current.round + (next === 0 ? 1 : 0), activeCharacterId: current.order[next] });
}

/** 규칙 확장의 턴 요청을 검증하고 새 상태를 만든다. 브라우저는 턴 순서를 직접 정할 수 없다. */
export function transitionTurn(current: TurnState, request: unknown, partyIds: Iterable<string>): TurnState {
  if (!request || typeof request !== "object" || !("kind" in request)) throw new Error("턴 요청이 올바르지 않습니다.");
  if (request.kind === "start") {
    if (current.mode !== "free") throw new Error("진행 중인 순서 턴을 먼저 종료해야 합니다.");
    if (!("order" in request) || !Array.isArray(request.order) || request.order.length === 0) throw new Error("턴 순서가 올바르지 않습니다.");
    const party = new Set(partyIds);
    const seen = new Set<string>();
    for (const id of request.order) {
      if (typeof id !== "string" || !party.has(id) || seen.has(id)) throw new Error("턴 순서에는 파티 캐릭터를 중복 없이 넣어야 합니다.");
      seen.add(id);
    }
    const order = Object.freeze([...request.order]) as readonly string[];
    return Object.freeze({ mode: "ordered", round: 1, order, activeCharacterId: order[0] });
  }
  if (request.kind === "advance") {
    return advanceTurn(current);
  }
  if (request.kind === "stop") {
    if (current.mode !== "ordered") throw new Error("진행 중인 순서 턴이 없습니다.");
    return FREE_TURN;
  }
  throw new Error("알 수 없는 턴 요청입니다.");
}
