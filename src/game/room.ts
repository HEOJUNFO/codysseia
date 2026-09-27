// 방 하나의 게임 상태. 엔진 판정과 공개 상태 투영을 소유하고, 전송·파일·React는 모른다.
import {
  availableMoves,
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
import type { Character, GameChange, GameCommand, GameState, IslandPatch, IslandState, LogEntry, MoveRequest, SceneState, Voyage } from "../protocol/play.ts";
import type { IslandActionHandler } from "./action-handler.ts";

type RoomMember = { id: string; name: string; role: "host" | "player" };
type Outcome = { ok: true; event: GameChange | null } | { ok: false; error: string };
type AssetUrl = (islandId: string, asset: string | undefined) => string | null;

function formatHours(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days === 0 ? `${rest}시간` : rest === 0 ? `${days}일` : `${days}일 ${rest}시간`;
}

export class GameRoom {
  readonly #world: World;
  readonly #assetUrl: AssetUrl;
  readonly #members: Map<string, RoomMember>;
  readonly #characters: Map<string, Character>;
  readonly #islands: World["islands"][string][];
  readonly #rules: ReadonlyMap<string, IslandActionHandler>;
  readonly #islandStates = new Map<string, IslandState>();
  #engine: EngineState;
  #log: LogEntry[] = [];
  #events: GameChange[] = [];
  #results = new Map<string, { ok: true } | { ok: false; error: string }>();
  #nextLogId = 0;
  #voyage: Voyage | null = null;
  #revision = 0;
  #closed = false;
  #commandQueue: Promise<void> = Promise.resolve();

  constructor(world: World, startIslandId: string, members: Iterable<RoomMember>, assetUrl: AssetUrl, rules: ReadonlyMap<string, IslandActionHandler> = new Map()) {
    this.#world = world;
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
    this.#engine = startGame(world, Array.from(this.#characters.values(), (character) => character.id), startIslandId);
    this.#ensureIslandState(startIslandId);
    this.#addLog("system", "엔진 연결됨 · GM 미연결 — 현재 서술은 임시 문장입니다.");
    this.#arrival(this.#engine.party.locationId, true);
  }

  get revision(): number { return this.#revision; }

  close(): void { this.#closed = true; }

  characterFor(memberId: string): string | null {
    return this.#characters.get(memberId)?.id ?? null;
  }

  snapshot(): GameState {
    return { ...this.#scene(), inventory: [], log: this.#log, islandState: this.#currentIslandState(), pending: false };
  }

  replay(from: number, to: number): Iterable<GameChange> | null {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 255 || to > this.#revision) return null;
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
        : { ok: false, error: "알 수 없는 게임 명령입니다." };
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : "게임 명령을 처리하지 못했습니다." };
    }
    this.#results.set(key, outcome.ok ? { ok: true } : outcome);
    return outcome;
  }

  #move(member: RoomMember, request: MoveRequest): Outcome {
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
      if (request.spotId !== null && typeof request.spotId !== "string") return { ok: false, error: "이동할 지점이 올바르지 않습니다." };
      result = moveToSpot(this.#world, this.#engine, ownCharacter, request.spotId);
    } else {
      return { ok: false, error: "알 수 없는 이동 요청입니다." };
    }
    if (!result.ok) return { ok: false, error: result.error.message };
    if (request.kind === "island") this.#ensureIslandState(request.islandId);
    const previous = this.#engine;
    this.#engine = result.state;
    if (request.kind === "spot") {
      return { ok: true, event: this.#publish({ kind: "spot", characterId: request.characterIds[0], spotId: request.spotId }) };
    }
    const logEntries = this.#applyEvents(result.events);
    return { ok: true, event: this.#publish({
      kind: "scene",
      ...this.#area(),
      visitedAdded: result.state.visited.slice(previous.visited.length),
      discoveredAdded: result.state.discovered.slice(previous.discovered.length),
      ...(request.kind === "island" ? { time: result.state.time, voyage: this.#voyage ?? undefined, islandState: this.#currentIslandState() } : {}),
      logEntries,
    }) };
  }

  #act(member: RoomMember, raw: string): Outcome {
    if (typeof raw !== "string") return { ok: false, error: "행동을 입력하세요." };
    const text = raw.trim();
    if (!text || text.length > 1000) return { ok: false, error: "행동은 1~1000자로 입력하세요." };
    const travel = /^\/move\s+([a-z][a-z0-9_]*)$/.exec(text);
    if (travel) return this.#move(member, { kind: "island", islandId: travel[1] });
    const logEntries = [
      this.#addLog("player", `${member.name}: ${text}`),
      this.#addLog("gm", `(가짜 GM) "${text}" — GM이 연결되면 여기에 서술이 나옵니다.`),
    ];
    return { ok: true, event: this.#publish({ kind: "log", logEntries }) };
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
    this.#islandStates.set(islandId, nextState);
    if (patches.length === 0 && messages.length === 0) return { ok: true, event: null };
    const logEntries = messages.map((message) => this.#addLog("system", message));
    return { ok: true, event: this.#publish({ kind: "island_patch", patches, logEntries }) };
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

  #publish(change: Omit<Extract<GameChange, { kind: "scene" }>, "type" | "revision"> | Omit<Extract<GameChange, { kind: "spot" }>, "type" | "revision"> | Omit<Extract<GameChange, { kind: "log" }>, "type" | "revision"> | Omit<Extract<GameChange, { kind: "island_patch" }>, "type" | "revision">): GameChange {
    const event = { type: "game_changed", revision: ++this.#revision, ...change } as GameChange;
    this.#events.push(event);
    return event;
  }

  #addLog(role: LogEntry["role"], text: string): LogEntry {
    const entry = { id: `log-${++this.#nextLogId}`, role, text };
    this.#log.push(entry);
    return entry;
  }

  #arrival(locationId: string, firstVisit: boolean): LogEntry {
    const location = this.#world.locations[locationId];
    const island = this.#world.islands[location.islandId];
    const description = firstVisit && location.description ? ` ${location.description}` : "";
    return this.#addLog("gm", `(가짜 GM) ${island.name} · ${location.name}에 ${firstVisit ? "처음 " : ""}도착했다.${description}`);
  }

  #applyEvents(events: MoveEvent[]): LogEntry[] {
    const entries: LogEntry[] = [];
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
        entries.push(this.#addLog("gm", `(가짜 GM) ${from.name}을(를) 떠나 ${formatHours(event.hours)} 동안 바다를 건넜다.`));
      } else if (event.type === "island_entered") {
        entries.push(this.#addLog("system", `섬 이동 → ${this.#world.islands[event.islandId].name}`));
      } else if (event.type === "location_entered") {
        entries.push(this.#arrival(event.locationId, event.firstVisit));
      }
    }
    return entries;
  }

  #area(): Omit<Pick<SceneState, "place" | "moves" | "islandMap" | "locationView">, "place"> & { place: NonNullable<SceneState["place"]> } {
    const engine = this.#engine;
    const location = this.#world.locations[engine.party.locationId];
    const island = this.#world.islands[location.islandId];
    return {
      place: { islandId: island.id, islandName: island.name, locationId: location.id, locationName: location.name, description: location.description },
      moves: availableMoves(this.#world, engine),
      islandMap: { image: this.#assetUrl(island.id, island.mapImage), ...islandMapView(this.#world, engine) },
      locationView: { image: this.#assetUrl(island.id, location.image), spots: location.spots.map((spot) => ({ id: spot.id, name: spot.name, position: spot.position ?? null })) },
    };
  }

  #scene(): SceneState {
    const engine = this.#engine;
    return {
      ...this.#area(),
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
