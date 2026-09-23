import Link from "next/link";
import { islands } from "@/lib/islands.generated";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">코디세이아</h1>
      <p className="mt-2 text-zinc-500">섬 목록 · 게임 중이면 파티가 있는 섬으로 이어집니다</p>
      {islands.length === 0 ? (
        <p className="mt-8 text-zinc-500">
          아직 섬이 없습니다. <code>islands/&lt;섬_id&gt;/</code>를 만들고{" "}
          <code>npm run sync:islands -w web</code>를 실행하세요.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {islands.map((island) => (
            <li key={island.id} className="flex flex-wrap items-baseline gap-x-3">
              {island.playable ? (
                <Link href={`/islands/${island.id}`} className="underline underline-offset-4">
                  {island.name}
                </Link>
              ) : (
                <span className="text-zinc-400">{island.name}</span>
              )}
              <span className="text-xs text-zinc-500">{island.playable ? `/islands/${island.id}` : "준비 중"}</span>
              {island.problems.length + island.warnings.length > 0 ? (
                <ul className="mt-1 w-full list-disc pl-5 text-xs">
                  {island.problems.map((p) => (
                    <li key={p} className="text-zinc-500">
                      {p}
                    </li>
                  ))}
                  {island.warnings.map((w) => (
                    <li key={w} className="text-amber-600">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
