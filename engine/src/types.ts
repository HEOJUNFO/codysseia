// 엔진이 다루는 섬 데이터와 게임 상태. 상태의 원본은 엔진이다 (대전제 2.1).

export type IslandId = string;
export type LocationId = string;
export type SpotId = string;
export type FlagId = string;
export type CharacterId = string;

/** 지도 위 퍼센트 좌표. 이미지 왼쪽 위 (0,0) ~ 오른쪽 아래 (100,100) */
export type Point = { x: number; y: number };

export type IslandDef = {
  id: IslandId;
  name: string;
  entryLocation: LocationId;
  /** 섬을 떠날 수 있는 지역. 비어 있으면 entryLocation 만. */
  departureLocations: LocationId[];
  entryRequiresFlags: FlagId[];
  /** 군도 지도 위 위치 (제작자가 고른다) */
  position: Point;
  /** 섬 지도 배경. 섬 폴더 기준 assets/ 경로 */
  mapImage?: string;
};

export type Spot = {
  id: SpotId;
  name: string;
  description?: string;
  /** 현장 뷰 위 위치 */
  position?: Point;
};

export type Connection = {
  to: LocationId;
  /** 모두 켜져 있어야 지나갈 수 있다 */
  requiresFlags: FlagId[];
  /** 모두 켜지기 전에는 보이지 않는다 */
  hiddenUntilFlags: FlagId[];
};

export type LocationDef = {
  id: LocationId;
  islandId: IslandId;
  name: string;
  description?: string;
  /** 섬 지도 위 위치 */
  mapPosition?: Point;
  /** 현장 뷰 배경. 섬 폴더 기준 assets/ 경로 */
  image?: string;
  spots: Spot[];
  connections: Connection[];
};

export type World = {
  islands: Record<IslandId, IslandDef>;
  locations: Record<LocationId, LocationDef>;
};

export type EngineState = {
  party: {
    members: CharacterId[];
    /** 섬과 지역은 파티가 함께 움직인다 */
    islandId: IslandId;
    locationId: LocationId;
    /** 지점은 캐릭터마다 다를 수 있다. null 이면 특정 지점에 있지 않음 */
    spots: Record<CharacterId, SpotId | null>;
  };
  visited: LocationId[];
  /** 지도에 드러난 지역 (방문했거나, 방문한 곳에서 보이는 연결) */
  discovered: LocationId[];
  flags: FlagId[];
  inCombat: boolean;
};
