import { expect } from "./expect.ts";
import { describe, it } from "node:test";
import { availableMoves, islandMapView, moveToLocation, moveToSpot, startGame, travelToIsland, voyageHours } from "../src/index.ts";
import type { EngineState, World } from "../src/index.ts";

// ash: docks(출발) ↔ market → lighthouse(잠김) , market → cellar(숨김)
// fog: pier(도착·출발), 들어가려면 ash.flag.bell_rung 필요
const world: World = {
  islands: {
    ash: { id: "ash", name: "잿빛 항구", entryLocation: "ash.loc.docks", departureLocations: [], entryRequiresFlags: [], position: { x: 20, y: 30 } },
    fog: { id: "fog", name: "안개 섬", entryLocation: "fog.loc.pier", departureLocations: [], entryRequiresFlags: ["ash.flag.bell_rung"], position: { x: 70, y: 60 } },
  },
  locations: {
    "ash.loc.docks": {
      id: "ash.loc.docks", islandId: "ash", name: "부두", spots: [],
      connections: [{ to: "ash.loc.market", requiresFlags: [], hiddenUntilFlags: [] }],
    },
    "ash.loc.market": {
      id: "ash.loc.market", islandId: "ash", name: "시장", mapPosition: { x: 50, y: 50 },
      spots: [{ id: "ash.spot.stall", name: "노점" }, { id: "ash.spot.well", name: "우물" }],
      connections: [
        { to: "ash.loc.docks", requiresFlags: [], hiddenUntilFlags: [] },
        { to: "ash.loc.lighthouse", requiresFlags: ["ash.flag.key"], hiddenUntilFlags: [] },
        { to: "ash.loc.cellar", requiresFlags: [], hiddenUntilFlags: ["ash.flag.map_read"] },
      ],
    },
    "ash.loc.lighthouse": { id: "ash.loc.lighthouse", islandId: "ash", name: "등대", spots: [], connections: [] },
    "ash.loc.cellar": { id: "ash.loc.cellar", islandId: "ash", name: "지하실", spots: [], connections: [] },
    "fog.loc.pier": { id: "fog.loc.pier", islandId: "fog", name: "안개 부두", spots: [], connections: [] },
  },
};

const members = ["pc.a", "pc.b"];

function ok(result: ReturnType<typeof moveToLocation>): EngineState {
  if (!result.ok) throw new Error(`이동 실패: ${result.error.code}`);
  return result.state;
}

function withFlags(state: EngineState, ...flags: string[]): EngineState {
  return { ...state, flags: [...state.flags, ...flags] };
}

describe("startGame", () => {
  it("시작 섬의 entry_location 에 파티를 두고, 보이는 연결을 발견한다", () => {
    const s = startGame(world, members, "ash");
    expect(s.party.locationId).toBe("ash.loc.docks");
    expect(s.party.spots).toEqual({ "pc.a": null, "pc.b": null });
    expect(s.visited).toEqual(["ash.loc.docks"]);
    expect(s.discovered).toEqual(["ash.loc.docks", "ash.loc.market"]);
    expect(s.time).toBe(0);
  });
});

describe("지역 간 이동", () => {
  it("연결된 지역으로 이동하고 첫 방문을 알린다", () => {
    const r = moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market");
    expect(r.ok && r.events).toEqual([{ type: "location_entered", locationId: "ash.loc.market", firstVisit: true }]);
    const s = ok(r);
    expect(s.party.locationId).toBe("ash.loc.market");
    expect(s.discovered).toContain("ash.loc.lighthouse");
    expect(s.discovered).not.toContain("ash.loc.cellar");
  });

  it("다시 들어가면 firstVisit 이 false", () => {
    let s = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    s = ok(moveToLocation(world, s, "ash.loc.docks"));
    const r = moveToLocation(world, s, "ash.loc.market");
    expect(r.ok && r.events[0]).toMatchObject({ firstVisit: false });
  });

  it("연결되지 않은 지역으로는 못 간다", () => {
    const r = moveToLocation(world, startGame(world, members, "ash"), "ash.loc.lighthouse");
    expect(!r.ok && r.error.code).toBe("not_connected");
  });

  it("requires_flags 가 꺼져 있으면 잠김, 켜지면 통과", () => {
    const market = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    const locked = moveToLocation(world, market, "ash.loc.lighthouse");
    expect(!locked.ok && locked.error.code).toBe("locked");
    expect(ok(moveToLocation(world, withFlags(market, "ash.flag.key"), "ash.loc.lighthouse")).party.locationId).toBe("ash.loc.lighthouse");
  });

  it("hidden_until_flags 가 꺼져 있으면 보이지도 않고 갈 수도 없다", () => {
    const market = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    expect(availableMoves(world, market).locations.map((l) => l.id)).not.toContain("ash.loc.cellar");
    expect(!moveToLocation(world, market, "ash.loc.cellar").ok).toBe(true);

    const revealed = withFlags(market, "ash.flag.map_read");
    expect(availableMoves(world, revealed).locations.map((l) => l.id)).toContain("ash.loc.cellar");
    expect(ok(moveToLocation(world, revealed, "ash.loc.cellar")).party.locationId).toBe("ash.loc.cellar");
  });

  it("지역을 옮기면 캐릭터 지점이 초기화된다", () => {
    let s = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    s = ok(moveToSpot(world, s, "pc.a", "ash.spot.well"));
    s = ok(moveToLocation(world, s, "ash.loc.docks"));
    expect(s.party.spots["pc.a"]).toBeNull();
  });

  it("전투 중에는 지역을 옮길 수 없다", () => {
    const s = { ...startGame(world, members, "ash"), inCombat: true };
    const r = moveToLocation(world, s, "ash.loc.market");
    expect(!r.ok && r.error.code).toBe("in_combat");
    expect(availableMoves(world, s).locations).toEqual([]);
  });

  it("입력 상태를 고치지 않는다", () => {
    const s = startGame(world, members, "ash");
    const before = structuredClone(s);
    moveToLocation(world, s, "ash.loc.market");
    expect(s).toEqual(before);
  });
});

describe("지역 안 이동 (지점)", () => {
  it("캐릭터마다 따로 지점을 옮긴다", () => {
    let s = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    s = ok(moveToSpot(world, s, "pc.a", "ash.spot.stall"));
    s = ok(moveToSpot(world, s, "pc.b", "ash.spot.well"));
    expect(s.party.spots).toEqual({ "pc.a": "ash.spot.stall", "pc.b": "ash.spot.well" });
    expect(ok(moveToSpot(world, s, "pc.a", null)).party.spots["pc.a"]).toBeNull();
  });

  it("전투 중에도 지점 이동은 된다", () => {
    const s = { ...ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market")), inCombat: true };
    expect(moveToSpot(world, s, "pc.a", "ash.spot.well").ok).toBe(true);
  });

  it("현재 지역에 없는 지점, 파티에 없는 캐릭터는 거부", () => {
    const s = startGame(world, members, "ash");
    const noSpot = moveToSpot(world, s, "pc.a", "ash.spot.well");
    expect(!noSpot.ok && noSpot.error.code).toBe("unknown_spot");
    const noChar = moveToSpot(world, s, "pc.z", null);
    expect(!noChar.ok && noChar.error.code).toBe("unknown_character");
  });
});

describe("섬 간 이동", () => {
  it("출발 지역(기본 entry_location)에서만 섬 목록이 보인다", () => {
    const docks = startGame(world, members, "ash");
    expect(availableMoves(world, docks).islands).toEqual([{ id: "fog", name: "안개 섬", locked: true, hours: 58 }]);
    const market = ok(moveToLocation(world, docks, "ash.loc.market"));
    expect(availableMoves(world, market).islands).toEqual([]);
    const r = travelToIsland(world, withFlags(market, "ash.flag.bell_rung"), "fog");
    expect(!r.ok && r.error.code).toBe("not_departure_point");
  });

  it("entry_requires_flags 가 꺼져 있으면 못 들어간다", () => {
    const r = travelToIsland(world, startGame(world, members, "ash"), "fog");
    expect(!r.ok && r.error.code).toBe("island_locked");
  });

  it("도착 섬의 entry_location 으로 간다", () => {
    const r = travelToIsland(world, withFlags(startGame(world, members, "ash"), "ash.flag.bell_rung"), "fog");
    expect(r.ok && r.events.map((e) => e.type)).toEqual(["voyage", "island_entered", "location_entered"]);
    const s = ok(r);
    expect(s.party.islandId).toBe("fog");
    expect(s.party.locationId).toBe("fog.loc.pier");
  });

  it("군도 지도 거리만큼 게임 시간이 흐르고 항해 이벤트를 낸다", () => {
    // ash (20,30) → fog (70,60): 거리 √(50² + 30²) ≈ 58.3 → 58시간
    const r = travelToIsland(world, withFlags(startGame(world, members, "ash"), "ash.flag.bell_rung"), "fog");
    expect(r.ok && r.events[0]).toEqual({ type: "voyage", from: "ash", to: "fog", hours: 58 });
    expect(ok(r).time).toBe(58);
  });

  it("항해 시간은 거리에 비례하고 아무리 가까워도 1시간은 걸린다", () => {
    expect(voyageHours({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50);
    expect(voyageHours({ x: 0, y: 0 }, { x: 60, y: 80 })).toBe(100);
    expect(voyageHours({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(1);
  });

  it("departure_locations 를 지정하면 그 지역에서만 떠날 수 있다", () => {
    const w: World = { ...world, islands: { ...world.islands, ash: { ...world.islands.ash, departureLocations: ["ash.loc.market"] } } };
    const docks = withFlags(startGame(w, members, "ash"), "ash.flag.bell_rung");
    expect(travelToIsland(w, docks, "fog").ok).toBe(false);
    expect(travelToIsland(w, ok(moveToLocation(w, docks, "ash.loc.market")), "fog").ok).toBe(true);
  });

  it("없는 섬, 같은 섬, 전투 중은 거부", () => {
    const s = startGame(world, members, "ash");
    expect(travelToIsland(world, s, "nope")).toMatchObject({ ok: false, error: { code: "unknown_island" } });
    expect(travelToIsland(world, s, "ash")).toMatchObject({ ok: false, error: { code: "same_island" } });
    expect(travelToIsland(world, { ...s, inCombat: true }, "fog")).toMatchObject({ ok: false, error: { code: "in_combat" } });
  });
});

describe("섬 지도", () => {
  it("발견한 지역만, 보이는 길만 보여준다", () => {
    const market = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    const view = islandMapView(world, market);
    expect(view.locations.map((l) => l.id)).toEqual(["ash.loc.docks", "ash.loc.market", "ash.loc.lighthouse"]);
    expect(view.locations[1]).toEqual({ id: "ash.loc.market", name: "시장", position: { x: 50, y: 50 }, visited: true, current: true });
    expect(view.locations[2]).toMatchObject({ visited: false, current: false, position: null });
    expect(view.paths).toEqual([
      { from: "ash.loc.docks", to: "ash.loc.market", locked: false },
      { from: "ash.loc.market", to: "ash.loc.docks", locked: false },
      { from: "ash.loc.market", to: "ash.loc.lighthouse", locked: true },
    ]);
  });

  it("숨은 길은 플래그가 켜진 뒤 그 지역에 다시 들어가야 지도에 드러난다", () => {
    const market = ok(moveToLocation(world, startGame(world, members, "ash"), "ash.loc.market"));
    const revealed = withFlags(market, "ash.flag.map_read");
    expect(islandMapView(world, revealed).locations.map((l) => l.id)).not.toContain("ash.loc.cellar");
    const again = ok(moveToLocation(world, ok(moveToLocation(world, revealed, "ash.loc.docks")), "ash.loc.market"));
    expect(islandMapView(world, again).locations.map((l) => l.id)).toContain("ash.loc.cellar");
  });

  it("다른 섬의 지역은 보여주지 않는다", () => {
    const fog = ok(travelToIsland(world, withFlags(startGame(world, members, "ash"), "ash.flag.bell_rung"), "fog"));
    expect(islandMapView(world, fog).locations.map((l) => l.id)).toEqual(["fog.loc.pier"]);
  });
});
