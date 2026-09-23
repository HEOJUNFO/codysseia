// 코어 틀: 섬 장면 영역 + 파티 상태 + GM 로그·행동 입력 (대전제 8.5).
// 섬 장면(children)은 장면 영역을 꽉 채우는 크기로 들어온다. 섬은 h-full 로 채우면 된다.

import Link from "next/link";
import { ActionInput } from "./action-input";
import { GMLog } from "./gm-log";
import { PartyStatus } from "./party-status";

export function PlayFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:grid-rows-[minmax(0,1fr)_18rem]">
      <main className="relative min-h-0 flex-1 overflow-hidden" data-slot="scene">
        {children}
        <Link
          href="/"
          className="absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/60"
        >
          섬 목록
        </Link>
      </main>
      <aside className="max-h-40 overflow-y-auto border-t border-zinc-200 md:row-span-2 md:max-h-none md:border-l md:border-t-0 dark:border-zinc-800">
        <PartyStatus />
      </aside>
      <section className="flex h-64 flex-col border-t border-zinc-200 md:col-start-1 md:row-start-2 md:h-auto dark:border-zinc-800">
        <GMLog />
        <ActionInput />
      </section>
    </div>
  );
}
