// 세 단계 이동 (대전제 8.6):
//   섬 간    travelToIsland  — 출발 가능 지역에서만, 도착 섬의 entry_location 으로. 군도 지도 거리만큼 시간이 흐른다
//   지역 간  moveToLocation  — 현재 지역의 connections 를 따라서
//   지역 안  moveToSpot      — 캐릭터마다 따로
// 모든 함수는 순수 함수다. 상태를 고치지 않고 새 상태를 돌려준다.

import type { CharacterId, Connection, EngineState, IslandId, LocationId, Point, SpotId, World } from "./types.ts";

export type MoveErrorCode =
  | "in_combat"
  | "unknown_island"
  | "same_island"
  | "not_departure_point"
  | "island_locked"
  | "unknown_location"
  | "same_location"
  | "not_connected"
  | "locked"
  | "unknown_character"
  | "unknown_spot";

export type MoveError = { code: MoveErrorCode; message: string };

export type MoveEvent =
  | { type: "voyage"; from: IslandId; to: IslandId; hours: number }
  | { type: "island_entered"; islandId: IslandId }
  | { type: "location_entered"; locationId: LocationId; firstVisit: boolean }
  | { type: "spot_changed"; characterId: CharacterId; spotId: SpotId | null };

export type MoveResult = { ok: true; state: EngineState; events: MoveEvent[] } | { ok: false; error: MoveError };

export type AvailableMoves = {
  /** 보이는 연결. locked 면 보이지만 지나갈 수 없다 */
  locations: { id: LocationId; name: string; locked: boolean }[];
  spots: { id: SpotId; name: string }[];
  /** 출발 가능 지역에 있을 때만 채워진다. hours 는 항해 시간 */
  islands: { id: IslandId; name: string; locked: boolean; hours: number }[];
};

/** 군도 지도 거리 1(퍼센트 좌표)당 항해 시간. 지도 끝에서 끝(약 100)이 4일 남짓 */
export const VOYAGE_HOURS_PER_UNIT = 1;

/** 두 섬 사이 항해 시간(시간 단위). 군도 지도 위 직선거리에 비례하고 최소 1시간 */
export function voyageHours(from: Point, to: Point): number {
  return Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) * VOYAGE_HOURS_PER_UNIT));
}

function fail(code: MoveErrorCode, message: string): MoveResult {
  return { ok: false, error: { code, message } };
}

function allSet(flags: string[], required: string[]): boolean {
  return required.every((f) => flags.includes(f));
}

function isVisible(conn: Connection, flags: string[]): boolean {
  return allSet(flags, conn.hiddenUntilFlags);
}

function departurePoints(world: World, islandId: IslandId): LocationId[] {
  const island = world.islands[islandId];
  if (!island) return [];
  return island.departureLocations.length > 0 ? island.departureLocations : [island.entryLocation];
}

function addUnique<T>(list: T[], items: T[]): T[] {
  const next = [...list];
  for (const item of items) if (!next.includes(item)) next.push(item);
  return next;
}

/** 지역에 들어간다. 지점은 모두 초기화하고, 방문·발견 기록을 갱신한다. */
function enterLocation(world: World, state: EngineState, locationId: LocationId): { state: EngineState; firstVisit: boolean } {
  const loc = world.locations[locationId];
  const firstVisit = !state.visited.includes(locationId);
  const visibleTargets = loc.connections.filter((c) => isVisible(c, state.flags)).map((c) => c.to);
  const spots = Object.fromEntries(state.party.members.map((m) => [m, null]));
  return {
    firstVisit,
    state: {
      ...state,
      party: { ...state.party, islandId: loc.islandId, locationId, spots },
      visited: addUnique(state.visited, [locationId]),
      discovered: addUnique(state.discovered, [locationId, ...visibleTargets]),
    },
  };
}

export function startGame(world: World, members: CharacterId[], islandId: IslandId): EngineState {
  const island = world.islands[islandId];
  if (!island) throw new Error(`시작 섬이 없다: ${islandId}`);
  const blank: EngineState = {
    party: { members, islandId, locationId: island.entryLocation, spots: {} },
    visited: [],
    discovered: [],
    flags: [],
    inCombat: false,
    time: 0,
  };
  return enterLocation(world, blank, island.entryLocation).state;
}

export function availableMoves(world: World, state: EngineState): AvailableMoves {
  const loc = world.locations[state.party.locationId];
  const spots = loc ? loc.spots.map((s) => ({ id: s.id, name: s.name })) : [];
  if (state.inCombat || !loc) return { locations: [], spots, islands: [] };

  const locations = loc.connections
    .filter((c) => isVisible(c, state.flags) && world.locations[c.to])
    .map((c) => ({ id: c.to, name: world.locations[c.to].name, locked: !allSet(state.flags, c.requiresFlags) }));

  const here = world.islands[state.party.islandId];
  const atDeparture = departurePoints(world, state.party.islandId).includes(state.party.locationId);
  const islands = atDeparture && here
    ? Object.values(world.islands)
        .filter((i) => i.id !== state.party.islandId)
        .map((i) => ({
          id: i.id,
          name: i.name,
          locked: !allSet(state.flags, i.entryRequiresFlags),
          hours: voyageHours(here.position, i.position),
        }))
    : [];

  return { locations, spots, islands };
}

export function moveToLocation(world: World, state: EngineState, to: LocationId): MoveResult {
  if (state.inCombat) return fail("in_combat", "전투 중에는 다른 지역으로 이동할 수 없다.");
  const target = world.locations[to];
  if (!target) return fail("unknown_location", `없는 지역: ${to}`);
  if (to === state.party.locationId) return fail("same_location", "이미 그 지역에 있다.");

  const here = world.locations[state.party.locationId];
  const conn = here?.connections.find((c) => c.to === to);
  if (!conn || !isVisible(conn, state.flags)) return fail("not_connected", `${here?.name ?? "여기"}에서 ${target.name}(으)로 가는 길이 없다.`);
  if (!allSet(state.flags, conn.requiresFlags)) return fail("locked", `${target.name}(으)로 가는 길이 막혀 있다.`);

  const entered = enterLocation(world, state, to);
  return {
    ok: true,
    state: entered.state,
    events: [{ type: "location_entered", locationId: to, firstVisit: entered.firstVisit }],
  };
}

export function moveToSpot(world: World, state: EngineState, characterId: CharacterId, spotId: SpotId | null): MoveResult {
  if (!state.party.members.includes(characterId)) return fail("unknown_character", `파티에 없는 캐릭터: ${characterId}`);
  const loc = world.locations[state.party.locationId];
  if (spotId !== null && !loc?.spots.some((s) => s.id === spotId)) {
    return fail("unknown_spot", `${loc?.name ?? "이 지역"}에 없는 지점: ${spotId}`);
  }
  return {
    ok: true,
    state: { ...state, party: { ...state.party, spots: { ...state.party.spots, [characterId]: spotId } } },
    events: [{ type: "spot_changed", characterId, spotId }],
  };
}

export function travelToIsland(world: World, state: EngineState, islandId: IslandId): MoveResult {
  if (state.inCombat) return fail("in_combat", "전투 중에는 섬을 떠날 수 없다.");
  const target = world.islands[islandId];
  if (!target) return fail("unknown_island", `플레이할 수 없거나 없는 섬: ${islandId}`);
  if (islandId === state.party.islandId) return fail("same_island", "이미 그 섬에 있다.");
  if (!departurePoints(world, state.party.islandId).includes(state.party.locationId)) {
    return fail("not_departure_point", "여기서는 섬을 떠날 수 없다. 항구나 포털 같은 출발 지역으로 가야 한다.");
  }
  if (!allSet(state.flags, target.entryRequiresFlags)) return fail("island_locked", `아직 ${target.name}에 들어갈 수 없다.`);

  const from = state.party.islandId;
  const hours = voyageHours(world.islands[from].position, target.position);
  const entered = enterLocation(world, state, target.entryLocation);
  return {
    ok: true,
    state: { ...entered.state, time: state.time + hours },
    events: [
      { type: "voyage", from, to: islandId, hours },
      { type: "island_entered", islandId },
      { type: "location_entered", locationId: target.entryLocation, firstVisit: entered.firstVisit },
    ],
  };
}

export type IslandMapView = {
  /** 현재 섬에서 지도에 드러난 지역 */
  locations: { id: LocationId; name: string; position: Point | null; visited: boolean; current: boolean }[];
  /** 드러난 지역끼리의 보이는 연결. 일방통행이면 from → to */
  paths: { from: LocationId; to: LocationId; locked: boolean }[];
};

/** 섬 지도에 그릴 것. 발견하지 못한 지역과 숨은 길은 넣지 않는다. */
export function islandMapView(world: World, state: EngineState): IslandMapView {
  const islandId = state.party.islandId;
  const shown = state.discovered.filter((id) => world.locations[id]?.islandId === islandId);
  return {
    locations: shown.map((id) => ({
      id,
      name: world.locations[id].name,
      position: world.locations[id].mapPosition ?? null,
      visited: state.visited.includes(id),
      current: id === state.party.locationId,
    })),
    paths: shown.flatMap((from) =>
      world.locations[from].connections
        .filter((c) => shown.includes(c.to) && isVisible(c, state.flags))
        .map((c) => ({ from, to: c.to, locked: !allSet(state.flags, c.requiresFlags) })),
    ),
  };
}
