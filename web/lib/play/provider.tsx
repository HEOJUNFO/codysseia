"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { islands } from "@/lib/islands.generated";
import { entry, initialMockState, mockGmReply } from "./mock";
import type { GameState } from "./types";

type PlayContextValue = {
  state: GameState;
  sendAction: (text: string) => void;
};

const PlayContext = createContext<PlayContextValue | null>(null);

function islandFromPath(pathname: string): string {
  return pathname.split("/")[2] ?? "";
}

export function PlayProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const urlIsland = islandFromPath(pathname);
  const [state, setState] = useState(() => initialMockState(urlIsland));
  const timers = useRef<number[]>([]);

  // 가짜 상태 전용: 주소창으로 섬을 옮기면 위치도 따라간다.
  // 엔진이 붙으면 위치는 엔진만 바꾸므로 이 블록은 없앤다.
  const [prevUrlIsland, setPrevUrlIsland] = useState(urlIsland);
  if (urlIsland !== prevUrlIsland) {
    setPrevUrlIsland(urlIsland);
    setState((s) =>
      s.location.islandId === urlIsland ? s : { ...s, location: { islandId: urlIsland, locationId: null } },
    );
  }

  // 엔진이 파티를 다른 섬으로 옮기면(move_party) 화면도 그 섬으로 간다 (대전제 8.5).
  const islandId = state.location.islandId;
  useEffect(() => {
    if (islandId && islandId !== islandFromPath(window.location.pathname)) {
      router.push(`/islands/${islandId}`);
    }
  }, [islandId, router]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const sendAction = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;

    const move = /^\/move\s+([a-z][a-z0-9_]*)$/.exec(text);
    if (move && !islands.some((i) => i.id === move[1] && i.playable)) {
      setState((s) => ({ ...s, log: [...s.log, entry("system", `move_party 거부 — ${move[1]}은(는) 플레이할 수 없는 섬`)] }));
      return;
    }
    if (move) {
      setState((s) => ({
        ...s,
        location: { islandId: move[1], locationId: null },
        log: [...s.log, entry("system", `move_party → ${move[1]}`)],
      }));
      return;
    }

    setState((s) => ({ ...s, pending: true, log: [...s.log, entry("player", text)] }));
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, pending: false, log: [...s.log, entry("gm", mockGmReply(text))] }));
    }, 600);
    timers.current.push(timer);
  }, []);

  return <PlayContext.Provider value={{ state, sendAction }}>{children}</PlayContext.Provider>;
}

function usePlay(): PlayContextValue {
  const ctx = useContext(PlayContext);
  if (!ctx) throw new Error("@codysseia/play 훅은 /islands 플레이 화면 안에서만 쓸 수 있다.");
  return ctx;
}

/** 현재 게임 상태 (읽기 전용). */
export function useGameState(): GameState {
  return usePlay().state;
}

/** 플레이어 행동을 GM·엔진에 보낸다. 장면에서 지도를 클릭하는 것도 이걸로 보낸다. */
export function useSendAction(): (text: string) => void {
  return usePlay().sendAction;
}
