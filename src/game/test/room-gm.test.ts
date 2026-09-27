import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { World } from "@codysseia/engine";
import { ScriptedProvider } from "../../gm/scripted-provider.ts";
import type { GameChange, LogEntry } from "../../protocol/play.ts";
import type { GMInput, GMTurn } from "../gm-port.ts";
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
    "ash.loc.market": { id: "ash.loc.market", islandId: "ash", name: "시장", spots: [], connections: [{ to: "ash.loc.docks", requiresFlags: [], hiddenUntilFlags: [] }] },
    "ord.loc.hall": { id: "ord.loc.hall", islandId: "ord", name: "회당", spots: [], connections: [] },
  },
};

const host = { id: "m-host", name: "아리아", role: "host" as const };
const player = { id: "m-player", name: "브렌", role: "player" as const };

/** 이동(항해·도착) 턴의 서술. 행동 턴과 구분하려고 고정한다 */
const ARRIVAL = "도착 서술";

/** 행동 턴은 script 로, 이동 턴은 ARRIVAL 로 서술하는 공급자 */
function provider(script: (turn: GMTurn, signal: AbortSignal) => string | Promise<string> = () => "서술") {
  return new ScriptedProvider((turn, signal) => turn.inputs.every((input) => input.kind === "action") ? script(turn, signal) : ARRIVAL);
}

type Member = typeof host | typeof player;

function create(gm: ScriptedProvider, startIslandId = "ash", members: Member[] = [host, player]) {
  return new GameRoom(world, startIslandId, members, () => null, new Map(), gm);
}

/** 시작 도착 서술까지 끝난 방. 혼자면 행동하자마자 묶음이 닫힌다 */
async function room(gm: ScriptedProvider, startIslandId = "ash", members: Member[] = [host, player]) {
  const game = create(gm, startIslandId, members);
  await nextLog(game, (entry) => entry.text === ARRIVAL);
  return game;
}

/** 행동 턴의 첫 행동 */
function firstAction(turn: GMTurn): Extract<GMInput, { kind: "action" }> {
  const [input] = turn.inputs;
  assert.equal(input.kind, "action");
  return input as Extract<GMInput, { kind: "action" }>;
}

function actionTurns(gm: ScriptedProvider): GMTurn[] {
  return gm.turns.filter((turn) => turn.inputs.every((input) => input.kind === "action"));
}

function moveTo(locationId: string) {
  return { kind: "move" as const, request: { kind: "location" as const, locationId } };
}

function sailTo(islandId: string) {
  return { kind: "move" as const, request: { kind: "island" as const, islandId } };
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
    const gm = provider((turn) => `${firstAction(turn).characterName}의 발소리가 부두에 먹먹하게 울린다.`);
    const game = await room(gm, "ash", [player]);
    const narrated = nextLog(game, (entry) => entry.role === "gm");

    const outcome = await game.execute(player.id, "c1", { kind: "act", text: "계선주를 살핀다" });

    assert.equal(outcome.ok, true);
    assert.ok(outcome.ok && outcome.event?.kind === "log");
    const [playerEntry] = outcome.ok && outcome.event?.kind === "log" ? outcome.event.logEntries : [];
    assert.equal(playerEntry.role, "player");
    assert.equal(playerEntry.characterId, game.characterFor(player.id));
    assert.equal((await narrated).text, "브렌의 발소리가 부두에 먹먹하게 울린다.");
  });

  it("GM 턴 입력에 현재 상태와 이번 행동이 들어가고, 이번 행동은 최근 로그에서 빠진다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.role === "gm" && entry.text === "서술");

    await game.execute(host.id, "c0", { kind: "pass" });
    await game.execute(player.id, "c1", { kind: "act", text: "시장 쪽을 본다" });
    await narrated;

    const [turn] = actionTurns(gm);
    assert.deepEqual(turn.inputs, [{ kind: "action", characterId: game.characterFor(player.id), characterName: "브렌", text: "시장 쪽을 본다" }]);
    assert.equal(turn.island.id, "ash");
    assert.equal(turn.location.name, "부두");
    assert.deepEqual(turn.party.map((character) => character.name), ["아리아", "브렌"]);
    assert.deepEqual(turn.moves.locations.map((location) => location.id), ["ash.loc.market"]);
    assert.ok(!turn.recentLog.some((entry) => entry.text.includes("시장 쪽을 본다")));
  });

  it("GM 턴은 한 번에 하나만 돌고, 도중에 들어온 행동은 끝난 뒤에 처리된다", async () => {
    const first = deferred();
    const gm = provider((turn) => firstAction(turn).text === "첫째" ? first.promise : "둘째 서술");
    const game = await room(gm, "ash", [host]);
    const secondDone = nextLog(game, (entry) => entry.text === "둘째 서술");

    await game.execute(host.id, "c1", { kind: "act", text: "첫째" });
    await game.execute(host.id, "c2", { kind: "act", text: "둘째" });
    assert.equal(actionTurns(gm).length, 1);

    first.resolve("첫째 서술");
    await secondDone;
    assert.deepEqual(actionTurns(gm).map((turn) => firstAction(turn).text), ["첫째", "둘째"]);
    const gmTexts = game.snapshot().log.filter((entry) => entry.role === "gm").map((entry) => entry.text);
    assert.deepEqual(gmTexts.slice(-2), ["첫째 서술", "둘째 서술"]);
  });

  it("GM 턴이 도는 동안에도 이동 명령은 기다리지 않는다", async () => {
    const pending = deferred();
    const game = await room(provider(() => pending.promise), "ash", [player]);

    await game.execute(player.id, "c1", { kind: "act", text: "기다린다" });
    const moved = await game.execute(player.id, "c2", { kind: "move", request: { kind: "spot", characterIds: [game.characterFor(player.id)!], spotId: "ash.spot.bollard" } });

    assert.equal(moved.ok, true);
    pending.resolve("끝");
  });

  it("GM 턴이 실패하면 system 로그를 남기고 다음 행동은 정상 처리된다", async () => {
    const gm = provider((turn) => {
      if (firstAction(turn).text === "실패") throw new Error("GM 응답 시간 초과 (180초)");
      return "정상 서술";
    });
    const game = await room(gm, "ash", [player]);
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
    const game = await room(provider((_turn, signal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted();
        reject(new Error("방이 닫혀 GM 턴을 멈췄습니다."));
      });
    })), "ash", [player]);
    const published: GameChange[] = [];

    await game.execute(player.id, "c1", { kind: "act", text: "문을 두드린다" });
    game.subscribe((change) => published.push(change));
    game.close();
    await abortSeen;
    await Promise.resolve();

    assert.deepEqual(published, []);
  });

  it("변경분은 구독자에게 revision 순서대로 한 번씩 발행된다", async () => {
    const game = await room(provider(), "ash", [player]);
    const revisions: number[] = [];
    game.subscribe((change) => revisions.push(change.revision));
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    await game.execute(player.id, "c1", { kind: "act", text: "본다" });
    await narrated;

    // revision 1 은 시작 도착 서술이다
    assert.deepEqual(revisions, [2, 3]);
    assert.equal(game.revision, 3);
  });

  it("GM 턴 시작과 종료가 행동·서술 변경분과 함께 발행되고, 새 스냅숏에도 들어간다", async () => {
    const turn = deferred();
    const game = await room(provider(() => turn.promise), "ash", [player]);
    const narrated = nextLog(game, (entry) => entry.text === "끝");
    assert.equal(game.snapshot().gmThinking, false);

    const outcome = await game.execute(player.id, "c1", { kind: "act", text: "기다린다" });
    assert.ok(outcome.ok && outcome.event?.kind === "log");
    assert.equal(outcome.ok && outcome.event?.kind === "log" && outcome.event.gmThinking, true);
    assert.equal(game.snapshot().gmThinking, true);

    const ended: GameChange[] = [];
    game.subscribe((change) => ended.push(change));
    turn.resolve("끝");
    await narrated;

    assert.equal(ended.length, 1);
    assert.equal(ended[0].kind === "log" && ended[0].gmThinking, false);
    assert.equal(game.snapshot().gmThinking, false);
  });

  it("GM 턴 도중 들어온 행동은 턴 상태를 바꾸지 않고, 이어지는 턴이 없을 때 한 번만 종료된다", async () => {
    const first = deferred();
    const game = await room(provider((turn) => firstAction(turn).text === "첫째" ? first.promise : "둘째 서술"), "ash", [host]);
    const thinking: (boolean | undefined)[] = [];
    game.subscribe((change) => { if (change.kind === "log") thinking.push(change.gmThinking); });
    const secondDone = nextLog(game, (entry) => entry.text === "둘째 서술");

    await game.execute(host.id, "c1", { kind: "act", text: "첫째" });
    await game.execute(host.id, "c2", { kind: "act", text: "둘째" });
    first.resolve("첫째 서술");
    await secondDone;

    // 첫째 행동(시작) · 둘째 행동 · 첫째 서술 · 둘째 서술(종료)
    assert.deepEqual(thinking, [true, undefined, undefined, false]);
    assert.equal(game.snapshot().gmThinking, false);
  });

  it("순서 턴 섬에서는 자기 차례가 아니면 행동이 GM에 가지 않는다", async () => {
    const gm = provider();
    const game = await room(gm, "ord");

    const outcome = await game.execute(player.id, "c1", { kind: "act", text: "끼어든다" });

    assert.deepEqual(outcome, { ok: false, error: "자신의 턴에만 행동할 수 있습니다." });
    assert.equal(actionTurns(gm).length, 0);
  });
});

describe("GameRoom 이동 도착·항해 서술", () => {
  it("방 시작 때의 첫 도착이 GM 턴으로 서술된다", async () => {
    const arrived = deferred();
    const gm = new ScriptedProvider(() => arrived.promise);
    const game = create(gm);

    assert.deepEqual(gm.turns.map((turn) => turn.inputs), [[{ kind: "arrival", locationId: "ash.loc.docks", locationName: "부두", firstVisit: true }]]);
    assert.equal(game.snapshot().gmThinking, true);
    assert.ok(!game.snapshot().log.some((entry) => entry.role === "gm"));

    const narrated = nextLog(game, (entry) => entry.role === "gm");
    arrived.resolve("안개가 부두의 널빤지를 적신다.");
    assert.equal((await narrated).text, "안개가 부두의 널빤지를 적신다.");
    assert.equal(game.snapshot().gmThinking, false);
  });

  it("이동은 GM을 기다리지 않고 바로 발행되고, 도착 서술이 뒤에 붙는다", async () => {
    const pending = deferred();
    const gm = provider(() => pending.promise);
    const game = await room(gm, "ash", [host]);
    await game.execute(host.id, "c1", { kind: "act", text: "기다린다" });

    const moved = await game.execute(host.id, "c2", moveTo("ash.loc.market"));

    assert.ok(moved.ok && moved.event?.kind === "scene");
    const scene = moved.ok && moved.event?.kind === "scene" ? moved.event : null;
    assert.equal(scene?.place.locationId, "ash.loc.market");
    assert.deepEqual(scene?.logEntries, []);
    assert.equal(scene?.gmThinking, undefined);
    assert.equal(game.snapshot().place?.locationId, "ash.loc.market");

    const arrival = nextLog(game, (entry) => entry.text === ARRIVAL);
    pending.resolve("기다린 서술");
    await arrival;
    const last = gm.turns.at(-1)!;
    assert.deepEqual(last.inputs, [{ kind: "arrival", locationId: "ash.loc.market", locationName: "시장", firstVisit: true }]);
    assert.equal(last.location.id, "ash.loc.market");
  });

  it("GM이 쉬고 있을 때 이동하면 그 변경분이 GM 턴 시작을 싣고, 재방문은 재방문으로 넘어간다", async () => {
    const gm = provider();
    const game = await room(gm);

    const toMarket = nextLog(game, (entry) => entry.text === ARRIVAL);
    const moved = await game.execute(host.id, "c1", moveTo("ash.loc.market"));
    assert.equal(moved.ok && moved.event?.kind === "scene" && moved.event.gmThinking, true);
    await toMarket;
    const back = nextLog(game, (entry) => entry.text === ARRIVAL);
    await game.execute(host.id, "c2", moveTo("ash.loc.docks"));
    await back;

    assert.deepEqual(gm.turns.slice(1).map((turn) => turn.inputs), [
      [{ kind: "arrival", locationId: "ash.loc.market", locationName: "시장", firstVisit: true }],
      [{ kind: "arrival", locationId: "ash.loc.docks", locationName: "부두", firstVisit: false }],
    ]);
    assert.equal(game.snapshot().gmThinking, false);
  });

  it("섬 간 이동이면 항해가 걸린 시간과 함께 도착 앞에 들어간다", async () => {
    const gm = provider();
    const game = await room(gm);
    const arrival = nextLog(game, (entry) => entry.text === ARRIVAL);

    const moved = await game.execute(host.id, "c1", sailTo("ord"));
    await arrival;

    const scene = moved.ok && moved.event?.kind === "scene" ? moved.event : null;
    assert.deepEqual(scene?.logEntries.map((entry) => [entry.role, entry.text]), [["system", "섬 이동 → 차례 섬"]]);
    assert.deepEqual(gm.turns.at(-1)!.inputs, [
      { kind: "voyage", from: "잿빛 항구", to: "차례 섬", hours: scene?.voyage?.hours },
      { kind: "arrival", locationId: "ord.loc.hall", locationName: "회당", firstVisit: true },
    ]);
  });

  it("GM 턴을 기다리는 동안 다시 이동하면 떠난 곳의 도착은 버리고 항해는 이어 붙인다", async () => {
    const pending = deferred();
    const gm = provider(() => pending.promise);
    const game = await room(gm, "ash", [host]);
    await game.execute(host.id, "c1", { kind: "act", text: "기다린다" });
    await game.execute(host.id, "c2", sailTo("ord"));
    await game.execute(host.id, "c3", sailTo("ash"));

    const arrival = nextLog(game, (entry) => entry.text === ARRIVAL);
    pending.resolve("기다린 서술");
    await arrival;

    assert.equal(gm.turns.length, 3);
    assert.deepEqual(gm.turns[2].inputs.map((input) => input.kind === "voyage" ? `${input.from}→${input.to}` : input.kind === "arrival" ? `${input.locationName}:${input.firstVisit}` : input.kind), [
      "잿빛 항구→차례 섬",
      "차례 섬→잿빛 항구",
      "부두:false",
    ]);
  });

  it("/move 개발 명령은 GM을 거치지 않는다", async () => {
    const gm = provider();
    const game = await room(gm);

    const moved = await game.execute(host.id, "c1", { kind: "act", text: "/move ord" });

    assert.ok(moved.ok && moved.event?.kind === "scene" && moved.event.gmThinking === undefined);
    assert.equal(game.snapshot().place?.islandId, "ord");
    assert.equal(gm.turns.length, 1);
    assert.equal(game.snapshot().gmThinking, false);
  });
});

describe("GameRoom 행동 묶기", () => {
  function inputTexts(turn: GMTurn): string[] {
    return turn.inputs.map((input) => input.kind === "action" ? `${input.characterName}:${input.text}` : input.kind);
  }

  it("접속 중인 전원이 행동하면 묶음이 닫혀 행동 전부가 GM 턴 한 번으로 간다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    const first = await game.execute(host.id, "c1", { kind: "act", text: "밧줄을 푼다" });
    assert.equal(actionTurns(gm).length, 0);
    assert.deepEqual(first.ok && first.event?.batch, { signals: [{ characterId: game.characterFor(host.id), signal: "ready" }], waiting: [game.characterFor(player.id)], closing: false });
    assert.deepEqual(game.snapshot().batch, first.ok ? first.event?.batch : null);

    const second = await game.execute(player.id, "c2", { kind: "act", text: "망을 본다" });
    assert.equal(second.ok && second.event?.batch, null);
    assert.equal(second.ok && second.event?.gmThinking, true);
    await narrated;

    assert.deepEqual(actionTurns(gm).map(inputTexts), [["아리아:밧줄을 푼다", "브렌:망을 본다"]]);
    assert.equal(game.snapshot().batch, null);
  });

  it("묶음이 열려 있는 동안 행동을 더하면 모두 같은 턴으로 가고, pass 한 참가자는 행동 없이 넘어간다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    await game.execute(host.id, "c1", { kind: "act", text: "문을 연다" });
    await game.execute(host.id, "c2", { kind: "act", text: "아니, 문을 두드린다" });
    const passed = await game.execute(player.id, "c3", { kind: "pass" });
    await narrated;

    assert.equal(passed.ok && passed.event?.kind, "flow");
    assert.deepEqual(actionTurns(gm).map(inputTexts), [["아리아:문을 연다", "아리아:아니, 문을 두드린다"]]);
  });

  it("먼저 pass 할 수 있고, 행동한 뒤에는 pass 할 수 없다. 전원이 pass 하면 GM 턴 없이 닫힌다", async () => {
    const gm = provider();
    const game = await room(gm);

    await game.execute(host.id, "c1", { kind: "act", text: "본다" });
    assert.deepEqual(await game.execute(host.id, "c2", { kind: "pass" }), { ok: false, error: "이번 묶음에 이미 행동을 보냈습니다." });

    const other = await room(gm);
    await other.execute(player.id, "p1", { kind: "pass" });
    const closed = await other.execute(host.id, "p2", { kind: "pass" });
    assert.deepEqual(closed.ok && closed.event, { type: "game_changed", revision: closed.ok ? closed.event!.revision : 0, kind: "flow", batch: null });
    assert.equal(other.snapshot().gmThinking, false);
  });

  it("호스트는 proceed 로 기다리지 않고 묶음을 닫는다. 참가자는 proceed 할 수 없다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    assert.deepEqual(await game.execute(host.id, "c0", { kind: "proceed" }), { ok: false, error: "모으고 있는 행동이 없습니다." });
    await game.execute(player.id, "c1", { kind: "act", text: "주머니를 뒤진다" });
    assert.deepEqual(await game.execute(player.id, "c2", { kind: "proceed" }), { ok: false, error: "묶음 진행은 호스트가 결정합니다." });
    const proceeded = await game.execute(host.id, "c3", { kind: "proceed" });
    await narrated;

    assert.equal(proceeded.ok && proceeded.event?.gmThinking, true);
    assert.deepEqual(actionTurns(gm).map(inputTexts), [["브렌:주머니를 뒤진다"]]);
  });

  it("접속이 끊긴 참가자는 전원 판정에서 빠진다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    await game.execute(player.id, "c1", { kind: "act", text: "손을 흔든다" });
    const published: GameChange[] = [];
    game.subscribe((change) => published.push(change));
    game.setPresence(host.id, false);
    await narrated;

    assert.deepEqual(published[0], { type: "game_changed", revision: published[0].revision, kind: "flow", batch: null, gmThinking: true });
    assert.deepEqual(actionTurns(gm).map(inputTexts), [["브렌:손을 흔든다"]]);

    // 끊긴 채로는 기다리지 않고, 다시 접속하면 다시 기다린다
    const alone = nextLog(game, (entry) => entry.text === "서술");
    await game.execute(player.id, "c2", { kind: "act", text: "혼자 걷는다" });
    await alone;
    game.setPresence(host.id, true);
    const waiting = await game.execute(player.id, "c3", { kind: "act", text: "돌아본다" });
    assert.deepEqual(waiting.ok && waiting.event?.batch?.waiting, [game.characterFor(host.id)]);
    assert.equal(actionTurns(gm).length, 2);
  });

  it("GM 턴 도중 들어온 입력은 다음 묶음이 되고, 전원이 준비돼도 그 턴이 끝날 때 닫힌다", async () => {
    const first = deferred();
    const gm = provider((turn) => firstAction(turn).text === "첫째" ? first.promise : "둘째 서술");
    const game = await room(gm);
    const secondDone = nextLog(game, (entry) => entry.text === "둘째 서술");

    await game.execute(host.id, "c1", { kind: "act", text: "첫째" });
    await game.execute(player.id, "c2", { kind: "pass" });
    await game.execute(player.id, "c3", { kind: "act", text: "둘째" });
    const allReady = await game.execute(host.id, "c4", { kind: "act", text: "셋째" });
    assert.equal(actionTurns(gm).length, 1);
    assert.deepEqual(allReady.ok && allReady.event?.batch?.waiting, []);

    first.resolve("첫째 서술");
    await secondDone;
    assert.deepEqual(actionTurns(gm).map(inputTexts), [["아리아:첫째"], ["브렌:둘째", "아리아:셋째"]]);
    assert.equal(game.snapshot().gmThinking, false);
    assert.equal(game.snapshot().batch, null);
  });

  it("도착 이벤트는 참가자 신호 없이 열린 묶음에 붙는다", async () => {
    const gm = provider();
    const game = await room(gm);
    const narrated = nextLog(game, (entry) => entry.role === "gm" && entry.text === ARRIVAL);

    await game.execute(player.id, "c1", { kind: "act", text: "시장으로 가자고 한다" });
    await game.execute(host.id, "c2", moveTo("ash.loc.market"));
    assert.equal(gm.turns.length, 1);
    await game.execute(host.id, "c3", { kind: "pass" });
    await narrated;

    assert.deepEqual(inputTexts(gm.turns[1]), ["브렌:시장으로 가자고 한다", "arrival"]);
  });

  it("순서 턴에서는 현재 차례의 행동이 바로 GM 턴이 되고, pass·proceed 는 받지 않는다", async () => {
    const gm = provider();
    const game = await room(gm, "ord");
    const narrated = nextLog(game, (entry) => entry.text === "서술");

    assert.deepEqual(await game.execute(host.id, "c0", { kind: "pass" }), { ok: false, error: "순서 턴에서는 차례 종료로 넘깁니다." });
    assert.deepEqual(await game.execute(host.id, "c1", { kind: "proceed" }), { ok: false, error: "순서 턴에서는 차례 종료로 넘깁니다." });
    const acted = await game.execute(host.id, "c2", { kind: "act", text: "종을 친다" });
    await narrated;

    assert.equal(acted.ok && acted.event?.gmThinking, true);
    assert.equal(acted.ok && acted.event?.batch, undefined);
    assert.deepEqual(actionTurns(gm).map(inputTexts), [["아리아:종을 친다"]]);
  });
});
