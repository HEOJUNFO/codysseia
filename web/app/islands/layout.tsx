// /islands/<섬_id> 플레이 화면의 코어 틀. 섬 장면은 (generated)/ 에서 들어온다.

import { connection } from "next/server";
import { PlayFrame } from "@/components/play/play-frame";
import { PlayProvider } from "@/lib/play/provider";
import { getSnapshot } from "@/lib/play/session";

export default async function IslandsLayout({ children }: { children: React.ReactNode }) {
  await connection(); // 엔진 상태는 요청마다 읽는다
  return (
    <PlayProvider initial={getSnapshot()}>
      <PlayFrame>{children}</PlayFrame>
    </PlayProvider>
  );
}
