// 플레이 화면이 엔진에서 받는 상태. 원본은 엔진이고 화면은 읽기만 한다 (대전제 2.1).

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
};

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
  /** 엔진·GM 응답을 기다리는 중 */
  pending: boolean;
};

export type MoveRequest =
  | { kind: "location"; locationId: string }
  | { kind: "spot"; characterIds: string[]; spotId: string | null }
  | { kind: "island"; islandId: string };
