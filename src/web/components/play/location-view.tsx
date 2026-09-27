"use client";

// 현장 뷰: 현재 지역의 배경 위에 지점과 캐릭터 말을 그린다 (대전제 8.7).
// 지점을 누르면 선택한 캐릭터(없으면 파티 전원)가 그 지점으로 간다.

import { useState } from "react";
import { useGameState, useMove } from "@/lib/play/provider";
import { chipClass, MapStage, Marker, Unplaced } from "./map-stage";

export function LocationView({ image }: { /** 기본값: 지역 yaml 의 image */ image?: string }) {
  const { locationView, party, pending, place } = useGameState();
  const move = useMove();
  const [selected, setSelected] = useState<string | null>(null);
  const movers = selected ? [selected] : undefined;
  const placed = locationView.spots.filter((s) => s.position);
  const unplacedSpots = locationView.spots.filter((s) => !s.position);
  const idle = party.filter((c) => !c.spotId || !placed.some((s) => s.id === c.spotId));

  return (
    <div className="relative h-full w-full bg-zinc-900">
      <MapStage image={image ?? locationView.image} fallbackClassName="fill-zinc-800" label={`${place?.locationName ?? ""} 현장`}>
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
                  onSelect={pending ? undefined : () => move.toSpot(spot.id, movers)}
                />
                {here.map((c, i) => (
                  <g key={c.id} transform={`translate(${x + (i - (here.length - 1) / 2) * u * 3} ${y + u * 3})`}>
                    <circle r={u * 1.2} className={c.id === selected ? "fill-amber-300" : "fill-white"} />
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

      {locationView.spots.length > 0 ? (
        <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5 text-xs text-white">
          <span className="self-center text-zinc-300">움직일 캐릭터</span>
          <button className={`${chipClass} ${selected === null ? "bg-white/20" : ""}`} onClick={() => setSelected(null)}>
            파티 전원
          </button>
          {party.map((c) => (
            <button
              key={c.id}
              className={`${chipClass} ${selected === c.id ? "bg-white/20" : ""}`}
              onClick={() => setSelected(selected === c.id ? null : c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {locationView.spots.length > 0 && unplacedSpots.length + idle.length > 0 ? (
        <Unplaced title="지점">
          {unplacedSpots.map((s) => (
            <button key={s.id} className={chipClass} disabled={pending} onClick={() => move.toSpot(s.id, movers)}>
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
