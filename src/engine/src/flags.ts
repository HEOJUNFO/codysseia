// 스토리 플래그 (대전제 8.2). 플래그를 켜고 끄는 것은 현재 섬의 플래그만, 읽는 것은 현재 섬과 다른 섬의 공개 플래그만 된다.
// 상태 전이 함수는 입력 상태를 고치지 않고 새 상태를 돌려준다.

import type { EngineState, FlagId, IslandId, LocationId, World } from "./types.ts";

export type FlagErrorCode = "invalid_flag" | "foreign_flag" | "private_flag";
export type FlagError = { code: FlagErrorCode; message: string };

export type FlagResult =
  | { ok: true; state: EngineState; changed: boolean; discoveredAdded: LocationId[] }
  | { ok: false; error: FlagError };

export type FlagRead = { ok: true; on: boolean } | { ok: false; error: FlagError };

/** 스키마의 flagId 와 같은 모양: <섬_id>.flag.<이름> */
const FLAG_ID = /^([a-z][a-z0-9_]*)\.flag\.[a-z0-9_]+$/;

function flagIsland(flagId: unknown): IslandId | null {
  return typeof flagId === "string" && flagId.length <= 128 ? FLAG_ID.exec(flagId)?.[1] ?? null : null;
}

export function isFlagOf(islandId: IslandId, flagId: string): boolean {
  return flagIsland(flagId) === islandId;
}

function fail(code: FlagErrorCode, message: string): { ok: false; error: FlagError } {
  return { ok: false, error: { code, message } };
}

/** 현재 섬의 플래그를 켜거나 끈다. 켜서 드러난 길의 끝 지역은 방문한 지역에서 보이므로 지도에 드러난다. */
export function setFlag(world: World, state: EngineState, flagId: FlagId, on: boolean): FlagResult {
  const islandId = flagIsland(flagId);
  if (!islandId) return fail("invalid_flag", `플래그 ID는 <섬_id>.flag.<이름> 모양이어야 한다: ${String(flagId)}`);
  if (islandId !== state.party.islandId) return fail("foreign_flag", `현재 섬(${state.party.islandId})의 플래그만 바꿀 수 있다: ${flagId}`);
  const has = state.flags.includes(flagId);
  if (has === on) return { ok: true, state, changed: false, discoveredAdded: [] };
  const flags = on ? [...state.flags, flagId] : state.flags.filter((flag) => flag !== flagId);
  const discoveredAdded: LocationId[] = [];
  if (on) {
    const discovered = new Set(state.discovered);
    for (const visitedId of state.visited) {
      for (const connection of world.locations[visitedId]?.connections ?? []) {
        if (!connection.hiddenUntilFlags.includes(flagId) || discovered.has(connection.to)) continue;
        if (!connection.hiddenUntilFlags.every((flag) => flags.includes(flag))) continue;
        discovered.add(connection.to);
        discoveredAdded.push(connection.to);
      }
    }
  }
  return {
    ok: true,
    changed: true,
    discoveredAdded,
    state: { ...state, flags, discovered: discoveredAdded.length ? [...state.discovered, ...discoveredAdded] : state.discovered },
  };
}

/** 현재 섬의 플래그와, 다른 섬이 hooks.yaml 로 공개한 플래그만 읽는다. */
export function readFlag(world: World, state: EngineState, flagId: FlagId): FlagRead {
  const islandId = flagIsland(flagId);
  if (!islandId) return fail("invalid_flag", `플래그 ID는 <섬_id>.flag.<이름> 모양이어야 한다: ${String(flagId)}`);
  if (islandId !== state.party.islandId && !world.islands[islandId]?.publicFlags?.includes(flagId)) {
    return fail("private_flag", `다른 섬의 플래그는 그 섬이 공개한 것만 읽을 수 있다: ${flagId}`);
  }
  return { ok: true, on: state.flags.includes(flagId) };
}
