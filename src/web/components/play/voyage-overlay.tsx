"use client";

// 섬 간 항해 연출 (대전제 8.6). 게임 안 시간은 엔진이 이미 흘렸다.
// 화면은 군도 지도 위로 배가 건너가는 모습을 거리에 비례한 몇 초 동안 보여준다.
// 코어 틀(레이아웃)에 붙어 있어 섬 페이지가 바뀌어도 끊기지 않는다.

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "@/lib/play/provider";
import { formatHours } from "@/lib/play/time";
import type { ArchipelagoIsland, Voyage } from "@/lib/play/types";
import { MapStage, Marker } from "./map-stage";

/** 화면 연출 길이(ms). 군도 지도 거리에 비례하고 1.5~5초 */
function playMs(v: Voyage): number {
  const distance = Math.hypot(v.to.position.x - v.from.position.x, v.to.position.y - v.from.position.y);
  return Math.min(5000, Math.max(1500, distance * 50));
}

/** 도착한 뒤 잠깐 머무는 시간(ms) */
const HOLD_MS = 700;

export function VoyageOverlay() {
  const { voyage, archipelago } = useGameState();
  // 화면을 열었을 때 이미 끝난 항해는 다시 보여주지 않는다.
  const [doneId, setDoneId] = useState(voyage?.id ?? 0);
  const id = voyage?.id ?? 0;
  const finish = useCallback(() => setDoneId(id), [id]);
  if (!voyage || voyage.id === doneId) return null;
  return <Playback key={voyage.id} voyage={voyage} islands={archipelago} onDone={finish} />;
}

function Playback({ voyage, islands, onDone }: { voyage: Voyage; islands: ArchipelagoIsland[]; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const ms = playMs(voyage);

  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = now - start;
      setProgress(Math.min(1, elapsed / ms));
      if (elapsed < ms + HOLD_MS) frame = requestAnimationFrame(tick);
      else onDone();
    });
    return () => cancelAnimationFrame(frame);
  }, [ms, onDone]);

  const { from, to } = voyage;
  const eased = 1 - (1 - progress) ** 2;
  const ship = { x: from.position.x + (to.position.x - from.position.x) * eased, y: from.position.y + (to.position.y - from.position.y) * eased };
  const arrived = progress >= 1;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-zinc-950 text-white" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <div className="text-xs text-zinc-400">항해</div>
          <div className="text-lg font-semibold">
            {from.name} → {to.name}
          </div>
        </div>
        <div className="text-right font-mono text-sm tabular-nums">
          {arrived ? "도착" : formatHours(Math.round(voyage.hours * eased))} <span className="text-zinc-500">/ {formatHours(voyage.hours)}</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <MapStage image={null} fallbackClassName="fill-sky-950" label={`${from.name}에서 ${to.name}(으)로 항해`}>
          {(stage) => {
            const a = stage.at(from.position);
            const b = stage.at(to.position);
            const s = stage.at(ship);
            const u = stage.unit;
            return (
              <>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={u * 0.3} strokeDasharray={`${u} ${u * 0.8}`} className="stroke-sky-300/50" />
                <line x1={a.x} y1={a.y} x2={s.x} y2={s.y} strokeWidth={u * 0.4} className="stroke-amber-300" />
                {islands.map((i) => (
                  <Marker
                    key={i.id}
                    stage={stage}
                    point={i.position}
                    label={i.name}
                    tone={i.id === to.id ? (arrived ? "current" : "open") : "idle"}
                  />
                ))}
                <circle cx={s.x} cy={s.y} r={u * 1} strokeWidth={u * 0.3} className="fill-amber-300 stroke-white" />
              </>
            );
          }}
        </MapStage>
      </div>
      <button className="self-end px-4 pb-4 pt-2 text-xs text-zinc-400 hover:text-white" onClick={onDone}>
        건너뛰기
      </button>
    </div>
  );
}
