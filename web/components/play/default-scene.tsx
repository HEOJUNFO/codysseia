// 전용 장면(islands/<섬_id>/web/page.tsx)이 없는 섬에 쓰는 코어 기본 장면.

export function DefaultScene({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-300 dark:from-zinc-900 dark:to-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{name}</h1>
    </div>
  );
}
