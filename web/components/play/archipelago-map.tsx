"use client";

// 군도 지도 (코어 소유, 대전제 8.7). 섬 위치는 각 섬의 archipelago_position.
// 출발 지역에 있을 때만 다른 섬을 눌러 건너갈 수 있다.

import { useGameState, useMove } from "@/lib/play/provider";
import { MapStage, Marker, type MarkerTone } from "./map-stage";

export function ArchipelagoMap() {
  const { archipelago, moves, pending } = useGameState();
  const move = useMove();
  const travel = new Map(moves.islands.map((i) => [i.id, i.locked]));

  const tone = (id: string, current: boolean): MarkerTone => {
    if (current) return "current";
    if (travel.has(id)) return travel.get(id) ? "locked" : "open";
    return "idle";
  };

  return (
    <div className="relative h-full w-full">
      <MapStage image={null} fallbackClassName="fill-sky-950" label="군도 지도">
        {(stage) =>
          archipelago.map((i) => (
            <Marker
              key={i.id}
              stage={stage}
              point={i.position}
              label={i.name}
              tone={tone(i.id, i.current)}
              onSelect={!pending && travel.get(i.id) === false ? () => move.toIsland(i.id) : undefined}
            />
          ))
        }
      </MapStage>
      {moves.islands.length === 0 ? (
        <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-xs text-zinc-200">
          항구·포털 같은 출발 지역에서만 다른 섬으로 건너갈 수 있다.
        </p>
      ) : null}
    </div>
  );
}
