import Link from "next/link";
import { islands } from "@/lib/islands.generated";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">코디세이아</h1>
      <p className="mt-2 text-zinc-500">섬 목록</p>
      {islands.length === 0 ? (
        <p className="mt-8 text-zinc-500">
          아직 섬이 없습니다. <code>islands/&lt;섬_id&gt;/island.yaml</code>을 만들고{" "}
          <code>npm run sync:islands -w web</code>를 실행하세요.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {islands.map((island) => (
            <li key={island.id} className="flex items-baseline gap-3">
              <Link href={`/islands/${island.id}`} className="underline underline-offset-4">
                {island.name}
              </Link>
              <span className="text-xs text-zinc-500">
                /islands/{island.id}
                {island.hasScene ? "" : " · 기본 장면"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
