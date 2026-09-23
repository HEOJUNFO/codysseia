import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "./expect.ts";
import { afterEach, describe, it } from "node:test";
import { archipelagoWarnings, loadIsland, loadWorld } from "../src/index.ts";

let root: string | undefined;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeIsland(id: string, files: Record<string, string>): string {
  root ??= fs.mkdtempSync(path.join(os.tmpdir(), "codysseia-"));
  const dir = path.join(root, id);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const valid = {
  "island.yaml": "id: ash\nname: 잿빛 항구\nentry_location: ash.loc.docks\narchipelago_position: { x: 20, y: 30 }\n",
  "locations/docks.yaml": "id: ash.loc.docks\nname: 부두\nconnections: [ash.loc.market]\n",
  "locations/market.yaml": [
    "id: ash.loc.market",
    "name: 시장",
    "spots:",
    "  - { id: ash.spot.well, name: 우물 }",
    "connections:",
    "  - ash.loc.docks",
    "  - { to: ash.loc.docks, requires_flags: [ash.flag.key] }",
    "",
  ].join("\n"),
};

describe("loadIsland", () => {
  it("올바른 섬을 읽는다 (문자열·객체 연결 모두)", () => {
    const r = loadIsland(makeIsland("ash", valid));
    expect(r.errors).toEqual([]);
    expect(r.island).toMatchObject({ id: "ash", entryLocation: "ash.loc.docks", departureLocations: [] });
    const market = r.locations.find((l) => l.id === "ash.loc.market")!;
    expect(market.spots).toEqual([{ id: "ash.spot.well", name: "우물" }]);
    expect(market.connections[1]).toEqual({ to: "ash.loc.docks", requiresFlags: ["ash.flag.key"], hiddenUntilFlags: [] });
  });

  it("entry_location 이 없으면 스키마 오류", () => {
    const r = loadIsland(makeIsland("ash", { ...valid, "island.yaml": "id: ash\nname: 잿빛 항구\n" }));
    expect(r.island).toBeNull();
    expect(r.errors.join("\n")).toMatch(/entry_location/);
  });

  it("없는 지역을 가리키면 오류", () => {
    const r = loadIsland(
      makeIsland("ash", { ...valid, "locations/docks.yaml": "id: ash.loc.docks\nname: 부두\nconnections: [ash.loc.nowhere]\n" }),
    );
    expect(r.errors.join("\n")).toMatch(/없는 지역으로 가는 연결 \(ash\.loc\.nowhere\)/);
  });

  it("다른 섬 접두사, 폴더와 다른 id 는 오류", () => {
    const r = loadIsland(
      makeIsland("ash", {
        ...valid,
        "island.yaml": "id: fog\nname: x\nentry_location: ash.loc.docks\narchipelago_position: { x: 1, y: 1 }\n",
        "locations/extra.yaml": "id: fog.loc.x\nname: 남의 지역\n",
      }),
    );
    expect(r.errors.join("\n")).toMatch(/폴더 이름/);
    expect(r.errors.join("\n")).toMatch(/ash\.loc\. 으로 시작해야/);
  });
});

describe("지도 필드", () => {
  it("좌표와 이미지를 읽는다", () => {
    const r = loadIsland(
      makeIsland("ash", {
        ...valid,
        "island.yaml": "id: ash\nname: 잿빛 항구\nentry_location: ash.loc.docks\narchipelago_position: { x: 20, y: 30 }\nmap_image: assets/map.png\n",
        "locations/docks.yaml": "id: ash.loc.docks\nname: 부두\nmap_position: { x: 10, y: 80 }\nimage: assets/docks.jpg\nspots:\n  - { id: ash.spot.pier, name: 잔교, position: { x: 40, y: 60 } }\nconnections: [ash.loc.market]\n",
        "assets/map.png": "x",
        "assets/docks.jpg": "x",
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.island).toMatchObject({ position: { x: 20, y: 30 }, mapImage: "assets/map.png" });
    const docks = r.locations.find((l) => l.id === "ash.loc.docks")!;
    expect(docks).toMatchObject({ mapPosition: { x: 10, y: 80 }, image: "assets/docks.jpg" });
    expect(docks.spots[0].position).toEqual({ x: 40, y: 60 });
  });

  it("archipelago_position 은 필수, 0~100 범위", () => {
    const missing = loadIsland(makeIsland("ash", { ...valid, "island.yaml": "id: ash\nname: x\nentry_location: ash.loc.docks\n" }));
    expect(missing.errors.join("\n")).toMatch(/archipelago_position/);
    const out = loadIsland(
      makeIsland("fog", {
        "island.yaml": "id: fog\nname: x\nentry_location: fog.loc.a\narchipelago_position: { x: 120, y: 0 }\n",
        "locations/a.yaml": "id: fog.loc.a\nname: a\n",
      }),
    );
    expect(out.errors.join("\n")).toMatch(/archipelago_position\/x/);
  });

  it("없는 이미지 파일, assets/ 밖 경로는 오류", () => {
    const r = loadIsland(
      makeIsland("ash", {
        ...valid,
        "island.yaml": "id: ash\nname: x\nentry_location: ash.loc.docks\narchipelago_position: { x: 1, y: 1 }\nmap_image: assets/none.png\n",
        "locations/docks.yaml": "id: ash.loc.docks\nname: 부두\nimage: ../secret.png\n",
      }),
    );
    expect(r.errors.join("\n")).toMatch(/없는 파일 \(assets\/none\.png\)/);
    expect(r.errors.join("\n")).toMatch(/docks\.yaml: \/image/);
  });
});

describe("archipelagoWarnings", () => {
  it("가까운 섬끼리만 서로 경고한다", () => {
    const w = archipelagoWarnings([
      { id: "a", position: { x: 10, y: 10 } },
      { id: "b", position: { x: 13, y: 12 } },
      { id: "c", position: { x: 80, y: 80 } },
    ]);
    expect(Object.keys(w).sort()).toEqual(["a", "b"]);
    expect(w.a[0]).toMatch(/b 와 너무 가깝다/);
  });
});

describe("loadWorld", () => {
  it("검증 실패한 섬은 빼고 오류를 모은다", () => {
    const good = makeIsland("ash", valid);
    makeIsland("bad", { "island.yaml": "id: bad\nname: 망가진 섬\n" });
    const { world, errors } = loadWorld(path.dirname(good), ["ash", "bad"]);
    expect(Object.keys(world.islands)).toEqual(["ash"]);
    expect(Object.keys(world.locations).sort()).toEqual(["ash.loc.docks", "ash.loc.market"]);
    expect(Object.keys(errors)).toEqual(["bad"]);
  });
});
