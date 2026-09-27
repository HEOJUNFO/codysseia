import type { IslandPatch, IslandState, JsonObject, JsonValue } from "./play.ts";

const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 외부 모듈이 넘긴 JSON 값만 필요한 범위만 복사해 사건 이력에서 불변으로 보관한다. */
export function copyJson(value: unknown, depth = 0): JsonValue {
  if (depth > 32) throw new Error("섬 상태의 중첩 깊이가 너무 큽니다.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => copyJson(entry, depth + 1))) as unknown as JsonValue;
  if (!objectValue(value)) throw new Error("섬 상태는 JSON 값이어야 합니다.");
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error("섬 상태에 사용할 수 없는 키가 있습니다.");
    result[key] = copyJson(entry, depth + 1);
  }
  return Object.freeze(result);
}

export function copyJsonObject(value: unknown): JsonObject {
  const result = copyJson(value);
  if (!objectValue(result)) throw new Error("섬 상태의 최상위 값은 객체여야 합니다.");
  return result;
}

export function normalizeIslandPatch(value: unknown, state: IslandState): IslandPatch {
  if (!objectValue(value)) throw new Error("섬 상태 변경 형식이 올바르지 않습니다.");
  const { target, op, path } = value;
  if (target !== "shared" && target !== "player") throw new Error("섬 상태 대상이 올바르지 않습니다.");
  if (op !== "set" && op !== "remove") throw new Error("섬 상태 연산이 올바르지 않습니다.");
  if (!Array.isArray(path) || path.length < 1 || path.length > 16 || path.some((key) => typeof key !== "string" || key.length < 1 || key.length > 128 || forbiddenKeys.has(key))) {
    throw new Error("섬 상태 경로가 올바르지 않습니다.");
  }
  if (target === "player") {
    const characterId = value.characterId;
    if (typeof characterId !== "string" || !Object.hasOwn(state.players, characterId)) throw new Error("섬 상태의 캐릭터가 올바르지 않습니다.");
    return op === "set"
      ? { target, characterId, path: [...path], op, value: copyJson(value.value) }
      : { target, characterId, path: [...path], op };
  }
  return op === "set"
    ? { target, path: [...path], op, value: copyJson(value.value) }
    : { target, path: [...path], op };
}

function updateObject(root: JsonObject, patch: IslandPatch, index: number): JsonObject {
  const key = patch.path[index];
  if (index === patch.path.length - 1) {
    if (patch.op === "remove" && !Object.hasOwn(root, key)) return root;
    const next = { ...root };
    if (patch.op === "set") next[key] = patch.value;
    else delete next[key];
    return Object.freeze(next);
  }
  const child = root[key];
  if (child !== undefined && !objectValue(child)) throw new Error("섬 상태 경로의 중간 값은 객체여야 합니다.");
  if (child === undefined && patch.op === "remove") return root;
  const updated = updateObject((child ?? {}) as JsonObject, patch, index + 1);
  return updated === child ? root : Object.freeze({ ...root, [key]: updated });
}

/** 경로상의 객체만 복사한다. 이전 섬 상태와 이미 발행한 변경 이력은 그대로 유지된다. */
export function applyIslandPatch(state: IslandState, patch: IslandPatch): IslandState {
  if (patch.target === "shared") {
    const shared = updateObject(state.shared, patch, 0);
    return shared === state.shared ? state : Object.freeze({ ...state, shared });
  }
  const current = state.players[patch.characterId];
  if (!current) throw new Error("섬 상태의 캐릭터가 없습니다.");
  const player = updateObject(current, patch, 0);
  return player === current ? state : Object.freeze({ ...state, players: Object.freeze({ ...state.players, [patch.characterId]: player }) });
}
