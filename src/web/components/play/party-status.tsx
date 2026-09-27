"use client";

import { useGameState } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.meter}>
      <div className={styles.meterLabel}>
        <span>{label}</span>
        <span className="tabular-nums">
          {value}/{max}
        </span>
      </div>
      <div className={styles.meterTrack}>
        <div className={`${styles.meterFill} ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PartyStatus() {
  const { party, inventory, moves } = useGameState();
  const spotName = (id: string | null) => moves.spots.find((s) => s.id === id)?.name;
  return (
    <div className={styles.sidebarSection}>
      <section>
        <h2 className={styles.sectionTitle}>파티</h2>
        <ul className="m-0 list-none p-0">
          {party.map((c) => (
            <li key={c.id} className={styles.character}>
              <div className={styles.characterName}>
                <span>{c.name}</span>
                {spotName(c.spotId) ? <small>{spotName(c.spotId)}</small> : null}
              </div>
              <div>
                <Meter label="HP" value={c.hp} max={c.maxHp} color={styles.hp} />
                <Meter label="정신력" value={c.mind} max={c.maxMind} color={styles.mind} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.moveSection}>
        <h2 className={styles.sectionTitle}>인벤토리</h2>
        <ul className={styles.inventory}>
          {inventory.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <span>×{item.qty}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
