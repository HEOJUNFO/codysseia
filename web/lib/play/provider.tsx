"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { moveAction, sendActionAction } from "./actions";
import type { GameState, MoveRequest } from "./types";

type Mover = {
  /** 같은 섬의 연결된 지역으로 파티 이동 */
  toLocation: (locationId: string) => void;
  /** 지역 안 지점으로 캐릭터 이동. characterIds 를 비우면 파티 전원 */
  toSpot: (spotId: string | null, characterIds?: string[]) => void;
  /** 다른 섬으로 파티 이동 (출발 지역에서만) */
  toIsland: (islandId: string) => void;
};

type PlayContextValue = {
  state: GameState;
  sendAction: (text: string) => void;
  move: Mover;
};

const PlayContext = createContext<PlayContextValue | null>(null);

function islandFromPath(pathname: string): string {
  return pathname.split("/")[2] ?? "";
}

export function PlayProvider({ initial, children }: { initial: GameState; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, startTransition] = useTransition();

  // 화면은 엔진 위치를 따라간다 (대전제 8.5). 주소창으로 다른 섬에 들어가도 파티가 있는 섬으로 돌아온다.
  const islandId = snapshot.place?.islandId;
  useEffect(() => {
    if (islandId && islandId !== islandFromPath(pathname)) router.replace(`/islands/${islandId}`);
  }, [islandId, pathname, router]);

  const run = useCallback((call: () => Promise<GameState>) => {
    startTransition(async () => {
      const next = await call();
      setSnapshot(next);
    });
  }, []);

  const value = useMemo<PlayContextValue>(() => {
    const request = (req: MoveRequest) => run(() => moveAction(req));
    return {
      state: { ...snapshot, pending },
      sendAction: (text) => {
        if (text.trim()) run(() => sendActionAction(text));
      },
      move: {
        toLocation: (locationId) => request({ kind: "location", locationId }),
        toSpot: (spotId, characterIds) =>
          request({ kind: "spot", spotId, characterIds: characterIds?.length ? characterIds : snapshot.party.map((c) => c.id) }),
        toIsland: (islandId) => request({ kind: "island", islandId }),
      },
    };
  }, [snapshot, pending, run]);

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
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

/** 플레이어 행동을 GM·엔진에 보낸다. */
export function useSendAction(): (text: string) => void {
  return usePlay().sendAction;
}

/** 이동. 엔진이 조건을 판정해 바로 옮기고, GM 은 도착을 묘사한다 (대전제 8.6). */
export function useMove(): Mover {
  return usePlay().move;
}
