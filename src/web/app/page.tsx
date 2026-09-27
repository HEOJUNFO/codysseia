"use client";

// 대전제 8.7: 메인 화면은 군도 지도다. 방 입장은 /rooms에서 한다.
import { Suspense, useEffect, useState } from "react";
import { ArchipelagoHome, type HomeIsland } from "@/components/archipelago/archipelago-home";
import { RoomArchipelago } from "@/components/archipelago/room-archipelago";
import { islands } from "@/lib/islands.generated";
import { selectMemberRoom } from "@/lib/lobby/select-room";
import type { LocalRooms } from "@/lib/lobby/types";
import { PlayProvider } from "@/lib/play/provider";

const entries: HomeIsland[] = islands.map((island) => ({ ...island, hours: null }));

export default function Home() {
  const [inGame, setInGame] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/lobby/local", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((status: LocalRooms) => {
        const room = selectMemberRoom(status.rooms, new URLSearchParams(window.location.search).get("room"));
        setInGame(room?.phase === "playing");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (inGame) return <Suspense fallback={<main>게임 상태 연결 중</main>}><PlayProvider><RoomArchipelago /></PlayProvider></Suspense>;
  return <ArchipelagoHome islands={entries} party={null} canLead={false} travelOptions={[]} onTravel={() => {}} pending={false} />;
}
