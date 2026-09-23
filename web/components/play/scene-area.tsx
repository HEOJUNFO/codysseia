"use client";

// 장면 영역: 섬 장면(children) + 섬 지도·군도 지도 겹쳐 보기 (대전제 8.7).
// 지도는 연 자리에서만 보인다. 이동해서 지역이 바뀌면 저절로 닫힌다.

import Link from "next/link";
import { useState } from "react";
import { useGameState } from "@/lib/play/provider";
import { ArchipelagoMap } from "./archipelago-map";
import { IslandMap } from "./island-map";

type Overlay = { kind: "island" | "archipelago"; at: string | undefined };

const button = "rounded bg-black/40 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/60";

export function SceneArea({ children }: { children: React.ReactNode }) {
  const { place } = useGameState();
  const here = place?.locationId;
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const open = overlay && overlay.at === here ? overlay.kind : null;
  const toggle = (kind: Overlay["kind"]) => setOverlay(open === kind ? null : { kind, at: here });

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden" data-slot="scene">
      {children}
      {open ? (
        <div className="absolute inset-0 z-10 bg-black/85 pt-10">
          {open === "island" ? <IslandMap /> : <ArchipelagoMap />}
        </div>
      ) : null}
      <nav className="absolute left-3 top-3 z-20 flex gap-1.5">
        <Link href="/" className={button}>
          섬 목록
        </Link>
        <button className={`${button} ${open === "island" ? "ring-1 ring-white" : ""}`} onClick={() => toggle("island")}>
          섬 지도
        </button>
        <button className={`${button} ${open === "archipelago" ? "ring-1 ring-white" : ""}`} onClick={() => toggle("archipelago")}>
          군도 지도
        </button>
      </nav>
    </main>
  );
}
