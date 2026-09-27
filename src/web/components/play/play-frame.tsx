// 코어 틀: 섬 장면 영역 + 위치·이동 + 파티 상태 + GM 로그·행동 입력 (대전제 8.5).
// 섬 장면(children)은 장면 영역을 꽉 채우는 크기로 들어온다. 섬은 h-full 로 채우면 된다.

import { ActionInput } from "./action-input";
import { GMLog } from "./gm-log";
import { LocationPanel } from "./location-panel";
import { PartyStatus } from "./party-status";
import { SceneArea } from "./scene-area";

export function PlayFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:grid-rows-[minmax(0,1fr)_18rem]">
      <SceneArea>{children}</SceneArea>
      <aside className="max-h-56 overflow-y-auto border-t border-zinc-200 md:row-span-2 md:max-h-none md:border-l md:border-t-0 dark:border-zinc-800">
        <LocationPanel />
        <div className="border-t border-zinc-200 dark:border-zinc-800" />
        <PartyStatus />
      </aside>
      <section className="flex h-64 flex-col border-t border-zinc-200 md:col-start-1 md:row-start-2 md:h-auto dark:border-zinc-800">
        <GMLog />
        <ActionInput />
      </section>
    </div>
  );
}
