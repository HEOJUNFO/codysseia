"use client";

import { useState } from "react";
import { useGameState, useSendAction } from "@/lib/play/provider";

export function ActionInput() {
  const [text, setText] = useState("");
  const { pending } = useGameState();
  const send = useSendAction();

  return (
    <form
      className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !text.trim()) return;
        send(text);
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="무엇을 하시겠습니까?"
        aria-label="행동 입력"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        행동
      </button>
    </form>
  );
}
