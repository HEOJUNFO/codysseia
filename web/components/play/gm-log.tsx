"use client";

import { useEffect, useRef } from "react";
import { useGameState } from "@/lib/play/provider";

const ROLE_STYLE = {
  gm: "text-zinc-900 dark:text-zinc-100",
  player: "text-sky-700 dark:text-sky-300",
  system: "text-xs text-zinc-500",
} as const;

export function GMLog() {
  const { log, pending } = useGameState();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length, pending]);

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm leading-relaxed" aria-live="polite">
      {log.map((e) => (
        <p key={e.id} className={ROLE_STYLE[e.role]}>
          {e.role === "player" ? <span className="mr-1 select-none">›</span> : null}
          {e.text}
        </p>
      ))}
      {pending ? <p className="text-zinc-400">GM이 생각하는 중…</p> : null}
      <div ref={end} />
    </div>
  );
}
