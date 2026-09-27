import { expect } from "./expect.ts";
import { describe, it } from "node:test";
import { availableMoves, moveToLocation, readFlag, setFlag, startGame } from "../src/index.ts";
import type { EngineState, World } from "../src/index.ts";

// ash: docks → market → cellar(ash.flag.map_read 로 숨김), market → lighthouse(ash.flag.key 로 잠김)
// fog 는 ash 가 공개한 ash.flag.bell_rung 만 읽을 수 있다
const world: World = {
  islands: {
    ash: { id: "ash", name: "잿빛 항구", entryLocation: "ash.loc.docks", departureLocations: [], entryRequiresFlags: [], position: { x: 20, y: 30 }, publicFlags: ["ash.flag.bell_rung"] },
    fog: { id: "fog", name: "안개 섬", entryLocation: "fog.loc.pier", departureLocations: [], entryRequiresFlags: [], position: { x: 70, y: 60 } },
  },
  locations: {
    "ash.loc.docks": { id: "ash.loc.docks", islandId: "ash", name: "부두", spots: [], connections: [{ to: "ash.loc.market", requiresFlags: [], hiddenUntilFlags: [] }] },
    "ash.loc.market": {
      id: "ash.loc.market", islandId: "ash", name: "시장", spots: [],
      connections: [
        { to: "ash.loc.lighthouse", requiresFlags: ["ash.flag.key"], hiddenUntilFlags: [] },
        { to: "ash.loc.cellar", requiresFlags: [], hiddenUntilFlags: ["ash.flag.map_read"] },
      ],
    },
    "ash.loc.lighthouse": { id: "ash.loc.lighthouse", islandId: "ash", name: "등대", spots: [], connections: [] },
    "ash.loc.cellar": { id: "ash.loc.cellar", islandId: "ash", name: "지하실", spots: [], connections: [] },
    "fog.loc.pier": { id: "fog.loc.pier", islandId: "fog", name: "안개 부두", spots: [], connections: [] },
  },
};

function atMarket(): EngineState {
  const moved = moveToLocation(world, startGame(world, ["pc.a"], "ash"), "ash.loc.market");
  if (!moved.ok) throw new Error(moved.error.code);
  return moved.state;
}

function set(state: EngineState, flag: string, on = true): EngineState & { discoveredAdded: string[] } {
  const result = setFlag(world, state, flag, on);
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.state, discoveredAdded: result.discoveredAdded };
}

describe("setFlag", () => {
  it("잠긴 길의 플래그를 켜면 이동 목록에서 잠김이 풀린다", () => {
    const before = atMarket();
    expect(availableMoves(world, before).locations.find((l) => l.id === "ash.loc.lighthouse")?.locked).toBe(true);
    const after = set(before, "ash.flag.key");
    expect(after.flags).toEqual(["ash.flag.key"]);
    expect(availableMoves(world, after).locations.find((l) => l.id === "ash.loc.lighthouse")?.locked).toBe(false);
    expect(before.flags).toEqual([]);
  });

  it("숨은 길의 플래그를 켜면 방문한 지역에서 보이는 끝 지역이 지도에 드러난다", () => {
    const before = atMarket();
    expect(before.discovered).not.toContain("ash.loc.cellar");
    const after = set(before, "ash.flag.map_read");
    expect(after.discoveredAdded).toEqual(["ash.loc.cellar"]);
    expect(after.discovered).toContain("ash.loc.cellar");
    expect(availableMoves(world, after).locations.map((l) => l.id)).toContain("ash.loc.cellar");
  });

  it("이미 켜진 플래그를 다시 켜면 상태가 그대로이고 changed 가 false", () => {
    const on = set(atMarket(), "ash.flag.key");
    const again = setFlag(world, on, "ash.flag.key", true);
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(again.ok && again.state === on).toBe(true);
  });

  it("끄면 목록에서 빠지고, 드러난 지역은 그대로 둔다", () => {
    const on = set(atMarket(), "ash.flag.map_read");
    const off = set(on, "ash.flag.map_read", false);
    expect(off.flags).toEqual([]);
    expect(off.discovered).toContain("ash.loc.cellar");
    expect(availableMoves(world, off).locations.map((l) => l.id)).not.toContain("ash.loc.cellar");
  });

  it("현재 섬이 아닌 섬의 플래그와 모양이 틀린 ID는 거부한다", () => {
    const state = atMarket();
    expect(setFlag(world, state, "fog.flag.lamp", true)).toMatchObject({ ok: false, error: { code: "foreign_flag" } });
    expect(setFlag(world, state, "ash.bell_rung", true)).toMatchObject({ ok: false, error: { code: "invalid_flag" } });
    expect(setFlag(world, state, "ash.flag.Bell", true)).toMatchObject({ ok: false, error: { code: "invalid_flag" } });
  });
});

describe("readFlag", () => {
  it("현재 섬 플래그는 읽는다", () => {
    expect(readFlag(world, set(atMarket(), "ash.flag.key"), "ash.flag.key")).toEqual({ ok: true, on: true });
    expect(readFlag(world, atMarket(), "ash.flag.map_read")).toEqual({ ok: true, on: false });
  });

  it("다른 섬 플래그는 공개된 것만 읽는다", () => {
    const fog = startGame(world, ["pc.a"], "fog");
    expect(readFlag(world, fog, "ash.flag.bell_rung")).toEqual({ ok: true, on: false });
    expect(readFlag(world, fog, "ash.flag.key")).toMatchObject({ ok: false, error: { code: "private_flag" } });
  });
});
