// 플레이 화면이 엔진에서 받는 상태. 원본은 엔진이고 화면은 읽기만 한다 (대전제 2.1).

export type Character = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mind: number;
  maxMind: number;
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

export type GameState = {
  party: Character[];
  inventory: Item[];
  location: { islandId: string; locationId: string | null };
  log: LogEntry[];
  /** GM 응답을 기다리는 중 */
  pending: boolean;
};
