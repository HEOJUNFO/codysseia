"use client";

import { useGameState, useMove } from "@/lib/play/provider";

const chip =
  "rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

export function LocationPanel() {
  const { place, moves, pending, inCombat } = useGameState();
  const move = useMove();
  if (!place) return <p className="p-3 text-sm text-zinc-500">플레이할 수 있는 섬이 없다.</p>;

  return (
    <div className="space-y-4 p-3">
      <section>
        <div className="text-xs text-zinc-500">{place.islandName}</div>
        <div className="text-base font-semibold">{place.locationName}</div>
        {inCombat ? <div className="mt-1 text-xs text-rose-500">전투 중 — 지점 이동만 가능</div> : null}
      </section>

      {moves.spots.length > 0 ? (
        <Section title="지점">
          {moves.spots.map((s) => (
            <button key={s.id} className={chip} disabled={pending} onClick={() => move.toSpot(s.id)}>
              {s.name}
            </button>
          ))}
        </Section>
      ) : null}

      {moves.locations.length > 0 ? (
        <Section title="이동">
          {moves.locations.map((l) => (
            <button
              key={l.id}
              className={chip}
              disabled={pending || l.locked}
              title={l.locked ? "잠김" : undefined}
              onClick={() => move.toLocation(l.id)}
            >
              {l.name}
              {l.locked ? " · 잠김" : ""}
            </button>
          ))}
        </Section>
      ) : null}

      {moves.islands.length > 0 ? (
        <Section title="다른 섬으로">
          {moves.islands.map((i) => (
            <button
              key={i.id}
              className={chip}
              disabled={pending || i.locked}
              title={i.locked ? "아직 들어갈 수 없다" : undefined}
              onClick={() => move.toIsland(i.id)}
            >
              {i.name}
              {i.locked ? " · 잠김" : ""}
            </button>
          ))}
        </Section>
      ) : null}
    </div>
  );
}
