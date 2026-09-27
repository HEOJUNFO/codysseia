import type { Character, DeepReadonly, IslandState, JsonObject, JsonValue, TurnState } from "../protocol/play.ts";
import type { TurnRequest } from "./turn.ts";

export type IslandActor = { memberId: string; characterId: string; name: string; role: "host" | "player" };

export type IslandActionContext = {
  actor: IslandActor;
  islandId: string;
  locationId: string;
  time: number;
  party: readonly Readonly<Character>[];
  state: DeepReadonly<IslandState>;
  turn: TurnState;
};

export type IslandActionResult = {
  patches: readonly unknown[];
  messages?: readonly string[];
  turn?: TurnRequest;
};

/** 코어 담당자가 대전제 8.3 절차로 등록하는 섬별 판정 확장. 섬 웹 코드는 이 모듈을 직접 구현하지 않는다. */
export type IslandActionHandler = {
  createSharedState?: () => JsonObject;
  createPlayerState?: (character: Readonly<Character>) => JsonObject;
  handle: (context: IslandActionContext, action: string, payload: JsonValue) => IslandActionResult | Promise<IslandActionResult>;
};
