// /islands/<섬_id> 플레이 화면의 코어 틀. 섬 장면은 (generated)/ 에서 들어온다.

import { PlayFrame } from "@/components/play/play-frame";
import { PlayProvider } from "@/lib/play/provider";

export default function IslandsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayProvider>
      <PlayFrame>{children}</PlayFrame>
    </PlayProvider>
  );
}
