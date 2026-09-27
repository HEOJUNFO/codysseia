// 메인 화면: 군도 지도 (대전제 8.7). 섬 목록과 파티 위치를 보여주고 플레이 화면으로 이어준다.

import { connection } from "next/server";
import { voyageHours } from "@codysseia/engine";
import { ArchipelagoHome, type HomeIsland, type HomeParty } from "@/components/archipelago/archipelago-home";
import { islands } from "@/lib/islands.generated";
import { peekParty } from "@/lib/play/session";

export default async function Home() {
  await connection(); // 파티 위치는 요청마다 읽는다
  const found = peekParty();
  const partyIsland = islands.find((i) => i.id === found?.islandId);
  const party: HomeParty = found && partyIsland ? { ...found, islandName: partyIsland.name } : null;
  const from = partyIsland?.position;

  const entries: HomeIsland[] = islands.map((i) => ({
    ...i,
    hours: from && i.position && i.playable && i.id !== partyIsland?.id ? voyageHours(from, i.position) : null,
  }));
  return <ArchipelagoHome islands={entries} party={party} />;
}
