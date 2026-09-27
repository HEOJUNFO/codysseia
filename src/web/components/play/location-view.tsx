"use client";

// 현장 뷰: 현재 지역의 배경 위에 지점과 캐릭터 말을 그린다 (대전제 8.7).
// 지점을 누르면 본인 캐릭터가 그 지점으로 간다.

import { useGameState, useMove, usePlayIdentity } from "@/lib/play/provider";
import { chipClass, MapStage, Marker, Unplaced } from "./map-stage";

export function LocationView({ image }: { /** 기본값: 지역 yaml 의 image */ image?: string }) {
  const { locationView, party, pending, place, turn } = useGameState();
  const move = useMove();
  const characterId = usePlayIdentity().characterId;
  const canMove = !pending && (turn.mode === "free" || turn.activeCharacterId === characterId);
  const movers = [characterId];
  const placed = locationView.spots.filter((s) => s.position);
  const unplacedSpots = locationView.spots.filter((s) => !s.position);
  const idle = party.filter((c) => !c.spotId || !placed.some((s) => s.id === c.spotId));

  return (
    <div className="relative h-full w-full bg-[#0b1d22]">
      <MapStage image={image ?? locationView.image} fallbackClassName="fill-[#17313a]" label={`${place?.locationName ?? ""} 현장`}>
        {(stage) =>
          placed.map((spot) => {
            const here = party.filter((c) => c.spotId === spot.id);
            const { x, y } = stage.at(spot.position!);
            const u = stage.unit;
            return (
              <g key={spot.id}>
                <Marker
                  stage={stage}
                  point={spot.position!}
                  label={spot.name}
                  tone={here.length > 0 ? "current" : "open"}
                  onSelect={canMove ? () => move.toSpot(spot.id, movers) : undefined}
                />
                {here.map((c, i) => (
                  <g key={c.id} transform={`translate(${x + (i - (here.length - 1) / 2) * u * 3} ${y + u * 3})`}>
                    <circle r={u * 1.2} className={c.id === characterId ? "fill-amber-300" : "fill-white"} />
                    <text textAnchor="middle" dy="0.35em" fontSize={u * 1.3} className="fill-zinc-900 font-semibold">
                      {c.name.slice(0, 1)}
                    </text>
                  </g>
                ))}
              </g>
            );
          })
        }
      </MapStage>

      {locationView.spots.length > 0 ? <div className="absolute right-3 top-3 rounded-sm bg-black/50 px-3 py-2 text-xs text-white">내 캐릭터 · {party.find((character) => character.id === characterId)?.name}</div> : null}

      {locationView.spots.length > 0 && unplacedSpots.length + idle.length > 0 ? (
        <Unplaced title="지점">
          {unplacedSpots.map((s) => (
            <button key={s.id} className={chipClass} disabled={!canMove} onClick={() => move.toSpot(s.id, movers)}>
              {s.name}
              {party.some((c) => c.spotId === s.id) ? ` · ${party.filter((c) => c.spotId === s.id).map((c) => c.name).join(", ")}` : ""}
            </button>
          ))}
          {idle.length > 0 ? <span className="ml-auto text-zinc-300">지점 밖: {idle.map((c) => c.name).join(", ")}</span> : null}
        </Unplaced>
      ) : null}
    </div>
  );
}
