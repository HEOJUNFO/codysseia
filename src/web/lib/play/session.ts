// 호스트 서버에 있는 게임 세션 하나. 엔진 상태의 원본이다.
// 지금은 메모리에만 둔다 (서버를 재시작하면 처음부터). 저장·멀티 캠페인은 [TBD].
// GM 이 아직 연결되지 않아 서술은 가짜 문장이다.

import path from "node:path";
import {
  availableMoves,
  islandMapView,
  loadWorld,
  moveToLocation,
  moveToSpot,
  startGame,
  travelToIsland,
  type EngineState,
  type MoveEvent,
  type MoveResult,
  type World,
} from "@codysseia/engine";
import { assetUrl } from "@/lib/island-assets";
import { islands } from "@/lib/islands.generated";
import { formatHours } from "./time";
import type { Character, GameState, Item, LogEntry, MoveRequest, Voyage } from "./types";

const ISLANDS_DIR = path.resolve(process.cwd(), "..", "islands");
const START_ISLAND = "hub";

type Stats = Omit<Character, "spotId">;
type Session = {
  engine: EngineState | null;
  stats: Stats[];
  inventory: Item[];
  log: LogEntry[];
  nextLogId: number;
  /** 마지막 섬 간 항해 (화면 연출용) */
  voyage: Voyage | null;
};

// 개발 서버 핫 리로드에도 세션이 유지되도록 globalThis 에 둔다.
const store = globalThis as typeof globalThis & { __codysseiaSession?: Session };

function session(): Session {
  store.__codysseiaSession ??= {
    engine: null,
    stats: [
      { id: "pc.aria", name: "아리아", hp: 18, maxHp: 22, mind: 9, maxMind: 12 },
      { id: "pc.bren", name: "브렌", hp: 25, maxHp: 25, mind: 6, maxMind: 10 },
    ],
    inventory: [
      { id: "core.item.torch", name: "횃불", qty: 3 },
      { id: "core.item.ration", name: "식량", qty: 5 },
    ],
    log: [],
    nextLogId: 0,
    voyage: null,
  };
  const s = store.__codysseiaSession;
  // 게임 시간이 생기기 전에 만든 세션(개발 서버 핫 리로드)을 이어 쓸 때
  if (s.engine && typeof s.engine.time !== "number") s.engine = { ...s.engine, time: 0 };
  s.voyage ??= null;
  return s;
}

function addLog(s: Session, role: LogEntry["role"], text: string) {
  s.nextLogId += 1;
  s.log.push({ id: `log-${s.nextLogId}`, role, text });
}

/** 섬 데이터는 매번 새로 읽는다. 개발 중 YAML 을 고치면 바로 반영된다. */
function currentWorld(): World {
  const { world, errors } = loadWorld(
    ISLANDS_DIR,
    islands.filter((i) => i.playable).map((i) => i.id),
  );
  for (const [id, errs] of Object.entries(errors)) console.warn(`[session] ${id} 로드 실패:\n  - ${errs.join("\n  - ")}`);
  return world;
}

/** 엔진 상태가 없거나, 섬 데이터가 바뀌어 현재 위치가 사라졌으면 새로 시작한다. */
function ensureStarted(s: Session, world: World): EngineState | null {
  if (s.engine && world.locations[s.engine.party.locationId]) return s.engine;
  const ids = Object.keys(world.islands).sort();
  if (ids.length === 0) return (s.engine = null);
  const start = ids.includes(START_ISLAND) ? START_ISLAND : ids[0];
  s.engine = startGame(world, s.stats.map((c) => c.id), start);
  s.log = [];
  s.voyage = null;
  addLog(s, "system", "엔진 연결됨 · GM 미연결 — GM 서술은 가짜 문장입니다. 새 게임을 시작합니다.");
  narrateArrival(s, world, s.engine.party.locationId, true);
  return s.engine;
}

function narrateArrival(s: Session, world: World, locationId: string, firstVisit: boolean) {
  const loc = world.locations[locationId];
  const island = world.islands[loc.islandId];
  const desc = firstVisit && loc.description ? ` ${loc.description}` : "";
  addLog(s, "gm", `(가짜 GM) ${island.name} · ${loc.name}에 ${firstVisit ? "처음 " : ""}도착했다.${desc}`);
}

function applyEvents(s: Session, world: World, events: MoveEvent[]) {
  for (const e of events) {
    if (e.type === "voyage") {
      const from = world.islands[e.from];
      const to = world.islands[e.to];
      s.voyage = {
        id: (s.voyage?.id ?? 0) + 1,
        from: { id: from.id, name: from.name, position: from.position },
        to: { id: to.id, name: to.name, position: to.position },
        hours: e.hours,
      };
      // GM 이 연결되면 이 이벤트를 GM 턴에 넘겨 항해 서술을 받는다 (대전제 8.6, 9.3).
      addLog(s, "gm", `(가짜 GM) ${from.name}을(를) 떠나 ${formatHours(e.hours)} 동안 바다를 건넜다.`);
    }
    if (e.type === "island_entered") addLog(s, "system", `섬 이동 → ${world.islands[e.islandId].name}`);
    if (e.type === "location_entered") narrateArrival(s, world, e.locationId, e.firstVisit);
  }
}

function snapshot(s: Session, world: World): GameState {
  const engine = s.engine;
  const loc = engine ? world.locations[engine.party.locationId] : undefined;
  const island = loc ? world.islands[loc.islandId] : undefined;
  const mapView = engine ? islandMapView(world, engine) : { locations: [], paths: [] };
  return {
    party: s.stats.map((c) => ({ ...c, spotId: engine?.party.spots[c.id] ?? null })),
    inventory: s.inventory,
    place:
      engine && loc
        ? {
            islandId: loc.islandId,
            islandName: world.islands[loc.islandId].name,
            locationId: loc.id,
            locationName: loc.name,
            description: loc.description,
          }
        : null,
    moves: engine ? availableMoves(world, engine) : { locations: [], spots: [], islands: [] },
    visited: engine?.visited ?? [],
    discovered: engine?.discovered ?? [],
    archipelago: Object.values(world.islands)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => ({ id: i.id, name: i.name, position: i.position, current: i.id === island?.id })),
    islandMap: { image: island ? assetUrl(island.id, island.mapImage) : null, ...mapView },
    locationView: {
      image: loc ? assetUrl(loc.islandId, loc.image) : null,
      spots: loc ? loc.spots.map((sp) => ({ id: sp.id, name: sp.name, position: sp.position ?? null })) : [],
    },
    inCombat: engine?.inCombat ?? false,
    time: engine?.time ?? 0,
    voyage: s.voyage,
    log: [...s.log],
    pending: false,
  };
}

/** 게임을 새로 시작하지 않고 파티 위치만 본다 (메인 군도 지도용). 아직 게임이 없으면 null */
export function peekParty(): { islandId: string; time: number } | null {
  const engine = store.__codysseiaSession?.engine;
  return engine ? { islandId: engine.party.islandId, time: engine.time } : null;
}

export function getSnapshot(): GameState {
  const s = session();
  const world = currentWorld();
  ensureStarted(s, world);
  return snapshot(s, world);
}

export function move(req: MoveRequest): GameState {
  const s = session();
  const world = currentWorld();
  const engine = ensureStarted(s, world);
  if (!engine) return snapshot(s, world);

  let result: MoveResult;
  if (req.kind === "location") result = moveToLocation(world, engine, req.locationId);
  else if (req.kind === "island") result = travelToIsland(world, engine, req.islandId);
  else {
    result = { ok: true, state: engine, events: [] };
    for (const id of req.characterIds) {
      if (!result.ok) break;
      const r: MoveResult = moveToSpot(world, result.state, id, req.spotId);
      result = r.ok ? { ok: true, state: r.state, events: [...result.events, ...r.events] } : r;
    }
  }

  if (!result.ok) {
    addLog(s, "system", `이동 불가 — ${result.error.message}`);
  } else {
    s.engine = result.state;
    applyEvents(s, world, result.events);
  }
  return snapshot(s, world);
}

export function act(raw: string): GameState {
  const text = raw.trim();
  const travel = /^\/move\s+([a-z][a-z0-9_]*)$/.exec(text);
  if (travel) return move({ kind: "island", islandId: travel[1] });

  const s = session();
  const world = currentWorld();
  ensureStarted(s, world);
  if (text) {
    addLog(s, "player", text);
    addLog(s, "gm", `(가짜 GM) "${text}" — GM이 연결되면 여기에 서술이 나온다.`);
  }
  return snapshot(s, world);
}
