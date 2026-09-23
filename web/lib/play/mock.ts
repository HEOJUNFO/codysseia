// 엔진이 생기기 전까지 쓰는 가짜 상태와 가짜 GM.
// 엔진 API가 정해지면 이 파일을 엔진 연결로 교체한다 (대전제 8.5 [TBD]).

import type { GameState, LogEntry } from "./types";

let nextId = 0;
export function entry(role: LogEntry["role"], text: string): LogEntry {
  nextId += 1;
  return { id: `log-${nextId}`, role, text };
}

export function initialMockState(islandId: string): GameState {
  return {
    party: [
      { id: "pc.aria", name: "아리아", hp: 18, maxHp: 22, mind: 9, maxMind: 12 },
      { id: "pc.bren", name: "브렌", hp: 25, maxHp: 25, mind: 6, maxMind: 10 },
    ],
    inventory: [
      { id: "core.item.torch", name: "횃불", qty: 3 },
      { id: "core.item.ration", name: "식량", qty: 5 },
    ],
    location: { islandId, locationId: null },
    log: [
      entry("system", "엔진 미연결 — 가짜 상태로 동작합니다. '/move <섬_id>'로 섬 이동을 흉내 낼 수 있습니다."),
      entry("gm", "파도가 발목을 적신다. 안개 너머로 섬의 윤곽이 서서히 드러난다."),
    ],
    pending: false,
  };
}

export function mockGmReply(action: string): string {
  return `(가짜 GM) "${action}" — 엔진이 연결되면 여기에 GM의 서술이 나온다.`;
}
