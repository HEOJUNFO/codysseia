import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { World } from "@codysseia/engine";
import { ScriptedProvider } from "../../gm/scripted-provider.ts";
import type { GameChange, LogEntry } from "../../protocol/play.ts";
import type { GMTools, GMTurn } from "../gm-port.ts";
import { GameRoom } from "../room.ts";

// ash: docks ↔ market → gate(ash.flag.key 로 잠김), docks → cellar(ash.flag.map_read 로 숨김)
const world: World = {
  islands: {
    ash: { id: "ash", name: "잿빛 항구", entryLocation: "ash.loc.docks", departureLocations: [], entryRequiresFlags: [], position: { x: 20, y: 30 } },
  },
  locations: {
    "ash.loc.docks": {
      id: "ash.loc.docks", islandId: "ash", name: "부두",
      spots: [{ id: "ash.spot.bollard", name: "계선주" }],
      connections: [
        { to: "ash.loc.market", requiresFlags: [], hiddenUntilFlags: [] },
        { to: "ash.loc.gate", requiresFlags: ["ash.flag.key"], hiddenUntilFlags: [] },
        { to: "ash.loc.cellar", requiresFlags: [], hiddenUntilFlags: ["ash.flag.map_read"] },
      ],
    },
    "ash.loc.market": { id: "ash.loc.market", islandId: "ash", name: "시장", spots: [], connections: [{ to: "ash.loc.docks", requiresFlags: [], hiddenUntilFlags: [] }] },
    "ash.loc.gate": { id: "ash.loc.gate", islandId: "ash", name: "성문", spots: [], connections: [] },
    "ash.loc.cellar": { id: "ash.loc.cellar", islandId: "ash", name: "지하실", spots: [], connections: [] },
  },
};

const player = { id: "m-player", name: "브렌", role: "player" as const };
const ARRIVAL = "도착 서술";

type Script = (turn: GMTurn, tools: GMTools) => string | Promise<string>;

/** 행동 턴은 script 로, 도착 턴은 도구 없이 ARRIVAL 로 서술한다 */
function provider(script: Script) {
  return new ScriptedProvider((turn, _signal, tools) => turn.inputs.every((input) => input.kind === "action") ? script(turn, tools) : ARRIVAL);
}

function nextLog(target: GameRoom, match: (entry: LogEntry) => boolean): Promise<LogEntry> {
  return new Promise((resolve) => {
    const stop = target.subscribe((change: GameChange) => {
      if (change.kind !== "log") return;
      const entry = change.logEntries.find(match);
      if (!entry) return;
      stop();
      resolve(entry);
    });
  });
}

/** 시작 도착 서술까지 끝난 한 사람 방과, 그 뒤 발행된 변경분. 혼자라 행동하자마자 묶음이 닫힌다 (이슈 06) */
async function room(gm: ScriptedProvider) {
  const game = new GameRoom(world, "ash", [player], () => null, new Map(), gm);
  await nextLog(game, (entry) => entry.text === ARRIVAL);
  const changes: GameChange[] = [];
  game.subscribe((change) => changes.push(change));
  return { game, changes };
}

/** 행동 하나를 보내고 그 GM 서술이 발행될 때까지 기다린다 */
async function act(game: GameRoom, text: string, narration = "서술") {
  const narrated = nextLog(game, (entry) => entry.role === "gm" && entry.text === narration);
  const outcome = await game.execute(player.id, `c-${text}`, { kind: "act", text });
  assert.equal(outcome.ok, true);
  return narrated;
}

describe("GameRoom GM 도구", () => {
  it("set_flag 를 부르면 잠긴 길이 풀리고, 이동 목록·지도와 system 요약이 같은 revision 흐름으로 발행된다", async () => {
    const { game, changes } = await room(provider((_turn, tools) => {
      assert.deepEqual(tools.call("set_flag", { flag_id: "ash.flag.key" }), { ok: true, value: { flag_id: "ash.flag.key", value: true, changed: true } });
      return "서술";
    }));
    const before = game.revision;
    assert.equal(game.snapshot().moves.locations.find((location) => location.id === "ash.loc.gate")?.locked, true);

    await act(game, "열쇠로 성문을 연다");

    const routes = changes.find((change) => change.kind === "routes");
    assert.ok(routes?.kind === "routes");
    assert.equal(routes.moves.locations.find((location) => location.id === "ash.loc.gate")?.locked, false);
    assert.deepEqual(routes.islandMap.paths.find((path) => path.to === "ash.loc.gate"), { from: "ash.loc.docks", to: "ash.loc.gate", locked: false });
    assert.deepEqual(routes.logEntries.map((entry) => [entry.role, entry.text]), [["system", "GM이 이야기 진행 상태를 바꿨습니다."]]);
    assert.deepEqual(changes.map((change) => change.revision), Array.from({ length: changes.length }, (_, index) => before + index + 1));
    assert.deepEqual(changes.map((change) => change.kind), ["log", "routes", "log"]);
    assert.equal(game.snapshot().moves.locations.find((location) => location.id === "ash.loc.gate")?.locked, false);
  });

  it("숨은 길의 플래그를 켜면 끝 지역이 지도에 새로 드러난다", async () => {
    const { game, changes } = await room(provider((_turn, tools) => {
      tools.call("set_flag", { flag_id: "ash.flag.map_read" });
      return "서술";
    }));

    await act(game, "지도를 읽는다");

    const routes = changes.find((change) => change.kind === "routes");
    assert.ok(routes?.kind === "routes");
    assert.deepEqual(routes.discoveredAdded, ["ash.loc.cellar"]);
    assert.ok(game.snapshot().islandMap.locations.some((location) => location.id === "ash.loc.cellar"));
  });

  it("이미 켜진 플래그를 다시 켜거나 거부된 도구는 아무것도 발행하지 않는다", async () => {
    const results: unknown[] = [];
    const { game, changes } = await room(provider((_turn, tools) => {
      results.push(tools.call("set_flag", { flag_id: "ash.flag.key" }), tools.call("set_flag", { flag_id: "ash.flag.key" }));
      results.push(tools.call("set_flag", { flag_id: "fog.flag.lamp" }), tools.call("move_party", { location_id: "ash.loc.cellar" }));
      return "서술";
    }));

    await act(game, "두드린다");

    assert.deepEqual(results.map((result) => (result as { ok: boolean; code?: string }).code ?? "ok"), ["ok", "ok", "foreign_flag", "not_connected"]);
    assert.deepEqual(changes.map((change) => change.kind), ["log", "routes", "log"]);
  });

  it("move_party 는 파티를 옮기고, 도착 서술 턴을 따로 만들지 않고 도구 요약만 남긴다", async () => {
    let state: unknown;
    const gm = provider((_turn, tools) => {
      tools.call("move_party", { location_id: "ash.loc.market" });
      state = tools.call("get_state", {});
      return "서술";
    });
    const { game, changes } = await room(gm);
    const turnsBefore = gm.turns.length;

    await act(game, "몰래 시장으로 간다");

    assert.equal(game.snapshot().place?.locationId, "ash.loc.market");
    assert.equal(gm.turns.length, turnsBefore + 1);
    const scene = changes.find((change) => change.kind === "scene");
    assert.ok(scene?.kind === "scene");
    assert.equal(scene.place.locationId, "ash.loc.market");
    assert.deepEqual(scene.logEntries.map((entry) => entry.text), ["GM이 파티를 시장(으)로 옮겼습니다."]);
    assert.equal(scene.gmThinking, undefined);
    assert.equal((state as { ok: true; value: { location: { id: string } } }).value.location.id, "ash.loc.market");
    assert.ok(!game.snapshot().log.some((entry) => entry.text.includes("가짜 GM")));
  });

  it("move_to_spot 은 캐릭터 지점을 바꾸고 system 요약을 남긴다", async () => {
    let characterId = "";
    const { game, changes } = await room(provider((turn, tools) => {
      characterId = turn.party[0].id;
      tools.call("move_to_spot", { character_id: characterId, spot_id: "ash.spot.bollard" });
      return "서술";
    }));

    await act(game, "계선주에 기댄다");

    assert.equal(game.snapshot().party.find((character) => character.id === characterId)?.spotId, "ash.spot.bollard");
    assert.deepEqual(changes.slice(1, 3).map((change) => change.kind), ["spot", "log"]);
    const summary = changes[2];
    assert.ok(summary.kind === "log");
    assert.equal(summary.logEntries[0].text, "GM이 브렌의 위치를 계선주(으)로 옮겼습니다.");
  });

  it("턴이 끝난 뒤의 도구 호출은 turn_closed 로 거부되고 상태가 바뀌지 않는다", async () => {
    let kept: GMTools | null = null;
    const { game, changes } = await room(provider((_turn, tools) => {
      kept = tools;
      return "서술";
    }));
    await act(game, "기다린다");
    const revision = game.revision;

    assert.deepEqual(kept!.call("set_flag", { flag_id: "ash.flag.key" }), { ok: false, code: "turn_closed", message: "GM 턴이 끝나 도구를 쓸 수 없다." });
    assert.equal(game.revision, revision);
    assert.equal(changes.some((change) => change.kind === "routes"), false);
  });

  it("실패한 턴에서도 이미 적용된 도구 호출은 되돌리지 않는다", async () => {
    const { game } = await room(provider((_turn, tools) => {
      tools.call("set_flag", { flag_id: "ash.flag.key" });
      throw new Error("GM 응답 시간 초과 (180초)");
    }));
    const failed = nextLog(game, (entry) => entry.role === "system" && entry.text.includes("시간 초과"));

    await game.execute(player.id, "c1", { kind: "act", text: "문을 민다" });
    await failed;

    assert.equal(game.snapshot().moves.locations.find((location) => location.id === "ash.loc.gate")?.locked, false);
  });

  it("방이 닫히면 열린 턴의 도구도 거부된다", async () => {
    let result: unknown;
    let closeRoom!: () => void;
    const { game } = await room(provider((_turn, tools) => new Promise<string>((resolve) => {
      closeRoom = () => {
        game.close();
        result = tools.call("set_flag", { flag_id: "ash.flag.key" });
        resolve("서술");
      };
    })));
    const started = new Promise<void>((resolve) => game.subscribe((change) => { if (change.kind === "log" && change.gmThinking) resolve(); }));
    await game.execute(player.id, "c1", { kind: "act", text: "문을 민다" });
    await started;

    closeRoom();

    assert.deepEqual(result, { ok: false, code: "turn_closed", message: "GM 턴이 끝나 도구를 쓸 수 없다." });
  });
});
