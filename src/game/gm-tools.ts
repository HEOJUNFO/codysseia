// GM 도구 (대전제 2.2 중 지금 엔진이 가진 기능만). 인자를 검증해 엔진 함수를 부르고, 방이 적용할 효과를 돌려준다.
// 방·전송을 모르는 순수 함수라 엔진 테스트처럼 따로 검증한다.
import {
  moveToLocation,
  moveToSpot,
  readFlag,
  setFlag,
  travelToIsland,
  type EngineState,
  type FlagResult,
  type MoveResult,
  type World,
} from "@codysseia/engine";
import type { JsonValue, MoveRequest } from "../protocol/play.ts";
import type { GMStateView, GMToolDefinition, GMToolResult } from "./gm-port.ts";

export type GMToolContext = {
  world: World;
  engine: EngineState;
  state: () => GMStateView;
};

export type GMToolEffect =
  | { kind: "move"; request: MoveRequest; result: Extract<MoveResult, { ok: true }> }
  | { kind: "flag"; flagId: string; on: boolean; result: Extract<FlagResult, { ok: true }> };

export type GMToolOutcome = { result: GMToolResult; effect: GMToolEffect | null };

const idSchema = (description: string) => ({ type: "string", description });

export const GM_TOOL_DEFINITIONS: readonly GMToolDefinition[] = [
  {
    name: "get_state",
    description: "엔진의 현재 상태(위치, 파티, 갈 수 있는 곳, 켜진 플래그, 시간)를 읽는다. 도구로 상태를 바꾼 뒤 결과를 확인할 때 쓴다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "move_party",
    description: "파티 전체를 현재 지역과 연결된 같은 섬의 지역으로 옮긴다. 잠기거나 연결되지 않은 곳이면 실패 코드를 돌려준다.",
    inputSchema: { type: "object", properties: { location_id: idSchema("갈 지역 ID (get_state 의 moves.locations)") }, required: ["location_id"], additionalProperties: false },
    annotations: { readOnlyHint: false },
  },
  {
    name: "travel",
    description: "파티를 다른 섬으로 항해시킨다. 출발 지역에 있을 때만 되고, 항해 시간만큼 게임 시간이 흐른다.",
    inputSchema: { type: "object", properties: { island_id: idSchema("갈 섬 ID (get_state 의 moves.islands)") }, required: ["island_id"], additionalProperties: false },
    annotations: { readOnlyHint: false },
  },
  {
    name: "move_to_spot",
    description: "캐릭터 한 명을 현재 지역 안의 지점으로 옮긴다. spot_id 가 null 이면 특정 지점에서 벗어난다.",
    inputSchema: {
      type: "object",
      properties: {
        character_id: idSchema("캐릭터 ID (get_state 의 party[].id)"),
        spot_id: { type: ["string", "null"], description: "지점 ID (get_state 의 location.spots) 또는 null" },
      },
      required: ["character_id", "spot_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: "set_flag",
    description: "현재 섬의 스토리 플래그를 켜거나 끈다. ID는 <섬_id>.flag.<이름> 모양이고 섬 GM 지침에 적힌 것만 쓴다. 켜면 그 플래그로 잠기거나 숨은 길이 열린다.",
    inputSchema: {
      type: "object",
      properties: {
        flag_id: idSchema("플래그 ID"),
        value: { type: "boolean", description: "true 면 켜고 false 면 끈다. 기본값 true" },
      },
      required: ["flag_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: "get_flag",
    description: "플래그가 켜져 있는지 읽는다. 현재 섬의 플래그와, 다른 섬이 공개한 플래그만 읽을 수 있다.",
    inputSchema: { type: "object", properties: { flag_id: idSchema("플래그 ID") }, required: ["flag_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

function refused(code: string, message: string): GMToolOutcome {
  return { result: { ok: false, code, message }, effect: null };
}

function argsObject(args: unknown): Record<string, unknown> | null {
  return args === undefined || args === null ? {} : typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : null;
}

function text(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null;
}

function moved(request: MoveRequest, result: MoveResult, value: (state: EngineState) => JsonValue): GMToolOutcome {
  if (!result.ok) return refused(result.error.code, result.error.message);
  return { result: { ok: true, value: value(result.state) }, effect: { kind: "move", request, result } };
}

export function runGMTool(context: GMToolContext, name: string, rawArgs: unknown): GMToolOutcome {
  const { world, engine } = context;
  const args = argsObject(rawArgs);
  if (!args) return refused("invalid_arguments", "인자는 객체여야 한다.");
  switch (name) {
    case "get_state":
      return { result: { ok: true, value: context.state() as unknown as JsonValue }, effect: null };
    case "move_party": {
      const locationId = text(args, "location_id");
      if (!locationId) return refused("invalid_arguments", "location_id 가 필요하다.");
      return moved({ kind: "location", locationId }, moveToLocation(world, engine, locationId), (state) => ({
        location_id: state.party.locationId,
        location_name: world.locations[state.party.locationId].name,
      }));
    }
    case "travel": {
      const islandId = text(args, "island_id");
      if (!islandId) return refused("invalid_arguments", "island_id 가 필요하다.");
      return moved({ kind: "island", islandId }, travelToIsland(world, engine, islandId), (state) => ({
        island_id: state.party.islandId,
        location_id: state.party.locationId,
        hours: state.time - engine.time,
      }));
    }
    case "move_to_spot": {
      const characterId = text(args, "character_id");
      const spotId = args.spot_id === null ? null : text(args, "spot_id");
      if (!characterId || (spotId === null && args.spot_id !== null)) return refused("invalid_arguments", "character_id 와 spot_id(문자열 또는 null)가 필요하다.");
      return moved({ kind: "spot", characterIds: [characterId], spotId }, moveToSpot(world, engine, characterId, spotId), () => ({ character_id: characterId, spot_id: spotId }));
    }
    case "set_flag": {
      const flagId = text(args, "flag_id");
      const on = args.value === undefined ? true : args.value;
      if (!flagId || typeof on !== "boolean") return refused("invalid_arguments", "flag_id 와 boolean value 가 필요하다.");
      const result = setFlag(world, engine, flagId, on);
      if (!result.ok) return refused(result.error.code, result.error.message);
      return { result: { ok: true, value: { flag_id: flagId, value: on, changed: result.changed } }, effect: result.changed ? { kind: "flag", flagId, on, result } : null };
    }
    case "get_flag": {
      const flagId = text(args, "flag_id");
      if (!flagId) return refused("invalid_arguments", "flag_id 가 필요하다.");
      const result = readFlag(world, engine, flagId);
      return result.ok ? { result: { ok: true, value: { flag_id: flagId, value: result.on } }, effect: null } : refused(result.error.code, result.error.message);
    }
    default:
      return refused("unknown_tool", `없는 도구: ${name}`);
  }
}
