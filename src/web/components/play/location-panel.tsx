"use client";

import { useGameState, useMove, usePlayIdentity } from "@/lib/play/provider";
import { formatHours } from "@/lib/play/time";
import styles from "./play-ui.module.css";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.moveSection}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.chipList}>{children}</div>
    </section>
  );
}

export function LocationPanel() {
  const { place, moves, pending, inCombat, time } = useGameState();
  const move = useMove();
  const canLead = usePlayIdentity().role === "host";
  if (!place) return <p>플레이할 수 있는 섬이 없다.</p>;

  return (
    <div className={styles.sidebarSection}>
      <section className={styles.placeHeader}>
        <small>{place.islandName}</small>
        <h2>{place.locationName}</h2>
        <p>게임 시간 {time > 0 ? `${formatHours(time)} 경과` : "시작"}</p>
        {inCombat ? <p className={styles.combat}>전투 중 — 지점 이동만 가능</p> : null}
      </section>

      {moves.spots.length > 0 ? (
        <Section title="지점">
          {moves.spots.map((s) => (
            <button key={s.id} className={styles.chip} disabled={pending} onClick={() => move.toSpot(s.id)}>
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
              className={styles.chip}
              disabled={pending || l.locked || !canLead}
              title={!canLead ? "파티 이동은 호스트가 결정합니다." : l.locked ? "잠김" : undefined}
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
              className={styles.chip}
              disabled={pending || i.locked || !canLead}
              title={!canLead ? "항해는 호스트가 결정합니다." : i.locked ? "아직 들어갈 수 없다" : `항해 ${formatHours(i.hours)}`}
              onClick={() => move.toIsland(i.id)}
            >
              {i.name} · {formatHours(i.hours)}
              {i.locked ? " · 잠김" : ""}
            </button>
          ))}
        </Section>
      ) : null}
    </div>
  );
}
