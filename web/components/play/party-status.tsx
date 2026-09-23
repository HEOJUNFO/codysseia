"use client";

import { useGameState } from "@/lib/play";

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="text-xs">
      <div className="flex justify-between text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums">
          {value}/{max}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PartyStatus() {
  const { party, inventory } = useGameState();
  return (
    <div className="space-y-4 p-3">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">파티</h2>
        <ul className="mt-2 space-y-3">
          {party.map((c) => (
            <li key={c.id}>
              <div className="text-sm font-medium">{c.name}</div>
              <div className="mt-1 space-y-1">
                <Meter label="HP" value={c.hp} max={c.maxHp} color="bg-rose-500" />
                <Meter label="정신력" value={c.mind} max={c.maxMind} color="bg-indigo-500" />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">인벤토리</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {inventory.map((item) => (
            <li key={item.id} className="flex justify-between">
              <span>{item.name}</span>
              <span className="tabular-nums text-zinc-500">×{item.qty}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
