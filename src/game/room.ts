// 방 하나의 게임 상태. 엔진 판정과 공개 상태 투영을 소유하고, 전송·파일·React는 모른다.
import {
  availableMoves,
  islandMapDelta,
  islandMapView,
  moveToLocation,
  moveToSpot,
  startGame,
  travelToIsland,
  type EngineState,
  type MoveEvent,
  type MoveResult,
  type World,
} from "@codysseia/engine";
import { applyIslandPatch, copyJson, copyJsonObject, normalizeIslandPatch } from "../protocol/island-state.ts";
import type { ActionBatch, Character, GameChange, GameCommand, IslandPatch, IslandState, LogEntry, MoveRequest, RoomGameState, SceneState, TurnFlow, TurnState, Voyage } from "../protocol/play.ts";
import type { IslandActionHandler } from "./action-handler.ts";
import type { GMInput, GMProvider, GMStateView, GMToolResult, GMTools, GMTurn } from "./gm-port.ts";
import { GM_TOOL_DEFINITIONS, runGMTool, type GMToolEffect } from "./gm-tools.ts";
import { advanceTurn, initialTurn, transitionTurn } from "./turn.ts";

type RoomMember = { id: string; name: string; role: "host" | "player" };
type Outcome = { ok: true; event: GameChange | null } | { ok: false; error: string };
type AssetUrl = (islandId: string, asset: string | undefined) => string | null;
type ChangeListener = (change: GameChange) => void;
type PublishableChange = { [Kind in GameChange["kind"]]: Omit<Extract<GameChange, { kind: Kind }>, "type" | "revision"> }[GameChange["kind"]];

/** GM 턴 하나의 입력. logIds 는 이번 입력이 이미 남긴 로그라 최근 로그에서 뺀다 */
type GMQueueItem = { inputs: GMInput[]; logIds: string[] };
/** 모으는 중인 묶음 (이슈 06). signals 는 참가자(memberId)별 신호, closing 이면 GM 턴이 비는 대로 닫힌다 */
type OpenBatch = GMQueueItem & { signals: Map<string, "ready" | "pass">; closing: boolean };

/** GM 턴 입력에 넣는 최근 로그 수. 긴 세션 요약(대전제 9.3)은 아직 없다 */
const RECENT_LOG = 12;

export class GameRoom {
  readonly #world: World;
  readonly #assetUrl: AssetUrl;
  readonly #members: Map<string, RoomMember>;
  readonly #characters: Map<string, Character>;
  readonly #islands: World["islands"][string][];
  readonly #rules: ReadonlyMap<string, IslandActionHandler>;
  readonly #islandStates = new Map<string, IslandState>();
  readonly #gm: GMProvider;
  readonly #gmAbort = new AbortController();
  readonly #listeners = new Set<ChangeListener>();
  #engine: EngineState;
  #log: LogEntry[] = [];
  #events: GameChange[] = [];
  #results = new Map<string, { ok: true } | { ok: false; error: string }>();
  #voyage: Voyage | null = null;
  #turn: TurnState;
  #closed = false;
  #commandQueue: Promise<void> = Promise.resolve();
  /** 접속 중인 참가자(memberId). 끊긴 참가자는 묶음 판정에서 빠진다 */
  readonly #online: Set<string>;
  /** 다음 GM 턴으로 모으는 입력. 도는 턴 하나와 열린 묶음 하나만 있다 */
  #batch: OpenBatch | null = null;
  /** 방마다 GM 턴은 하나씩만 돈다 */
  #gmRunning = false;
  /** 마지막으로 발행한 진행 상태. 바뀐 변경분에만 batch·gmThinking 을 싣는다 */
  #shownBatch = "null";
  #shownThinking = false;

  constructor(world: World, startIslandId: string, members: Iterable<RoomMember>, assetUrl: AssetUrl, rules: ReadonlyMap<string, IslandActionHandler>, gm: GMProvider) {
    this.#world = world;
    this.#gm = gm;
    this.#assetUrl = assetUrl;
    this.#rules = rules;
    this.#members = new Map();
    this.#characters = new Map();
    for (const member of members) {
      this.#members.set(member.id, { id: member.id, name: member.name, role: member.role });
      this.#characters.set(member.id, {
        id: `core.pc.${member.id.replaceAll("-", "")}`,
        name: member.name,
        hp: 20,
        maxHp: 20,
        mind: 10,
        maxMind: 10,
        spotId: null,
      });
    }
    // 로비는 참가자 전원이 접속해 있을 때만 게임을 연다.
    this.#online = new Set(this.#members.keys());
    this.#islands = Object.values(world.islands).sort((a, b) => a.id.localeCompare(b.id));
    const characterIds = Array.from(this.#characterIds());
    this.#engine = startGame(world, characterIds, startIslandId);
    this.#turn = initialTurn(world.islands[startIslandId].turnMode ?? "free", characterIds);
    this.#ensureIslandState(startIslandId);
    this.#addLog("system", "엔진 연결됨 · 행동과 도착은 GM이 서술합니다.");
    // 첫 도착 서술은 발행할 변경분이 없다. 진행 상태는 스냅숏으로 전해진다.
    this.#queueArrival([this.#arrivalInput(this.#engine.party.locationId, true)]);
    const start = this.#settle();
    this.#flowChanges();
    if (start) void this.#runGmTurn(start);
  }

  get revision(): number { return this.#events.length; }

  close(): void {
    this.#closed = true;
    this.#gmAbort.abort();
  }

  /** 확정된 변경분을 revision 순서대로 받는다. GM 서술처럼 명령 응답 뒤에 오는 변경도 여기로 온다. */
  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 로비가 참가자의 첫 연결과 마지막 연결 종료 때 부른다. 끊긴 참가자를 기다리지 않게 묶음을 다시 판정한다. */
  setPresence(memberId: string, online: boolean): void {
    if (this.#closed || !this.#members.has(memberId) || this.#online.has(memberId) === online) return;
    if (online) this.#online.add(memberId);
    else this.#online.delete(memberId);
    this.#commit(null);
  }

  characterFor(memberId: string): string | null {
    return this.#characters.get(memberId)?.id ?? null;
  }

  *#characterIds(): IterableIterator<string> {
    for (const character of this.#characters.values()) yield character.id;
  }

  snapshot(): RoomGameState {
    return { ...this.#scene(), inventory: [], log: this.#log, islandState: this.#currentIslandState(), turn: this.#turn, gmThinking: this.#gmRunning, batch: this.#batchView() };
  }

  replay(from: number, to: number): Iterable<GameChange> | null {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 255 || to > this.revision) return null;
    const events = this.#events;
    return {
      *[Symbol.iterator]() {
        for (let index = from - 1; index < to; index++) yield events[index];
      },
    };
  }

  execute(memberId: string, commandId: string, command: GameCommand): Promise<Outcome> {
    const next = this.#commandQueue.then(() => this.#executeNow(memberId, commandId, command));
    this.#commandQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async #executeNow(memberId: string, commandId: string, command: GameCommand): Promise<Outcome> {
    if (this.#closed) return { ok: false, error: "방이 종료되었습니다." };
    if (typeof commandId !== "string" || commandId.length < 1 || commandId.length > 80) return { ok: false, error: "명령 번호가 올바르지 않습니다." };
    const member = this.#members.get(memberId);
    if (!member) return { ok: false, error: "파티 참가자가 아닙니다." };
    const key = `${memberId}:${commandId}`;
    const previous = this.#results.get(key);
    if (previous) return previous.ok ? { ok: true, event: null } : previous;
    let outcome: Outcome;
    try {
      outcome = command?.kind === "move" ? this.#move(member, command.request)
        : command?.kind === "act" ? this.#act(member, command.text)
        : command?.kind === "island" ? await this.#islandAction(member, command.action, command.payload)
        : command?.kind === "end_turn" ? this.#endTurn(member)
        : command?.kind === "pass" ? this.#pass(member)
        : command?.kind === "proceed" ? this.#proceed(member)
        : { ok: false, error: "알 수 없는 게임 명령입니다." };
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : "게임 명령을 처리하지 못했습니다." };
    }
    this.#results.set(key, outcome.ok ? { ok: true } : outcome);
    return outcome;
  }

  /** 명확한 이동은 GM을 기다리지 않고 바로 발행한다. 항해·도착 서술은 GM 큐에서 뒤따른다. narrate 가 false 면(개발 명령) GM을 거치지 않는다. */
  #move(member: RoomMember, request: MoveRequest, narrate = true): Outcome {
    if (!request || typeof request !== "object") return { ok: false, error: "이동 요청이 올바르지 않습니다." };
    let result: MoveResult;
    if (request.kind === "location") {
      if (member.role !== "host") return { ok: false, error: "파티 이동은 호스트가 결정합니다." };
      if (typeof request.locationId !== "string") return { ok: false, error: "이동할 지역이 올바르지 않습니다." };
      result = moveToLocation(this.#world, this.#engine, request.locationId);
    } else if (request.kind === "island") {
      if (member.role !== "host") return { ok: false, error: "항해는 호스트가 결정합니다." };
      if (typeof request.islandId !== "string") return { ok: false, error: "이동할 섬이 올바르지 않습니다." };
      result = travelToIsland(this.#world, this.#engine, request.islandId);
    } else if (request.kind === "spot") {
      const ownCharacter = this.characterFor(member.id);
      if (!ownCharacter || !Array.isArray(request.characterIds) || request.characterIds.length !== 1 || request.characterIds[0] !== ownCharacter) {
        return { ok: false, error: "자신의 캐릭터만 이동할 수 있습니다." };
      }
      if (this.#turn.mode === "ordered" && this.#turn.activeCharacterId !== ownCharacter) return { ok: false, error: "자신의 턴에만 이동할 수 있습니다." };
      if (request.spotId !== null && typeof request.spotId !== "string") return { ok: false, error: "이동할 지점이 올바르지 않습니다." };
      result = moveToSpot(this.#world, this.#engine, ownCharacter, request.spotId);
    } else {
      return { ok: false, error: "알 수 없는 이동 요청입니다." };
    }
    if (!result.ok) return { ok: false, error: result.error.message };
    return { ok: true, event: this.#commitMove(request, result, narrate, null) };
  }

  /**
   * 검증을 마친 이동을 적용하고 발행한다. GM 도구 이동(gmSummary)은 그 턴의 GM이 이미 서술하므로 도착 서술을 묶음에 넣지 않고,
   * 기다리던 옛 도착만 버린 뒤 도구 요약 로그를 남긴다.
   */
  #commitMove(request: MoveRequest, result: Extract<MoveResult, { ok: true }>, narrate: boolean, gmSummary: string | null): GameChange | null {
    if (request.kind === "island") this.#ensureIslandState(request.islandId);
    const previous = this.#engine;
    this.#engine = result.state;
    if (request.kind === "island") this.#turn = initialTurn(this.#world.islands[request.islandId].turnMode ?? "free", this.#characterIds());
    if (request.kind === "spot") {
      const event = this.#commit({ kind: "spot", characterId: request.characterIds[0], spotId: request.spotId });
      return gmSummary === null ? event : this.#commit({ kind: "log", logEntries: [this.#addLog("system", gmSummary)] });
    }
    const { logEntries, narration } = this.#applyEvents(result.events);
    if (gmSummary !== null) logEntries.unshift(this.#addLog("system", gmSummary));
    this.#queueArrival(narrate ? narration : []);
    return this.#commit({
      kind: "scene",
      ...this.#locationArea(),
      map: request.kind === "island"
        ? { kind: "full", value: this.#islandMap() }
        : { kind: "delta", ...islandMapDelta(this.#world, previous, result.state) },
      visitedAdded: result.state.visited.slice(previous.visited.length),
      discoveredAdded: result.state.discovered.slice(previous.discovered.length),
      ...(request.kind === "island" ? { time: result.state.time, voyage: this.#voyage ?? undefined, islandState: this.#currentIslandState(), turn: this.#turn } : {}),
      logEntries,
    });
  }

  #act(member: RoomMember, raw: string): Outcome {
    if (typeof raw !== "string") return { ok: false, error: "행동을 입력하세요." };
    const text = raw.trim();
    if (!text || text.length > 1000) return { ok: false, error: "행동은 1~1000자로 입력하세요." };
    const travel = /^\/move\s+([a-z][a-z0-9_]*)$/.exec(text);
    if (travel) return this.#move(member, { kind: "island", islandId: travel[1] }, false);
    if (this.#turn.mode === "ordered" && this.#turn.activeCharacterId !== this.characterFor(member.id)) return { ok: false, error: "자신의 턴에만 행동할 수 있습니다." };
    const character = this.#characters.get(member.id);
    if (!character) return { ok: false, error: "캐릭터를 찾을 수 없습니다." };
    const entry = this.#addLog("player", `${member.name}: ${text}`, character.id);
    const batch = this.#openBatch();
    batch.inputs.push({ kind: "action", characterId: character.id, characterName: character.name, text });
    batch.logIds.push(entry.id);
    batch.signals.set(member.id, "ready");
    return { ok: true, event: this.#commit({ kind: "log", logEntries: [entry] }) };
  }

  #pass(member: RoomMember): Outcome {
    if (this.#turn.mode === "ordered") return { ok: false, error: "순서 턴에서는 차례 종료로 넘깁니다." };
    const signal = this.#batch?.signals.get(member.id);
    if (signal === "ready") return { ok: false, error: "이번 묶음에 이미 행동을 보냈습니다." };
    if (signal === "pass") return { ok: true, event: null };
    this.#openBatch().signals.set(member.id, "pass");
    return { ok: true, event: this.#commit(null) };
  }

  #proceed(member: RoomMember): Outcome {
    if (member.role !== "host") return { ok: false, error: "묶음 진행은 호스트가 결정합니다." };
    if (this.#turn.mode === "ordered") return { ok: false, error: "순서 턴에서는 차례 종료로 넘깁니다." };
    if (!this.#batch) return { ok: false, error: "모으고 있는 행동이 없습니다." };
    if (this.#batch.closing) return { ok: true, event: null };
    this.#batch.closing = true;
    return { ok: true, event: this.#commit(null) };
  }

  #openBatch(): OpenBatch {
    return this.#batch ??= { inputs: [], logIds: [], signals: new Map(), closing: false };
  }

  /**
   * 도착 서술을 참가자 신호 없이 열린 묶음에 붙인다. 열린 묶음이 없으면 도착만으로 묶음을 열어 GM 턴이 비는 대로 닫는다.
   * 묶음에 이전 도착이 남아 있으면 파티가 이미 떠난 곳이라 버리고, 그 항해만 새 도착 앞에 잇는다.
   * 그래서 묶음의 도착은 많아야 하나고 GM 턴의 현재 상태와 도착 장소가 어긋나지 않는다. inputs 가 비면(개발 명령) 이전 도착만 버린다.
   */
  #queueArrival(inputs: GMInput[]): void {
    const batch = this.#batch;
    if (!batch) {
      if (inputs.length > 0) this.#batch = { inputs, logIds: [], signals: new Map(), closing: true };
      return;
    }
    if (batch.inputs.some((input) => input.kind === "arrival")) {
      const voyages = inputs.length > 0 ? batch.inputs.filter((input) => input.kind === "voyage") : [];
      batch.inputs = batch.inputs.filter((input) => input.kind === "action");
      inputs = [...voyages, ...inputs];
    }
    batch.inputs.push(...inputs);
    if (batch.inputs.length === 0 && batch.signals.size === 0) this.#batch = null;
  }

  /** 열린 묶음이 닫힐 때가 되면 닫고 시작할 GM 턴을 돌려준다. 앞 턴이 도는 동안에는 닫지 않는다 — 그 턴의 완료가 다시 판정한다. */
  #settle(): GMQueueItem | null {
    const batch = this.#batch;
    if (!batch || this.#gmRunning || !this.#batchComplete(batch)) return null;
    this.#batch = null;
    if (batch.inputs.length === 0) return null;
    this.#gmRunning = true;
    return { inputs: batch.inputs, logIds: batch.logIds };
  }

  #batchComplete(batch: OpenBatch): boolean {
    if (batch.closing) return true;
    // 순서 턴에서는 차례가 곧 묶음이다. 현재 차례만 행동할 수 있으므로 입력이 들어오면 닫는다.
    if (this.#turn.mode === "ordered") return batch.inputs.length > 0;
    for (const memberId of this.#online) if (!batch.signals.has(memberId)) return false;
    return true;
  }

  #batchView(): ActionBatch | null {
    const batch = this.#batch;
    if (!batch) return null;
    const signals: ActionBatch["signals"] = [];
    const waiting: string[] = [];
    for (const [memberId, character] of this.#characters) {
      const signal = batch.signals.get(memberId);
      if (signal) signals.push({ characterId: character.id, signal });
      else if (this.#turn.mode === "free" && this.#online.has(memberId)) waiting.push(character.id);
    }
    return { signals, waiting, closing: batch.closing };
  }

  /** 마지막 발행 뒤 바뀐 진행 상태. 없으면 null */
  #flowChanges(): TurnFlow | null {
    const flow: TurnFlow = {};
    const batch = this.#batchView();
    const shown = JSON.stringify(batch);
    if (shown !== this.#shownBatch) {
      this.#shownBatch = shown;
      flow.batch = batch;
    }
    if (this.#gmRunning !== this.#shownThinking) {
      this.#shownThinking = this.#gmRunning;
      flow.gmThinking = this.#gmRunning;
    }
    return flow.batch === undefined && flow.gmThinking === undefined ? null : flow;
  }

  /**
   * 상태 전이 하나를 발행하는 유일한 길. 전이 직후 묶음을 한 번 판정하고, 바뀐 진행 상태를 같은 변경분에 싣는다.
   * change 가 null 이면(신호·접속 변화) 진행이 바뀐 경우에만 flow 변경분을 발행한다. 닫힌 묶음의 GM 턴은 발행 뒤에 시작한다.
   */
  #commit(change: PublishableChange | null): GameChange | null {
    const start = this.#settle();
    const flow = this.#flowChanges();
    const event = change ? this.#publish({ ...change, ...flow }) : flow ? this.#publish({ kind: "flow", ...flow }) : null;
    if (start) void this.#runGmTurn(start);
    return event;
  }

  /** #settle 이 연 GM 턴 하나를 돌린다. 턴의 완료가 서술을 발행하며 열린 묶음을 다시 판정한다. */
  async #runGmTurn(item: GMQueueItem): Promise<void> {
    const session = this.#openGmTools();
    let entry: LogEntry;
    try {
      const text = (await this.#gm.narrate(this.#gmTurn(item), session.tools, this.#gmAbort.signal).finally(session.close)).trim();
      if (this.#closed) return;
      entry = text ? this.#addLog("gm", text) : this.#addLog("system", "GM이 빈 서술을 돌려주었습니다.");
    } catch (error) {
      if (this.#closed) return;
      entry = this.#addLog("system", `GM 서술을 받지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
    this.#gmRunning = false;
    this.#commit({ kind: "log", logEntries: [entry] });
  }

  /** 턴이 시작되는 시점의 엔진 상태로 GM 입력을 만든다. 이번 턴의 행동 로그는 inputs 에만 넣는다. */
  #gmTurn(item: GMQueueItem): GMTurn {
    const inputLogIds = new Set(item.logIds);
    return {
      ...this.#gmState(),
      recentLog: this.#log.filter((entry) => !inputLogIds.has(entry.id)).slice(-RECENT_LOG).map(({ role, text }) => ({ role, text })),
      inputs: item.inputs,
    };
  }

  /** 이번 GM 턴에만 쓸 수 있는 도구. 턴이 끝나면 close 로 닫고, 그 뒤 호출은 거부한다. */
  #openGmTools(): { tools: GMTools; close: () => void } {
    let open = true;
    return {
      tools: {
        definitions: GM_TOOL_DEFINITIONS,
        call: (name, args) => open && !this.#closed
          ? this.#gmTool(name, args)
          : { ok: false, code: "turn_closed", message: "GM 턴이 끝나 도구를 쓸 수 없다." },
      },
      close: () => { open = false; },
    };
  }

  /** 도구 호출은 동기로 엔진에 적용하고, 바뀐 상태는 다른 명령과 같은 revision 변경분으로 발행한다. */
  #gmTool(name: string, args: unknown): GMToolResult {
    const { result, effect } = runGMTool({ world: this.#world, engine: this.#engine, state: () => this.#gmState() }, name, args);
    if (effect) this.#applyGmEffect(effect);
    return result;
  }

  #applyGmEffect(effect: GMToolEffect): void {
    if (effect.kind === "flag") {
      this.#engine = effect.result.state;
      this.#commit({
        kind: "routes",
        moves: availableMoves(this.#world, this.#engine),
        islandMap: this.#islandMap(),
        discoveredAdded: effect.result.discoveredAdded,
        // 플래그 ID는 섬의 비밀을 담을 수 있어 화면에는 보이지 않는다. 자세한 기록은 호스트 턴 로그에 남는다.
        logEntries: [this.#addLog("system", "GM이 이야기 진행 상태를 바꿨습니다.")],
      });
      return;
    }
    const { request, result } = effect;
    const summary = request.kind === "location" ? `GM이 파티를 ${this.#world.locations[request.locationId].name}(으)로 옮겼습니다.`
      : request.kind === "island" ? `GM이 파티를 ${this.#world.islands[request.islandId].name}(으)로 항해시켰습니다.`
      : `GM이 ${this.#party().find((character) => character.id === request.characterIds[0])?.name ?? "캐릭터"}의 위치를 ${
        request.spotId === null ? "지점 밖으로" : `${this.#world.locations[this.#engine.party.locationId].spots.find((spot) => spot.id === request.spotId)?.name ?? "지점"}(으)로`} 옮겼습니다.`;
    this.#commitMove(request, result, false, summary);
  }

  #gmState(): GMStateView {
    const engine = this.#engine;
    const location = this.#world.locations[engine.party.locationId];
    const island = this.#world.islands[location.islandId];
    const spotName = (spotId: string | null) => location.spots.find((spot) => spot.id === spotId)?.name ?? null;
    return {
      island: { id: island.id, name: island.name },
      location: {
        id: location.id,
        name: location.name,
        description: location.description,
        spots: location.spots.map((spot) => ({ id: spot.id, name: spot.name, description: spot.description })),
      },
      party: this.#party().map((character) => ({
        id: character.id,
        name: character.name,
        hp: character.hp,
        maxHp: character.maxHp,
        mind: character.mind,
        maxMind: character.maxMind,
        spot: spotName(character.spotId),
      })),
      moves: availableMoves(this.#world, engine),
      flags: engine.flags,
      time: engine.time,
    };
  }

  #endTurn(member: RoomMember): Outcome {
    if (this.#turn.mode !== "ordered") return { ok: false, error: "진행 중인 순서 턴이 없습니다." };
    if (this.#turn.activeCharacterId !== this.characterFor(member.id) && member.role !== "host") return { ok: false, error: "자신의 턴만 종료할 수 있습니다." };
    this.#turn = advanceTurn(this.#turn);
    return { ok: true, event: this.#commit({ kind: "turn", turn: this.#turn }) };
  }

  async #islandAction(member: RoomMember, action: string, payload: unknown): Promise<Outcome> {
    const islandId = this.#engine.party.islandId;
    const rules = this.#rules.get(islandId);
    if (typeof action !== "string" || action.length > 128 || !action.startsWith(`${islandId}.`)) {
      return { ok: false, error: "섬 행동 ID가 올바르지 않습니다." };
    }
    const state = this.#currentIslandState();
    const character = this.#characters.get(member.id);
    if (!character) return { ok: false, error: "캐릭터를 찾을 수 없습니다." };
    if (!rules) return { ok: false, error: "이 행동은 코어에 등록되지 않았습니다." };
    const result = await rules.handle({
        actor: { memberId: member.id, characterId: character.id, name: member.name, role: member.role },
        islandId,
        locationId: this.#engine.party.locationId,
        time: this.#engine.time,
        party: this.#party(),
        state,
        turn: this.#turn,
      }, action, copyJson(payload));
    if (this.#closed) return { ok: false, error: "방이 종료되었습니다." };
    if (!result || !Array.isArray(result.patches)) throw new Error("섬 규칙의 결과가 올바르지 않습니다.");
    const patches: IslandPatch[] = [];
    let nextState = state;
    for (const raw of result.patches) {
      const patch = normalizeIslandPatch(raw, nextState);
      nextState = applyIslandPatch(nextState, patch);
      patches.push(patch);
    }
    const messages = result.messages ?? [];
    if (!Array.isArray(messages) || messages.length > 20 || messages.some((message) => typeof message !== "string" || message.length > 1000)) {
      throw new Error("섬 규칙의 메시지가 올바르지 않습니다.");
    }
    const nextTurn = result.turn === undefined ? this.#turn : transitionTurn(this.#turn, result.turn, this.#characterIds());
    if (nextState !== state) this.#islandStates.set(islandId, nextState);
    this.#turn = nextTurn;
    if (patches.length === 0 && messages.length === 0) {
      return { ok: true, event: result.turn === undefined ? null : this.#commit({ kind: "turn", turn: nextTurn }) };
    }
    const logEntries = messages.map((message) => this.#addLog("system", message));
    return { ok: true, event: this.#commit({ kind: "island_patch", patches, ...(result.turn === undefined ? {} : { turn: nextTurn }), logEntries }) };
  }

  #ensureIslandState(islandId: string): IslandState {
    const existing = this.#islandStates.get(islandId);
    if (existing) return existing;
    const rules = this.#rules.get(islandId);
    const players: IslandState["players"] = {};
    for (const character of this.#characters.values()) {
      players[character.id] = copyJsonObject(rules?.createPlayerState?.(character) ?? {});
    }
    const state = Object.freeze({ islandId, shared: copyJsonObject(rules?.createSharedState?.() ?? {}), players: Object.freeze(players) });
    this.#islandStates.set(islandId, state);
    return state;
  }

  #currentIslandState(): IslandState {
    return this.#ensureIslandState(this.#engine.party.islandId);
  }

  #publish(change: PublishableChange): GameChange {
    const event = { type: "game_changed", revision: this.#events.length + 1, ...change } as GameChange;
    this.#events.push(event);
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  #addLog(role: LogEntry["role"], text: string, characterId?: string): LogEntry {
    const entry: LogEntry = characterId ? { id: `log-${this.#log.length + 1}`, role, text, characterId } : { id: `log-${this.#log.length + 1}`, role, text };
    this.#log.push(entry);
    return entry;
  }

  #arrivalInput(locationId: string, firstVisit: boolean): GMInput {
    return { kind: "arrival", locationId, locationName: this.#world.locations[locationId].name, firstVisit };
  }

  /** 이동 이벤트를 반영한다. 섬 진입은 system 로그로 남기고, 항해·도착은 GM 서술 입력으로 돌려준다. */
  #applyEvents(events: MoveEvent[]): { logEntries: LogEntry[]; narration: GMInput[] } {
    const logEntries: LogEntry[] = [];
    const narration: GMInput[] = [];
    for (const event of events) {
      if (event.type === "voyage") {
        const from = this.#world.islands[event.from];
        const to = this.#world.islands[event.to];
        this.#voyage = {
          id: (this.#voyage?.id ?? 0) + 1,
          from: { id: from.id, name: from.name, position: from.position },
          to: { id: to.id, name: to.name, position: to.position },
          hours: event.hours,
        };
        narration.push({ kind: "voyage", from: from.name, to: to.name, hours: event.hours });
      } else if (event.type === "island_entered") {
        logEntries.push(this.#addLog("system", `섬 이동 → ${this.#world.islands[event.islandId].name}`));
      } else if (event.type === "location_entered") {
        narration.push(this.#arrivalInput(event.locationId, event.firstVisit));
      }
    }
    return { logEntries, narration };
  }

  #locationArea(): Omit<Pick<SceneState, "place" | "moves" | "locationView">, "place"> & { place: NonNullable<SceneState["place"]> } {
    const engine = this.#engine;
    const location = this.#world.locations[engine.party.locationId];
    const island = this.#world.islands[location.islandId];
    return {
      place: { islandId: island.id, islandName: island.name, locationId: location.id, locationName: location.name, description: location.description },
      moves: availableMoves(this.#world, engine),
      locationView: { image: this.#assetUrl(island.id, location.image), spots: location.spots.map((spot) => ({ id: spot.id, name: spot.name, position: spot.position ?? null })) },
    };
  }

  #islandMap(): SceneState["islandMap"] {
    const island = this.#world.islands[this.#engine.party.islandId];
    return { image: this.#assetUrl(island.id, island.mapImage), ...islandMapView(this.#world, this.#engine) };
  }

  #scene(): SceneState {
    const engine = this.#engine;
    return {
      ...this.#locationArea(),
      islandMap: this.#islandMap(),
      party: this.#party(),
      visited: engine.visited,
      discovered: engine.discovered,
      archipelago: this.#islands.map((entry) => ({ id: entry.id, name: entry.name, position: entry.position, current: entry.id === engine.party.islandId })),
      inCombat: engine.inCombat,
      time: engine.time,
      voyage: this.#voyage,
    };
  }

  #party(): Character[] {
    return Array.from(this.#characters.values(), (character) => ({ ...character, spotId: this.#engine.party.spots[character.id] ?? null }));
  }
}
