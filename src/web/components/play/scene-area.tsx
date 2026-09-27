"use client";

// 장면 영역: 섬 장면(children) + 섬 지도·군도 지도 겹쳐 보기 (대전제 8.7) + 섬 간 항해 연출 (8.6).
// 지도는 연 자리에서만 보인다. 이동해서 지역이 바뀌면 저절로 닫힌다.

import Link from "next/link";
import { useState } from "react";
import { useGameState } from "@/lib/play/provider";
import { ArchipelagoMap } from "./archipelago-map";
import { IslandMap } from "./island-map";
import { VoyageOverlay } from "./voyage-overlay";
import styles from "./play-ui.module.css";

type Overlay = { kind: "island" | "archipelago"; at: string | undefined };

export function SceneArea({ children }: { children: React.ReactNode }) {
  const { place } = useGameState();
  const here = place?.locationId;
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const open = overlay && overlay.at === here ? overlay.kind : null;
  const toggle = (kind: Overlay["kind"]) => setOverlay(open === kind ? null : { kind, at: here });

  return (
    <main className={styles.scene} data-slot="scene">
      {children}
      {open ? (
        <div className={styles.overlay}>
          {open === "island" ? <IslandMap /> : <ArchipelagoMap />}
        </div>
      ) : null}
      <VoyageOverlay />
      <nav className={styles.sceneNav}>
        <Link href="/rooms">
          멀티플레이
        </Link>
        <button className={open === "island" ? styles.active : ""} onClick={() => toggle("island")}>
          섬 지도
        </button>
        <button className={open === "archipelago" ? styles.active : ""} onClick={() => toggle("archipelago")}>
          군도 지도
        </button>
      </nav>
    </main>
  );
}
