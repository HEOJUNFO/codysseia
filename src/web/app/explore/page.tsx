"use client";

import { RoomArchipelago } from "@/components/archipelago/room-archipelago";
import { PlayProvider } from "@/lib/play/provider";

export default function Explore() {
  return <PlayProvider><RoomArchipelago /></PlayProvider>;
}
