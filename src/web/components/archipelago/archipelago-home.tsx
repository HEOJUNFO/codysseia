"use client";

import Link from "next/link";
import { useState } from "react";
import { MapStage, Marker, Unplaced, chipClass, type MarkerTone } from "@/components/play/map-stage";
import type { IslandEntry } from "@/lib/islands.generated";
import type { Moves } from "@/lib/play/types";
import { formatHours } from "@/lib/play/time";
import styles from "./archipelago-home.module.css";

export type HomeIsland = IslandEntry & { hours: number | null };
export type HomeParty = { islandId: string; islandName: string; time: number } | null;

export function ArchipelagoHome({ islands, party, roomId, canLead, travelOptions, onTravel, pending }: {
  islands: HomeIsland[];
  party: HomeParty;
  roomId?: string;
  canLead: boolean;
  travelOptions: ReadonlyArray<Readonly<Moves["islands"][number]>>;
  onTravel: (islandId: string) => void;
  pending: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(party?.islandId ?? islands.find((island) => island.playable)?.id ?? null);
  const selected = islands.find((island) => island.id === selectedId) ?? null;
  const placed = islands.filter((island) => island.position);
  const unplaced = islands.filter((island) => !island.position);
  const playableCount = islands.filter((island) => island.playable).length;
  const tone = (island: HomeIsland): MarkerTone => island.id === party?.islandId ? "current" : island.playable ? "open" : "unknown";

  return (
    <div className={styles.shell}>
      <main className={styles.map} data-slot="archipelago">
        <div className={styles.mapWash} />
        <MapStage image={null} fallbackClassName="fill-transparent" label="군도 지도">
          {(stage) => placed.map((island) => (
            <Marker key={island.id} stage={stage} point={island.position!} label={island.id === party?.islandId ? `${island.name} · 파티` : island.name} tone={tone(island)} selected={island.id === selectedId} onSelect={() => setSelectedId(island.id)} />
          ))}
        </MapStage>
        <div className={styles.mapHeader}>
          <Link href="/rooms" className={styles.back}>← 멀티플레이</Link>
          <div><span className={styles.kicker}>CODYSSEIA</span><h1>군도 지도</h1><p>가고 싶은 섬을 선택하세요</p></div>
        </div>
        {islands.length === 0 ? <p className={styles.empty}>아직 발견된 섬이 없습니다.</p> : null}
        {unplaced.length > 0 ? <Unplaced title="위치 미정">{unplaced.map((island) => <button key={island.id} className={chipClass} onClick={() => setSelectedId(island.id)}>{island.name}</button>)}</Unplaced> : null}
        <div className={styles.mapFoot}>발견된 섬 {islands.length} · 입장 가능 {playableCount}</div>
      </main>
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}><span className={styles.kicker}>목적지 선택</span><h2>항해를 시작하세요</h2><p>지도 또는 아래 목록에서 섬을 고를 수 있습니다.</p></div>
        {selected ? <IslandDetail island={selected} party={party} roomId={roomId} canLead={canLead} travel={travelOptions.find((option) => option.id === selected.id)} onTravel={onTravel} pending={pending} /> : <p className={styles.noSelection}>섬을 선택하면 이곳에 정보가 표시됩니다.</p>}
        <div className={styles.islandList} aria-label="섬 목록">
          {islands.map((island) => (
            <button key={island.id} type="button" className={`${styles.islandItem} ${island.id === selectedId ? styles.islandItemActive : ""}`} onClick={() => setSelectedId(island.id)} aria-pressed={island.id === selectedId}>
              <span>{island.name}</span><small>{island.id === party?.islandId ? "현재 위치" : island.playable ? island.hours !== null ? formatHours(island.hours) : "입장 가능" : "준비 중"}</small>
            </button>
          ))}
        </div>
        {party ? <p className={styles.partyNote}>파티 위치 · {party.islandName} · {party.time > 0 ? formatHours(party.time) : "시작"}</p> : null}
      </aside>
    </div>
  );
}

function IslandDetail({ island, party, roomId, canLead, travel, onTravel, pending }: {
  island: HomeIsland;
  party: HomeParty;
  roomId?: string;
  canLead: boolean;
  travel: Moves["islands"][number] | undefined;
  onTravel: (islandId: string) => void;
  pending: boolean;
}) {
  const current = island.id === party?.islandId;
  const details: [string, string | null][] = [["제작", island.author], ["분위기", island.tone], ["추천 레벨", island.recommendedLevel], ["항해", island.hours !== null && party ? formatHours(island.hours) : null]];
  return (
    <section className={styles.detail} aria-live="polite">
      <span className={styles.status}>{current ? "파티가 머무는 섬" : island.playable ? "탐험 가능한 섬" : "준비 중"}</span>
      <h3>{island.name}</h3>
      {island.concept ? <p className={styles.concept}>{island.concept}</p> : null}
      <dl className={styles.meta}>{details.filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
      {current ? <Link href={`/islands/${island.id}${roomId ? `?room=${encodeURIComponent(roomId)}` : ""}`} className={styles.enter}>탐험 이어하기<span aria-hidden="true">↗</span></Link>
        : island.playable && canLead && travel && !travel.locked ? <button type="button" className={styles.enter} disabled={pending} onClick={() => onTravel(island.id)}>항해하기 · {formatHours(travel.hours)}<span aria-hidden="true">↗</span></button>
        : <p className={styles.unavailable}>{!island.playable ? "아직 입장할 수 없습니다." : !canLead ? "호스트가 항해를 결정합니다." : travel?.locked ? "아직 항해할 수 없습니다." : "출발 지점에서 항해할 수 있습니다."}</p>}
      {island.problems.length + island.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {island.problems.map((problem) => <li key={`problem:${problem}`}>{problem}</li>)}
          {island.warnings.map((warning) => <li key={`warning:${warning}`}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
