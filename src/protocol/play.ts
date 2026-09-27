// 플레이 화면이 엔진에서 받는 상태. 원본은 엔진이고 화면은 읽기만 한다 (대전제 2.1).

/** 스냅숏 필수 필드가 바뀌면 올린다. 이전 호스트의 상태를 새 화면에 주입하지 않는다. */
export const GAME_PROTOCOL_VERSION = 3;

export type Character = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mind: number;
  maxMind: number;
  /** 지역 안에서 서 있는 지점. null 이면 특정 지점에 있지 않음 */
  spotId: string | null;
};

export type Item = {
  id: string;
  name: string;
  qty: number;
};

export type LogEntry = {
  id: string;
  role: "gm" | "player" | "system";
  text: string;
  /** player 로그: 행동한 캐릭터 */
  characterId?: string;
};

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type DeepReadonly<T> = T extends readonly (infer Entry)[] ? readonly DeepReadonly<Entry>[]
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

/** 현재 섬의 공개 확장 상태. 호스트는 섬별 상태를 방이 닫힐 때까지 유지한다. */
export type IslandState = {
  islandId: string;
  shared: JsonObject;
  players: Record<string, JsonObject>;
};

/** 자유 진행 또는 엔진이 소유하는 순서 턴. 전투의 판정·행동 횟수는 별도 코어 규칙이다. */
export type TurnState =
  | { readonly mode: "free" }
  | { readonly mode: "ordered"; readonly round: number; readonly order: readonly string[]; readonly activeCharacterId: string };

export type IslandPatch =
  | { target: "shared"; path: string[]; op: "set"; value: JsonValue }
  | { target: "shared"; path: string[]; op: "remove" }
  | { target: "player"; characterId: string; path: string[]; op: "set"; value: JsonValue }
  | { target: "player"; characterId: string; path: string[]; op: "remove" };

export type Place = {
  islandId: string;
  islandName: string;
  locationId: string;
  locationName: string;
  description?: string;
};

export type Moves = {
  /** 갈 수 있는(또는 보이지만 잠긴) 같은 섬의 지역 */
  locations: { id: string; name: string; locked: boolean }[];
  /** 현재 지역의 지점 */
  spots: { id: string; name: string }[];
  /** 출발 지역에 있을 때만 채워지는 다른 섬. hours 는 항해 시간 */
  islands: { id: string; name: string; locked: boolean; hours: number }[];
};

/** 지도 위 퍼센트 좌표. 이미지 왼쪽 위 (0,0) ~ 오른쪽 아래 (100,100) */
export type Point = { x: number; y: number };

/** 군도 지도: 플레이 가능한 모든 섬 */
export type ArchipelagoIsland = { id: string; name: string; position: Point; current: boolean };

/** 마지막 섬 간 항해. id 가 바뀌면 화면이 항해 연출을 한 번 보여준다 */
export type Voyage = {
  id: number;
  from: { id: string; name: string; position: Point };
  to: { id: string; name: string; position: Point };
  /** 게임 안에서 걸린 시간 */
  hours: number;
};

/** 섬 지도: 현재 섬에서 발견한 지역과 보이는 길만 */
export type IslandMapData = {
  image: string | null;
  locations: { id: string; name: string; position: Point | null; visited: boolean; current: boolean }[];
  paths: { from: string; to: string; locked: boolean }[];
};

export type IslandMapUpdate =
  | { kind: "full"; value: IslandMapData }
  | { kind: "delta"; locationsAdded: IslandMapData["locations"]; pathsAdded: IslandMapData["paths"] };

/** 현장 뷰: 현재 지역의 배경과 지점 */
export type LocationViewData = {
  image: string | null;
  spots: { id: string; name: string; position: Point | null }[];
};

export type GameState = {
  party: Character[];
  inventory: Item[];
  /** 플레이 가능한 섬이 하나도 없으면 null */
  place: Place | null;
  moves: Moves;
  /** 방문한 지역 id */
  visited: string[];
  /** 지도에 드러난 지역 id */
  discovered: string[];
  archipelago: ArchipelagoIsland[];
  islandMap: IslandMapData;
  locationView: LocationViewData;
  inCombat: boolean;
  /** 게임 시간. 시작부터 흐른 시간(시간 단위) */
  time: number;
  /** 마지막 섬 간 항해. 아직 없으면 null */
  voyage: Voyage | null;
  log: LogEntry[];
  islandState: IslandState;
  turn: TurnState;
  /** 방의 GM 턴이 도는 중. 도는 동안 보낸 행동은 다음 턴에 처리된다 */
  gmThinking: boolean;
  /** 다음 GM 턴으로 모으는 중인 행동 묶음. 없으면 null */
  batch: ActionBatch | null;
  /** 이 브라우저가 보낸 명령의 응답·동기화·재연결을 기다리는 중. 방은 보내지 않고 화면이 채운다 */
  pending: boolean;
};

/** 방이 보내는 상태. `pending`은 브라우저마다 다르므로 빠진다 */
export type RoomGameState = Omit<GameState, "pending">;

/**
 * 다음 GM 턴 하나로 넘길 행동 묶음 (이슈 06). 타이머 없이 신호로 닫힌다.
 * 자유 진행: 접속 중인 전원이 ready(행동을 보냄)·pass(넘김)가 되거나 호스트가 진행하면 닫힌다.
 * 순서 턴: 현재 차례의 행동이 들어오면 닫힌다. 앞 GM 턴이 도는 동안에는 닫히지 않고 그 턴이 끝날 때 다시 판정한다.
 */
export type ActionBatch = {
  signals: { characterId: string; signal: "ready" | "pass" }[];
  /** 접속 중이고 아직 신호가 없는 캐릭터. 순서 턴에서는 비어 있다 */
  waiting: string[];
  /** 호스트 진행이나 도착 이벤트로 열려, 앞 GM 턴이 끝나는 대로 닫힌다 */
  closing: boolean;
};

export type MoveRequest =
  | { kind: "location"; locationId: string }
  | { kind: "spot"; characterIds: string[]; spotId: string | null }
  | { kind: "island"; islandId: string };

export type GameCommand =
  | { kind: "move"; request: MoveRequest }
  | { kind: "act"; text: string }
  | { kind: "island"; action: string; payload: JsonValue }
  | { kind: "end_turn" }
  /** 이번 묶음에 행동 없이 넘긴다 */
  | { kind: "pass" }
  /** 호스트: 기다리지 않고 묶음을 닫는다 */
  | { kind: "proceed" };

export type SceneState = Pick<GameState,
  "party" | "place" | "moves" | "visited" | "discovered" | "archipelago" |
  "islandMap" | "locationView" | "inCombat" | "time" | "voyage"
>;

/** 묶음과 GM 턴 진행. 바뀐 변경분에만 실린다. GM 턴을 연 변경분에 gmThinking: true, 마지막 서술에 false 가 실린다 */
export type TurnFlow = { batch?: ActionBatch | null; gmThinking?: boolean };

export type GameChange = (
  | {
      type: "game_changed";
      revision: number;
      kind: "scene";
      place: Place;
      moves: Moves;
      visitedAdded: string[];
      discoveredAdded: string[];
      map: IslandMapUpdate;
      locationView: LocationViewData;
      time?: number;
      voyage?: Voyage;
      islandState?: IslandState;
      turn?: TurnState;
      logEntries: LogEntry[];
    }
  | { type: "game_changed"; revision: number; kind: "spot"; characterId: string; spotId: string | null }
  | { type: "game_changed"; revision: number; kind: "log"; logEntries: LogEntry[] }
  | { type: "game_changed"; revision: number; kind: "island_patch"; patches: IslandPatch[]; turn?: TurnState; logEntries: LogEntry[] }
  | { type: "game_changed"; revision: number; kind: "turn"; turn: TurnState }
  /** 묶음 신호·접속 변화처럼 다른 상태 변경 없이 진행만 바뀐 경우 */
  | { type: "game_changed"; revision: number; kind: "flow" }
) & TurnFlow;

export type GameSnapshotMessage = {
  type: "game_snapshot";
  protocolVersion: number;
  revision: number;
  state: RoomGameState;
  selfCharacterId: string;
};

export type GameResumeMessage = {
  type: "game_resumed";
  protocolVersion: number;
  revision: number;
  selfCharacterId: string;
};
