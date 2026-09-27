"use client";

import { useEffect, useRef } from "react";
import { useGameState } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

const ROLE_STYLE = {
  gm: styles.gm,
  player: styles.player,
  system: styles.system,
} as const;

export function GMLog() {
  const { log, gmThinking } = useGameState();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length, gmThinking]);

  return (
    <div className={styles.log} aria-live="polite">
      {log.map((e) => (
        <p key={e.id} className={ROLE_STYLE[e.role]}>
          {e.role === "player" ? <span className="mr-1 select-none">›</span> : null}
          {e.text}
        </p>
      ))}
      {gmThinking ? <p className={styles.system}>GM이 생각하는 중…</p> : null}
      <div ref={end} />
    </div>
  );
}
