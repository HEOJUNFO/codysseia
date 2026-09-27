"use client";

import { Suspense } from "react";
import { RoomArchipelago } from "@/components/archipelago/room-archipelago";
import { PlayProvider } from "@/lib/play/provider";

export default function Explore() {
  return <Suspense fallback={<main>게임 상태 연결 중</main>}><PlayProvider><RoomArchipelago /></PlayProvider></Suspense>;
}
