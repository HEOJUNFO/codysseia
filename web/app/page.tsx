import Link from "next/link";
import { islandIds } from "@/lib/islands.generated";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">코디세이아</h1>
      <p className="mt-2 text-zinc-500">웹 페이지가 있는 섬</p>
      {islandIds.length === 0 ? (
        <p className="mt-8 text-zinc-500">
          아직 없습니다. <code>islands/&lt;섬_id&gt;/web/page.tsx</code>를 만들고{" "}
          <code>npm run sync:islands</code>를 실행하세요.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {islandIds.map((id) => (
            <li key={id}>
              <Link href={`/islands/${id}`} className="underline underline-offset-4">
                /islands/{id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
