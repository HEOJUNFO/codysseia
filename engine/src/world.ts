// 섬 폴더(islands/<섬_id>/)를 읽어 검증하고 엔진이 쓰는 World 로 만든다.
// 스키마 검증(/schemas) + 섬 안 참조 검증(ID 접두사, 없는 지역을 가리키는 연결 등).

import fs from "node:fs";
import path from "node:path";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { parse } from "yaml";
import islandSchema from "../../schemas/island.schema.json" with { type: "json" };
import locationSchema from "../../schemas/location.schema.json" with { type: "json" };
import type { Connection, IslandDef, IslandId, LocationDef, Point, World } from "./types.ts";

type RawConnection = string | { to: string; requires_flags?: string[]; hidden_until_flags?: string[] };
type RawIsland = {
  id: string;
  name: string;
  entry_location: string;
  departure_locations?: string[];
  entry_requires_flags?: string[];
  safe_zones?: string[];
  archipelago_position: Point;
  map_image?: string;
};
type RawLocation = {
  id: string;
  name: string;
  description?: string;
  map_position?: Point;
  image?: string;
  spots?: { id: string; name: string; description?: string; position?: Point }[];
  connections?: RawConnection[];
};

let validators: { island: ValidateFunction; location: ValidateFunction } | null = null;
function getValidators() {
  if (!validators) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    validators = { island: ajv.compile(islandSchema), location: ajv.compile(locationSchema) };
  }
  return validators;
}

function formatErrors(file: string, errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${file}: ${e.instancePath || "(최상위)"} ${e.message ?? "형식 오류"}`);
}

function readYaml(file: string, errors: string[], label: string): unknown {
  try {
    return parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${label}: YAML 읽기 실패 — ${(err as Error).message}`);
    return undefined;
  }
}

/** assets/ 경로가 실제 파일을 가리키는지 */
function checkAsset(islandDir: string, label: string, asset: string | undefined, errors: string[]) {
  if (asset && !fs.existsSync(path.join(islandDir, asset))) errors.push(`${label}: 없는 파일 (${asset})`);
}

export type LoadedIsland = {
  island: IslandDef | null;
  locations: LocationDef[];
  /** 비어 있으면 검증 통과 */
  errors: string[];
};

/** 섬 하나를 읽고 검증한다. 오류가 하나라도 있으면 island 는 null. */
export function loadIsland(islandDir: string): LoadedIsland {
  const islandId = path.basename(islandDir);
  const errors: string[] = [];
  const { island: validateIsland, location: validateLocation } = getValidators();

  const islandFile = path.join(islandDir, "island.yaml");
  if (!fs.existsSync(islandFile)) return { island: null, locations: [], errors: ["island.yaml 이 없다"] };
  const rawIsland = readYaml(islandFile, errors, "island.yaml");
  if (rawIsland !== undefined && !validateIsland(rawIsland)) {
    errors.push(...formatErrors("island.yaml", validateIsland.errors));
  }

  const locations: LocationDef[] = [];
  const locDir = path.join(islandDir, "locations");
  const locFiles = fs.existsSync(locDir) ? fs.readdirSync(locDir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
  const spotIds = new Set<string>();

  for (const file of locFiles) {
    const label = `locations/${file}`;
    const raw = readYaml(path.join(locDir, file), errors, label);
    if (raw === undefined) continue;
    if (!validateLocation(raw)) {
      errors.push(...formatErrors(label, validateLocation.errors));
      continue;
    }
    const loc = raw as RawLocation;
    checkAsset(islandDir, `${label} image`, loc.image, errors);
    if (!loc.id.startsWith(`${islandId}.loc.`)) errors.push(`${label}: id 는 ${islandId}.loc. 으로 시작해야 한다 (${loc.id})`);
    if (locations.some((l) => l.id === loc.id)) errors.push(`${label}: 지역 id 중복 (${loc.id})`);
    for (const spot of loc.spots ?? []) {
      if (!spot.id.startsWith(`${islandId}.spot.`)) errors.push(`${label}: 지점 id 는 ${islandId}.spot. 으로 시작해야 한다 (${spot.id})`);
      if (spotIds.has(spot.id)) errors.push(`${label}: 지점 id 중복 (${spot.id})`);
      spotIds.add(spot.id);
    }
    locations.push({
      id: loc.id,
      islandId,
      name: loc.name,
      description: loc.description,
      mapPosition: loc.map_position,
      image: loc.image,
      spots: (loc.spots ?? []).map((s) => ({ ...s })),
      connections: (loc.connections ?? []).map(
        (c): Connection =>
          typeof c === "string"
            ? { to: c, requiresFlags: [], hiddenUntilFlags: [] }
            : { to: c.to, requiresFlags: c.requires_flags ?? [], hiddenUntilFlags: c.hidden_until_flags ?? [] },
      ),
    });
  }

  if (locFiles.length === 0) errors.push("locations/ 에 지역이 하나도 없다");

  const locationIds = new Set(locations.map((l) => l.id));
  for (const loc of locations) {
    for (const c of loc.connections) {
      if (c.to === loc.id) errors.push(`${loc.id}: 자기 자신으로 가는 연결`);
      else if (!locationIds.has(c.to)) errors.push(`${loc.id}: 없는 지역으로 가는 연결 (${c.to}). 연결은 같은 섬 안에서만 쓴다`);
    }
  }

  let island: IslandDef | null = null;
  if (rawIsland !== undefined && validateIsland(rawIsland)) {
    const raw = rawIsland as RawIsland;
    checkAsset(islandDir, "island.yaml map_image", raw.map_image, errors);
    if (raw.id !== islandId) errors.push(`island.yaml: id(${raw.id})가 폴더 이름(${islandId})과 다르다`);
    const refs: [string, string[]][] = [
      ["entry_location", [raw.entry_location]],
      ["departure_locations", raw.departure_locations ?? []],
      ["safe_zones", raw.safe_zones ?? []],
    ];
    for (const [field, ids] of refs) {
      for (const id of ids) if (!locationIds.has(id)) errors.push(`island.yaml: ${field} 가 없는 지역을 가리킨다 (${id})`);
    }
    island = {
      id: raw.id,
      name: raw.name,
      entryLocation: raw.entry_location,
      departureLocations: raw.departure_locations ?? [],
      entryRequiresFlags: raw.entry_requires_flags ?? [],
      position: raw.archipelago_position,
      mapImage: raw.map_image,
    };
  }

  return errors.length > 0 ? { island: null, locations: [], errors } : { island, locations, errors };
}

/** 여러 섬을 읽어 World 를 만든다. 검증에 실패한 섬은 빼고 errors 에 담는다. */
export function loadWorld(islandsDir: string, islandIds: IslandId[]): { world: World; errors: Record<IslandId, string[]> } {
  const world: World = { islands: {}, locations: {} };
  const errors: Record<IslandId, string[]> = {};
  for (const id of islandIds) {
    const loaded = loadIsland(path.join(islandsDir, id));
    if (!loaded.island) {
      errors[id] = loaded.errors;
      continue;
    }
    world.islands[id] = loaded.island;
    for (const loc of loaded.locations) world.locations[loc.id] = loc;
  }
  return { world, errors };
}

/** 군도 지도에서 서로 너무 가까운 섬. 막지는 않고 경고만 한다. */
export function archipelagoWarnings(islands: Pick<IslandDef, "id" | "position">[], minDistance = 6): Record<IslandId, string[]> {
  const warnings: Record<IslandId, string[]> = {};
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      const a = islands[i];
      const b = islands[j];
      if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < minDistance) {
        (warnings[a.id] ??= []).push(`군도 지도에서 ${b.id} 와 너무 가깝다 (archipelago_position)`);
        (warnings[b.id] ??= []).push(`군도 지도에서 ${a.id} 와 너무 가깝다 (archipelago_position)`);
      }
    }
  }
  return warnings;
}
