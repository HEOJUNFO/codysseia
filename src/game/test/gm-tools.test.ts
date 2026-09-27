import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startGame, type EngineState, type World } from "@codysseia/engine";
import type { GMStateView } from "../gm-port.ts";
import { GM_TOOL_DEFINITIONS, runGMTool } from "../gm-tools.ts";

// ash: docks(출발) → market → gate(ash.flag.key 로 잠김) , market → cellar(ash.flag.map_read 로 숨김)
const world: World = {
  islands: {
    ash: { id: "ash", name: "잿빛 항구", entryLocation: "ash.loc.docks", departureLocations: [], entryRequiresFlags: [], position: { x: 20, y: 30 }, publicFlags: ["ash.flag.bell_rung"] },
    fog: { id: "fog", name: "안개 섬", entryLocation: "fog.loc.pier", departureLocations: [], entryRequiresFlags: ["ash.flag.bell_rung"], position: { x: 70, y: 60 } },
  },
  locations: {
    "ash.loc.docks": {
      id: "ash.loc.docks", islandId: "ash", name: "부두", spots: [{ id: "ash.spot.bollard", name: "계선주" }],
      connections: [{ to: "ash.loc.market", requiresFlags: [], hiddenUntilFlags: [] }],
    },
    "ash.loc.market": {
      id: "ash.loc.market", islandId: "ash", name: "시장", spots: [],
      connections: [
        { to: "ash.loc.gate", requiresFlags: ["ash.flag.key"], hiddenUntilFlags: [] },
        { to: "ash.loc.cellar", requiresFlags: [], hiddenUntilFlags: ["ash.flag.map_read"] },
      ],
    },
    "ash.loc.gate": { id: "ash.loc.gate", islandId: "ash", name: "성문", spots: [], connections: [] },
    "ash.loc.cellar": { id: "ash.loc.cellar", islandId: "ash", name: "지하실", spots: [], connections: [] },
    "fog.loc.pier": { id: "fog.loc.pier", islandId: "fog", name: "안개 부두", spots: [], connections: [] },
  },
};

const view = { island: { id: "ash", name: "잿빛 항구" } } as GMStateView;

function run(engine: EngineState, name: string, args: unknown) {
  return runGMTool({ world, engine, state: () => view }, name, args);
}

const start = () => startGame(world, ["pc.a", "pc.b"], "ash");

describe("GM 도구 핸들러", () => {
  it("도구 목록은 이슈 02의 여섯 개다", () => {
    assert.deepEqual(GM_TOOL_DEFINITIONS.map((tool) => tool.name), ["get_state", "move_party", "travel", "move_to_spot", "set_flag", "get_flag"]);
    for (const tool of GM_TOOL_DEFINITIONS) assert.equal(tool.inputSchema.type, "object");
  });

  it("get_state 는 방이 만든 현재 상태를 그대로 돌려주고 효과가 없다", () => {
    assert.deepEqual(run(start(), "get_state", {}), { result: { ok: true, value: view }, effect: null });
  });

  it("move_party 는 엔진 이동을 쓰고, 성공하면 이동 효과를 돌려준다", () => {
    const { result, effect } = run(start(), "move_party", { location_id: "ash.loc.market" });
    assert.deepEqual(result, { ok: true, value: { location_id: "ash.loc.market", location_name: "시장" } });
    assert.equal(effect?.kind, "move");
    assert.equal(effect?.kind === "move" && effect.result.state.party.locationId, "ash.loc.market");
  });

  it("이동 실패는 엔진 실패 코드로 돌려주고 효과가 없다", () => {
    assert.deepEqual(run(start(), "move_party", { location_id: "ash.loc.gate" }).result, { ok: false, code: "not_connected", message: "부두에서 성문(으)로 가는 길이 없다." });
    const atMarket = run(start(), "move_party", { location_id: "ash.loc.market" }).effect;
    assert.ok(atMarket?.kind === "move");
    const locked = run(atMarket.result.state, "move_party", { location_id: "ash.loc.gate" });
    assert.equal(locked.result.ok === false && locked.result.code, "locked");
    assert.equal(locked.effect, null);
    const travel = run(start(), "travel", { island_id: "fog" });
    assert.equal(travel.result.ok === false && travel.result.code, "island_locked");
  });

  it("move_to_spot 는 파티 캐릭터와 현재 지역의 지점만 받는다", () => {
    const moved = run(start(), "move_to_spot", { character_id: "pc.a", spot_id: "ash.spot.bollard" });
    assert.deepEqual(moved.result, { ok: true, value: { character_id: "pc.a", spot_id: "ash.spot.bollard" } });
    const stranger = run(start(), "move_to_spot", { character_id: "pc.x", spot_id: null });
    assert.equal(stranger.result.ok === false && stranger.result.code, "unknown_character");
    assert.equal(stranger.effect, null);
    const unknownSpot = run(start(), "move_to_spot", { character_id: "pc.a", spot_id: "ash.spot.nowhere" });
    assert.equal(unknownSpot.result.ok === false && unknownSpot.result.code, "unknown_spot");
    const left = run(start(), "move_to_spot", { character_id: "pc.a", spot_id: null });
    assert.equal(left.result.ok, true);
  });

  it("set_flag 는 현재 섬 플래그를 켜고, 이미 켜져 있으면 효과 없이 changed=false", () => {
    const on = run(start(), "set_flag", { flag_id: "ash.flag.key" });
    assert.deepEqual(on.result, { ok: true, value: { flag_id: "ash.flag.key", value: true, changed: true } });
    assert.ok(on.effect?.kind === "flag");
    const again = run(on.effect.result.state, "set_flag", { flag_id: "ash.flag.key", value: true });
    assert.deepEqual(again, { result: { ok: true, value: { flag_id: "ash.flag.key", value: true, changed: false } }, effect: null });
    const off = run(on.effect.result.state, "set_flag", { flag_id: "ash.flag.key", value: false });
    assert.ok(off.effect?.kind === "flag");
    assert.deepEqual(off.effect.result.state.flags, []);
  });

  it("set_flag 는 ID 접두사 규칙(대전제 8.2)을 검사한다", () => {
    const foreign = run(start(), "set_flag", { flag_id: "fog.flag.lamp" });
    assert.equal(foreign.result.ok === false && foreign.result.code, "foreign_flag");
    const malformed = run(start(), "set_flag", { flag_id: "key" });
    assert.equal(malformed.result.ok === false && malformed.result.code, "invalid_flag");
    assert.equal(foreign.effect, null);
  });

  it("get_flag 는 현재 섬과 공개된 다른 섬 플래그만 읽는다", () => {
    assert.deepEqual(run(start(), "get_flag", { flag_id: "ash.flag.key" }).result, { ok: true, value: { flag_id: "ash.flag.key", value: false } });
    const fog = startGame(world, ["pc.a"], "fog");
    assert.equal(run(fog, "get_flag", { flag_id: "ash.flag.bell_rung" }).result.ok, true);
    const hidden = run(fog, "get_flag", { flag_id: "ash.flag.key" });
    assert.equal(hidden.result.ok === false && hidden.result.code, "private_flag");
  });

  it("인자가 틀리거나 없는 도구면 거부한다", () => {
    for (const [name, args] of [["move_party", {}], ["move_party", { location_id: 3 }], ["set_flag", { flag_id: "ash.flag.key", value: "yes" }], ["move_to_spot", { character_id: "pc.a" }], ["get_flag", []]] as const) {
      const outcome = run(start(), name, args);
      assert.equal(outcome.result.ok === false && outcome.result.code, "invalid_arguments", `${name} ${JSON.stringify(args)}`);
    }
    const unknown = run(start(), "roll_check", {}).result;
    assert.equal(unknown.ok === false && unknown.code, "unknown_tool");
  });
});
