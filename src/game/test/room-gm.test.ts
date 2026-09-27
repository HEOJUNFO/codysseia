import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { World } from "@codysseia/engine";
import { ScriptedProvider } from "../../gm/scripted-provider.ts";
import type { GameChange, LogEntry } from "../../protocol/play.ts";
import type { GMProvider } from "../gm-port.ts";
import { GameRoom } from "../room.ts";

const world: World = {
  islands: {
    ash: { id: "ash", name: "잿빛 항구", entryLocation: "ash.loc.docks", departureLocations: [], entryRequiresFlags: [], position: { x: 20, y: 30 } },
    ord: { id: "ord", name: "차례 섬", entryLocation: "ord.loc.hall", departureLocations: [], entryRequiresFlags: [], position: { x: 60, y: 30 }, turnMode: "ordered" },
  },
  locations: {
    "ash.loc.docks": {
      id: "ash.loc.docks", islandId: "ash", name: "부두", description: "안개 낀 부두",
      spots: [{ id: "ash.spot.bollard", name: "계선주" }],
      connections: [{ to: "ash.loc.market", requiresFlags: [], hiddenUntilFlags: [] }],
    },
    "ash.loc.market": { id: "ash.loc.market", islandId: "ash", name: "시장", spots: [], connections: [] },
    "ord.loc.hall": { id: "ord.loc.hall", islandId: "ord", name: "회당", spots: [], connections: [] },
  },
};

const host = { id: "m-host", name: "아리아", role: "host" as const };
const player = { id: "m-player", name: "브렌", role: "player" as const };

function room(gm: GMProvider, startIslandId = "ash") {
  return new GameRoom(world, startIslandId, [host, player], () => null, new Map(), gm);
}

/** 조건에 맞는 로그가 발행되면 끝나는 약속. 타이머 없이 변경분 발행 이벤트로만 진행한다. */
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

function deferred() {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("GameRoom GM 턴", () => {
  it("행동을 보내면 캐릭터가 붙은 player 로그 뒤에 GM 서술이 발행된다", async () => {
    const gm = new ScriptedProvider((turn) => `${turn.inputs[0].characterName}의 발소리가 부두에 먹먹하게 울린다.`);
    const game = room(gm);
    const narrated = nextLog(game, (entry) => entry.role === "gm");

    const outcome = await game.execute(player.id, "c1", { kind: "act", text: "계선주를 살핀다" });

    assert.equal(outcome.ok, true);
    assert.ok(outcome.ok && outcome.event?.kind === "log");
    const [playerEntry] = outcome.ok && outcome.event?.kind === "log" ? outcome.event.logEntries : [];
    assert.equal(playerEntry.role, "player");
    assert.equal(playerEntry.characterId, game.characterFor(player.id));
    assert.equal((await narrated).text, "브렌의 발소리가 부두에 먹먹하게 울린다.");
    assert.ok(!game.snapshot().log.some((entry) => entry.text.includes("가짜 GM") && entry.role === "gm" && entry.text.includes("계선주")));
  });

  it("GM 턴 입력에 현재 상태와 이번 행동이 들어가고, 이번 행동은 최근 로그에서 빠진다", async () => {
    const gm = new ScriptedProvider(() => "서술");
    const game = room(gm);
    const narrated = nextLog(game, (entry) => entry.role === "gm" && entry.text === "서술");

    await game.execute(player.id, "c1", { kind: "act", text: "시장 쪽을 본다" });
    await narrated;

    const [turn] = gm.turns;
    assert.deepEqual(turn.inputs, [{ kind: "action", characterId: game.characterFor(player.id), characterName: "브렌", text: "시장 쪽을 본다" }]);
    assert.equal(turn.island.id, "ash");
    assert.equal(turn.location.name, "부두");
    assert.deepEqual(turn.party.map((character) => character.name), ["아리아", "브렌"]);
    assert.deepEqual(turn.moves.locations.map((location) => location.id), ["ash.loc.market"]);
    assert.ok(!turn.recentLog.some((entry) => entry.text.includes("시장 쪽을 본다")));
  });

  it("GM 턴은 한 번에 하나만 돌고, 도중에 들어온 행동은 끝난 뒤에 처리된다", async () => {
    const first = deferred();
    const gm = new ScriptedProvider((turn) => turn.inputs[0].text === "첫째" ? first.promise : "둘째 서술");
    const game = room(gm);
    const secondDone = nextLog(game, (entry) => entry.text === "둘째 서술");

    await game.execute(host.id, "c1", { kind: "act", text: "첫째" });
    await game.execute(player.id, "c2", { kind: "act", text: "둘째" });
    assert.equal(gm.turns.length, 1);

    first.resolve("첫째 서술");
    await secondDone;
    assert.deepEqual(gm.turns.map((turn) => turn.inputs[0].text), ["첫째", "둘째"]);
    const gmTexts = game.snapshot().log.filter((entry) => entry.role === "gm").map((entry) => entry.text);
    assert.deepEqual(gmTexts.slice(-2), ["첫째 서술", "둘째 서술"]);
  });

  it("GM 턴이 도는 동안에도 이동 명령은 기다리지 않는다", async () => {
    const pending = deferred();
    const game = room(new ScriptedProvider(() => pending.promise));

    await game.execute(player.id, "c1", { kind: "act", text: "기다린다" });
    const moved = await game.execute(player.id, "c2", { kind: "move", request: { kind: "spot", characterIds: [game.characterFor(player.id)!], spotId: "ash.spot.bollard" } });

    assert.equal(moved.ok, true);
    pending.resolve("끝");
  });

  it("GM 턴이 실패하면 system 로그를 남기고 다음 행동은 정상 처리된다", async () => {
    const gm = new ScriptedProvider((turn) => {
      if (turn.inputs[0].text === "실패") throw new Error("GM 응답 시간 초과 (180초)");
      return "정상 서술";
    });
    const game = room(gm);
    const failed = nextLog(game, (entry) => entry.role === "system" && entry.text.includes("시간 초과"));
    const recovered = nextLog(game, (entry) => entry.text === "정상 서술");

    await game.execute(player.id, "c1", { kind: "act", text: "실패" });
    await game.execute(player.id, "c2", { kind: "act", text: "다시" });

    assert.equal((await failed).text, "GM 서술을 받지 못했습니다: GM 응답 시간 초과 (180초)");
    assert.equal((await recovered).role, "gm");
  });

  it("방이 닫히면 진행 중인 GM 턴을 중단하고 서술을 발행하지 않는다", async () => {
    let aborted!: () => void;
    const abortSeen = new Promise<void>((resolve) => { aborted = resolve; });
    const game = room(new ScriptedProvider((_turn, signal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted();
        reject(new Error("방이 닫혀 GM 턴을 멈췄습니다."));
      });
    })));
    const published: GameChange[] = [];

    await game.execute(player.id, "c1", { kind: "act", text: "문을 두드린다" });
    game.subscribe((change) => published.push(change));
    game.close();
    await abortSeen;
    await Promise.resolve();

    assert.deepEqual(published, []);
  });

  it("변경분은 구독자에게 revision 순서대로 한 번씩 발행된다", async () => {
    const game = room(new ScriptedProvider(() => "서술"));
    const revisions: number[] = [];
    game.subscribe((change) => revisions.push(change.revision));
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    await game.execute(player.id, "c1", { kind: "act", text: "본다" });
    await narrated;

    assert.deepEqual(revisions, [1, 2]);
    assert.equal(game.revision, 2);
  });

  it("순서 턴 섬에서는 자기 차례가 아니면 행동이 GM에 가지 않는다", async () => {
    const gm = new ScriptedProvider(() => "서술");
    const game = room(gm, "ord");

    const outcome = await game.execute(player.id, "c1", { kind: "act", text: "끼어든다" });

    assert.deepEqual(outcome, { ok: false, error: "자신의 턴에만 행동할 수 있습니다." });
    assert.equal(gm.turns.length, 0);
  });
});
