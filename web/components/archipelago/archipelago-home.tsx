"use client";

// 메인 화면 = 군도 지도 (대전제 8.7). 섬 위 단계는 군도 하나뿐이다.
// 등록된 모든 섬을 각자의 archipelago_position 에 보여준다. 준비 중인 섬도 자리를 차지한다.
// 게임 상태는 바꾸지 않는다. 플레이는 /islands/<섬_id> 코어 틀에서 한다.

import Link from "next/link";
import { useState } from "react";
import { MapStage, Marker, Unplaced, chipClass, type MarkerTone } from "@/components/play/map-stage";
import type { IslandEntry } from "@/lib/islands.generated";
import { formatHours } from "@/lib/play/time";

export type HomeIsland = IslandEntry & {
  /** 파티가 있는 섬에서 이 섬까지 항해 시간. 파티가 없거나, 파티가 있는 섬이거나, 준비 중이면 null */
  hours: number | null;
};

export type HomeParty = { islandId: string; islandName: string; time: number } | null;

export function ArchipelagoHome({ islands, party }: { islands: HomeIsland[]; party: HomeParty }) {
  const [selectedId, setSelectedId] = useState<string | null>(party?.islandId ?? null);
  const selected = islands.find((i) => i.id === selectedId) ?? null;
  const placed = islands.filter((i) => i.position);
  const unplaced = islands.filter((i) => !i.position);
  const playable = islands.filter((i) => i.playable);

  const tone = (i: HomeIsland): MarkerTone => (i.id === party?.islandId ? "current" : i.playable ? "open" : "unknown");
  const label = (i: HomeIsland) => (i.id === party?.islandId ? `${i.name} · 파티` : i.playable ? i.name : `${i.name} · 준비 중`);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <main className="relative min-h-0 flex-1 bg-black" data-slot="archipelago">
        <MapStage image={null} fallbackClassName="fill-sky-950" label="군도 지도">
          {(stage) =>
            placed.map((i) => (
              <Marker
                key={i.id}
                stage={stage}
                point={i.position!}
                label={label(i)}
                tone={tone(i)}
                selected={i.id === selectedId}
                onSelect={() => setSelectedId(i.id)}
              />
            ))
          }
        </MapStage>
        {islands.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-300">
            아직 섬이 없습니다. 오른쪽 안내대로 첫 섬을 만들어 보세요.
          </p>
        ) : null}
        {unplaced.length > 0 ? (
          <Unplaced title="위치 없음">
            {unplaced.map((i) => (
              <button key={i.id} className={chipClass} onClick={() => setSelectedId(i.id)}>
                {i.name}
              </button>
            ))}
          </Unplaced>
        ) : null}
      </main>

      <aside className="flex max-h-[55dvh] flex-col gap-5 overflow-y-auto border-t border-zinc-200 p-4 md:max-h-none md:w-80 md:border-l md:border-t-0 dark:border-zinc-800">
        <header>
          <h1 className="text-2xl font-semibold">코디세이아</h1>
          <p className="mt-1 text-xs text-zinc-500">
            군도 · 섬 {islands.length}개 (플레이 가능 {playable.length}개)
          </p>
        </header>

        {party ? (
          <Link
            href={`/islands/${party.islandId}`}
            className="rounded bg-amber-500 px-3 py-2 text-center text-sm font-medium text-black hover:bg-amber-400"
          >
            이어하기 · {party.islandName}
            <span className="block text-xs font-normal">게임 시간 {party.time > 0 ? `${formatHours(party.time)} 경과` : "시작"}</span>
          </Link>
        ) : playable.length > 0 ? (
          <Link
            href={`/islands/${playable[0].id}`}
            className="rounded bg-amber-500 px-3 py-2 text-center text-sm font-medium text-black hover:bg-amber-400"
          >
            게임 시작
          </Link>
        ) : null}

        {selected ? <IslandCard island={selected} party={party} /> : <p className="text-sm text-zinc-500">지도에서 섬을 고르면 소개가 나옵니다.</p>}

        {islands.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">섬 목록</h2>
            <ul className="mt-2 space-y-1">
              {islands.map((i) => (
                <li key={i.id}>
                  <button
                    className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${i.id === selectedId ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}
                    onClick={() => setSelectedId(i.id)}
                  >
                    <span className={i.playable ? "" : "text-zinc-400"}>{i.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {i.id === party?.islandId ? "파티" : !i.playable ? "준비 중" : i.hours !== null ? formatHours(i.hours) : ""}
                      {i.warnings.length > 0 ? <span className="text-amber-600"> · 경고</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-auto rounded border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">
          <h2 className="font-semibold text-zinc-600 dark:text-zinc-300">섬 추가하기</h2>
          <p className="mt-1">
            <code>islands/&lt;섬_id&gt;/</code> 폴더를 만들고 <code>island.yaml</code>의 <code>archipelago_position</code>으로 이 지도 위 자리를
            고릅니다. 양식은 <code>docs/01_섬_제작_템플릿.md</code>, 예시는 <code>islands/ash_harbor/</code>.
          </p>
          <p className="mt-1">
            새 섬을 만든 뒤 <code>npm run sync:islands -w web</code>
          </p>
        </section>
      </aside>
    </div>
  );
}

function IslandCard({ island, party }: { island: HomeIsland; party: HomeParty }) {
  const status = island.id === party?.islandId ? "파티가 여기 있다" : island.playable ? "플레이 가능" : "준비 중";
  const rows: [string, string | null][] = [
    ["제작", island.author],
    ["분위기", island.tone],
    ["추천 레벨", island.recommendedLevel],
    ["항해", island.hours !== null && party ? `${party.islandName}에서 ${formatHours(island.hours)}` : null],
  ];

  return (
    <section className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{island.name}</h2>
        <span className={`shrink-0 text-xs ${island.playable ? "text-sky-600" : "text-zinc-500"}`}>{status}</span>
      </div>
      {island.concept ? <p className="mt-2 text-sm">{island.concept}</p> : null}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {island.problems.length + island.warnings.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-xs">
          {island.problems.map((p) => (
            <li key={p} className="text-zinc-500">
              {p}
            </li>
          ))}
          {island.warnings.map((w) => (
            <li key={w} className="text-amber-600">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
