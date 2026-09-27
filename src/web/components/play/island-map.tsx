"use client";

// 섬 지도: 발견한 지역과 보이는 길 (대전제 8.7). 갈 수 있는 지역을 누르면 이동한다.

import { useGameState, useMove } from "@/lib/play/provider";
import { chipClass, MapStage, Marker, Unplaced, type MarkerTone } from "./map-stage";

export function IslandMap({ image }: { /** 기본값: island.yaml 의 map_image */ image?: string }) {
  const { islandMap, moves, pending, place } = useGameState();
  const move = useMove();
  const reachable = new Map(moves.locations.map((l) => [l.id, l.locked]));
  const byId = new Map(islandMap.locations.map((l) => [l.id, l]));

  const tone = (id: string, current: boolean, visited: boolean): MarkerTone => {
    if (current) return "current";
    if (reachable.has(id)) return reachable.get(id) ? "locked" : "open";
    return visited ? "idle" : "unknown";
  };
  const go = (id: string) => (!pending && reachable.get(id) === false ? () => move.toLocation(id) : undefined);
  const unplaced = islandMap.locations.filter((l) => !l.position);

  return (
    <div className="relative h-full w-full">
      <MapStage image={image ?? islandMap.image} fallbackClassName="fill-stone-700" label={`${place?.islandName ?? ""} 지도`}>
        {(stage) => (
          <>
            {islandMap.paths.map((p) => {
              const a = byId.get(p.from)?.position;
              const b = byId.get(p.to)?.position;
              if (!a || !b) return null;
              const from = stage.at(a);
              const to = stage.at(b);
              return (
                <line
                  key={`${p.from}>${p.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  strokeWidth={stage.unit * 0.4}
                  strokeDasharray={p.locked ? `${stage.unit} ${stage.unit * 0.8}` : undefined}
                  className="stroke-white/60"
                />
              );
            })}
            {islandMap.locations
              .filter((l) => l.position)
              .map((l) => (
                <Marker key={l.id} stage={stage} point={l.position!} label={l.name} tone={tone(l.id, l.current, l.visited)} onSelect={go(l.id)} />
              ))}
          </>
        )}
      </MapStage>
      {unplaced.length > 0 ? (
        <Unplaced title="지도에 없는 지역">
          {unplaced.map((l) => (
            <button key={l.id} className={chipClass} disabled={!go(l.id)} onClick={go(l.id)}>
              {l.name}
              {l.current ? " · 현재" : ""}
            </button>
          ))}
        </Unplaced>
      ) : null}
    </div>
  );
}
