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
import type { Character, GameChange, GameCommand, IslandPatch, IslandState, LogEntry, MoveRequest, RoomGameState, SceneState, TurnState, Voyage } from "../protocol/play.ts";
import type { IslandActionHandler } from "./action-handler.ts";
import type { GMInput, GMProvider, GMTurn } from "./gm-port.ts";
import { advanceTurn, initialTurn, transitionTurn } from "./turn.ts";

type RoomMember = { id: string; name: string; role: "host" | "player" };
type Outcome = { ok: true; event: GameChange | null } | { ok: false; error: string };
type AssetUrl = (islandId: string, asset: string | undefined) => string | null;
type ChangeListener = (change: GameChange) => void;
type PublishableChange = { [Kind in GameChange["kind"]]: Omit<Extract<GameChange, { kind: Kind }>, "type" | "revision"> }[GameChange["kind"]];

/** GM 턴 하나의 입력. logIds 는 이번 입력이 이미 남긴 로그라 최근 로그에서 뺀다 */
type GMQueueItem = { inputs: GMInput[]; logIds: string[] };

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
  /** 방마다 GM 턴은 하나씩만 돈다. 도는 동안 들어온 행동과 도착은 여기서 기다린다 */
  #gmQueue: GMQueueItem[] = [];
  /** 큐가 빌 때까지 켜져 있다. 켠 시점은 그 계기가 된 변경분, 끈 시점은 마지막 서술 log 변경분의 gmThinking 으로 발행한다 */
  #gmRunning = false;

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
    this.#islands = Object.values(world.islands).sort((a, b) => a.id.localeCompare(b.id));
    const characterIds = Array.from(this.#characterIds());
    this.#engine = startGame(world, characterIds, startIslandId);
    this.#turn = initialTurn(world.islands[startIslandId].turnMode ?? "free", characterIds);
    this.#ensureIslandState(startIslandId);
    this.#addLog("system", "엔진 연결됨 · 행동과 도착은 GM이 서술합니다.");
    // 첫 도착 서술은 발행할 변경분이 없다. 켜진 #gmRunning 은 스냅숏의 gmThinking 으로 전해진다.
    if (this.#queueArrival([this.#arrivalInput(this.#engine.party.locationId, true)])) void this.#runGmTurns();
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

  characterFor(memberId: string): string | null {
    return this.#characters.get(memberId)?.id ?? null;
  }

  *#characterIds(): IterableIterator<string> {
    for (const character of this.#characters.values()) yield character.id;
  }

  snapshot(): RoomGameState {
    return { ...this.#scene(), inventory: [], log: this.#log, islandState: this.#currentIslandState(), turn: this.#turn, gmThinking: this.#gmRunning };
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
    if (request.kind === "island") this.#ensureIslandState(request.islandId);
    const previous = this.#engine;
    this.#engine = result.state;
    if (request.kind === "island") this.#turn = initialTurn(this.#world.islands[request.islandId].turnMode ?? "free", this.#characterIds());
    if (request.kind === "spot") {
      return { ok: true, event: this.#publish({ kind: "spot", characterId: request.characterIds[0], spotId: request.spotId }) };
    }
    const { logEntries, narration } = this.#applyEvents(result.events);
    const starting = this.#queueArrival(narrate ? narration : []);
    const event = this.#publish({
      kind: "scene",
      ...this.#locationArea(),
      map: request.kind === "island"
        ? { kind: "full", value: this.#islandMap() }
        : { kind: "delta", ...islandMapDelta(this.#world, previous, result.state) },
      visitedAdded: result.state.visited.slice(previous.visited.length),
      discoveredAdded: result.state.discovered.slice(previous.discovered.length),
      ...(request.kind === "island" ? { time: result.state.time, voyage: this.#voyage ?? undefined, islandState: this.#currentIslandState(), turn: this.#turn } : {}),
      logEntries,
      ...(starting ? { gmThinking: true } : {}),
    });
    if (starting) void this.#runGmTurns();
    return { ok: true, event };
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
    const starting = this.#enqueueGm({ inputs: [{ kind: "action", characterId: character.id, characterName: character.name, text }], logIds: [entry.id] });
    const event = this.#publish({ kind: "log", logEntries: [entry], ...(starting ? { gmThinking: true } : {}) });
    if (starting) void this.#runGmTurns();
    return { ok: true, event };
  }

  /** 큐에 넣고 #gmRunning 을 켠다. 이번에 켰으면 true — 부른 쪽이 그 변경분에 gmThinking 을 싣고 #runGmTurns 를 부른다. */
  #enqueueGm(item: GMQueueItem): boolean {
    this.#gmQueue.push(item);
    if (this.#gmRunning) return false;
    this.#gmRunning = true;
    return true;
  }

  /**
   * 도착 서술을 GM 큐에 넣는다. 아직 시작하지 않은 이전 도착은 파티가 이미 떠난 곳이라 버리고, 그 항해만 새 도착 앞에 잇는다.
   * 큐에는 도착 항목이 많아야 하나라서 GM 턴의 현재 상태와 도착 장소가 어긋나지 않는다. inputs 가 비면(개발 명령) 이전 도착만 버린다.
   */
  #queueArrival(inputs: GMInput[]): boolean {
    const index = this.#gmQueue.findIndex((item) => item.inputs.some((input) => input.kind === "arrival"));
    const carried = index === -1 ? [] : this.#gmQueue.splice(index, 1)[0].inputs.filter((input) => input.kind === "voyage");
    return inputs.length > 0 && this.#enqueueGm({ inputs: [...carried, ...inputs], logIds: [] });
  }

  /** #gmRunning 을 켠 쪽이 부른다. 큐가 비면 마지막 서술과 함께 GM 턴 종료를 발행한다. */
  async #runGmTurns(): Promise<void> {
    while (this.#gmQueue.length > 0 && !this.#closed) {
      const item = this.#gmQueue.shift()!;
      let entry: LogEntry;
      try {
        const text = (await this.#gm.narrate(this.#gmTurn(item), this.#gmAbort.signal)).trim();
        if (this.#closed) break;
        entry = text ? this.#addLog("gm", text) : this.#addLog("system", "GM이 빈 서술을 돌려주었습니다.");
      } catch (error) {
        if (this.#closed) break;
        entry = this.#addLog("system", `GM 서술을 받지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      }
      const done = this.#gmQueue.length === 0;
      if (done) this.#gmRunning = false;
      this.#publish({ kind: "log", logEntries: [entry], ...(done ? { gmThinking: false } : {}) });
    }
    this.#gmRunning = false;
  }

  /** 턴이 시작되는 시점의 엔진 상태로 GM 입력을 만든다. 이번 턴의 행동 로그는 inputs 에만 넣는다. */
  #gmTurn(item: GMQueueItem): GMTurn {
    const engine = this.#engine;
    const location = this.#world.locations[engine.party.locationId];
    const island = this.#world.islands[location.islandId];
    const spotName = (spotId: string | null) => location.spots.find((spot) => spot.id === spotId)?.name ?? null;
    const inputLogIds = new Set(item.logIds);
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
      recentLog: this.#log.filter((entry) => !inputLogIds.has(entry.id)).slice(-RECENT_LOG).map(({ role, text }) => ({ role, text })),
      inputs: item.inputs,
    };
  }

  #endTurn(member: RoomMember): Outcome {
    if (this.#turn.mode !== "ordered") return { ok: false, error: "진행 중인 순서 턴이 없습니다." };
    if (this.#turn.activeCharacterId !== this.characterFor(member.id) && member.role !== "host") return { ok: false, error: "자신의 턴만 종료할 수 있습니다." };
    this.#turn = advanceTurn(this.#turn);
    return { ok: true, event: this.#publish({ kind: "turn", turn: this.#turn }) };
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
      return { ok: true, event: result.turn === undefined ? null : this.#publish({ kind: "turn", turn: nextTurn }) };
    }
    const logEntries = messages.map((message) => this.#addLog("system", message));
    return { ok: true, event: this.#publish({ kind: "island_patch", patches, ...(result.turn === undefined ? {} : { turn: nextTurn }), logEntries }) };
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
