"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { selectMemberRoom } from "@/lib/lobby/select-room";
import type { LocalRooms } from "@/lib/lobby/types";
import { RevisionStream } from "@/lib/revision-stream";
import { applyIslandPatch } from "../../../protocol/island-state";
import { GAME_PROTOCOL_VERSION } from "../../../protocol/play";
import type { DeepReadonly, GameChange, GameCommand, GameResumeMessage, GameSnapshotMessage, GameState, JsonObject, JsonValue, MoveRequest, RoomGameState, TurnState } from "./types";

type Mover = {
  toLocation: (locationId: string) => void;
  toSpot: (spotId: string | null, characterIds?: string[]) => void;
  toIsland: (islandId: string) => void;
};

type PlayContextValue = {
  state: GameState;
  sendAction: (text: string) => void;
  sendIslandAction: (action: string, payload: JsonValue) => void;
  endTurn: () => void;
  passBatch: () => void;
  proceedBatch: () => void;
  move: Mover;
  identity: { roomId: string; role: "host" | "player"; characterId: string };
};

type LobbySnapshot = {
  type: "snapshot";
  room: { id: string; phase: "waiting" | "playing" };
  selfId: string;
  members: { id: string; role: "host" | "player" }[];
};

const PlayContext = createContext<PlayContextValue | null>(null);
const outdatedHostMessage = "호스트가 이전 버전으로 실행 중입니다. 호스트를 재시작하고 새 방을 열어주세요.";
// 명령 ID는 중복 적용 방지용이다. HTTP로 접속한 LAN 브라우저에서도 생성할 수 있어야 한다.
const commandPrefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let commandSequence = 0;

function nextCommandId(): string {
  return `${commandPrefix}-${(++commandSequence).toString(36)}`;
}

function hasCurrentGameState(value: unknown): value is RoomGameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RoomGameState>;
  const turn = state.turn;
  return Boolean(state.islandState && typeof state.gmThinking === "boolean" && state.batch !== undefined && turn && (
    turn.mode === "free" ||
    (turn.mode === "ordered" && Number.isInteger(turn.round) && Array.isArray(turn.order) && typeof turn.activeCharacterId === "string")
  ));
}

/** 묶음·GM 턴 진행은 어떤 변경분에든 실릴 수 있다. 실린 필드만 바꾼다 */
function applyChange(state: RoomGameState, change: GameChange): RoomGameState {
  const next = applyStateChange(state, change);
  if (change.batch === undefined && change.gmThinking === undefined) return next;
  return { ...next, batch: change.batch === undefined ? next.batch : change.batch, gmThinking: change.gmThinking ?? next.gmThinking };
}

function applyStateChange(state: RoomGameState, change: GameChange): RoomGameState {
  if (change.kind === "flow") return state;
  if (change.kind === "spot") {
    return {
      ...state,
      party: state.party.map((character) => character.id === change.characterId ? { ...character, spotId: change.spotId } : character),
    };
  }
  if (change.kind === "scene") {
    const islandChanged = state.place?.islandId !== change.place.islandId;
    const islandMap = change.map.kind === "full" ? change.map.value : {
      ...state.islandMap,
      locations: [
        ...state.islandMap.locations.map((location) =>
          location.id === state.place?.locationId || location.id === change.place.locationId
            ? { ...location, current: location.id === change.place.locationId, visited: location.visited || location.id === change.place.locationId }
            : location,
        ),
        ...change.map.locationsAdded,
      ],
      paths: change.map.pathsAdded.length ? [...state.islandMap.paths, ...change.map.pathsAdded] : state.islandMap.paths,
    };
    return {
      ...state,
      party: state.party.map((character) => character.spotId === null ? character : { ...character, spotId: null }),
      place: change.place,
      moves: change.moves,
      visited: change.visitedAdded.length ? [...state.visited, ...change.visitedAdded] : state.visited,
      discovered: change.discoveredAdded.length ? [...state.discovered, ...change.discoveredAdded] : state.discovered,
      archipelago: islandChanged ? state.archipelago.map((island) => ({ ...island, current: island.id === change.place.islandId })) : state.archipelago,
      islandMap,
      locationView: change.locationView,
      time: change.time ?? state.time,
      voyage: change.voyage ?? state.voyage,
      islandState: change.islandState ?? state.islandState,
      turn: change.turn ?? state.turn,
      log: change.logEntries.length ? [...state.log, ...change.logEntries] : state.log,
    };
  }
  if (change.kind === "island_patch") {
    let islandState = state.islandState;
    for (const patch of change.patches) islandState = applyIslandPatch(islandState, patch);
    return { ...state, islandState, turn: change.turn ?? state.turn, log: change.logEntries.length ? [...state.log, ...change.logEntries] : state.log };
  }
  if (change.kind === "turn") return { ...state, turn: change.turn };
  return { ...state, log: [...state.log, ...change.logEntries] };
}

export function PlayProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const requestedRoomId = useSearchParams().get("room");
  const [snapshot, setSnapshot] = useState<RoomGameState | null>(null);
  const [identity, setIdentity] = useState<PlayContextValue["identity"] | null>(null);
  const [connected, setConnected] = useState(false);
  const [synchronizing, setSynchronizing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<RoomGameState | null>(null);
  const roomRef = useRef<string | null>(null);
  const lastRevision = useRef(0);
  const pendingCommands = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let disposed = false;
    const publish = (state: RoomGameState) => { snapshotRef.current = state; setSnapshot(state); };
    const stream = new RevisionStream<GameChange>(
      (change) => change.revision,
      (change) => {
        const current = snapshotRef.current;
        if (!current) { setError("게임 상태를 받지 못했습니다. 새 상태를 요청하세요."); return; }
        publish(applyChange(current, change));
        lastRevision.current = change.revision;
      },
      (from, to) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "game_replay", from, to }));
      },
      () => setError("누락된 상태가 너무 많습니다. 새 상태를 요청하세요."),
      lastRevision.current,
    );

    fetch("/api/lobby/local", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("방 정보를 불러오지 못했습니다.");
        return response.json() as Promise<LocalRooms>;
      })
      .then((status) => {
        if (disposed) return;
        const room = selectMemberRoom(status.rooms, requestedRoomId);
        if (!room) { router.replace("/rooms"); return; }
        if (room.phase !== "playing") { router.replace(`/rooms/${room.id}`); return; }
        const resumeRevision = roomRef.current === room.id && snapshotRef.current ? lastRevision.current : null;
        if (roomRef.current !== room.id) {
          roomRef.current = room.id;
          snapshotRef.current = null;
          setSnapshot(null);
          setIdentity(null);
          lastRevision.current = 0;
          stream.reset(0);
        }
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const query = new URLSearchParams({ room: room.id });
        if (resumeRevision !== null) query.set("revision", String(resumeRevision));
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/lobby?${query}`);
        socketRef.current = socket;
        socket.onopen = () => { if (!disposed) { setConnected(true); setError(""); } };
        socket.onmessage = (event) => {
          if (disposed) return;
          let message: Record<string, unknown>;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === "snapshot") {
            const lobby = message as LobbySnapshot;
            if (lobby.room.phase !== "playing") { router.replace(`/rooms/${lobby.room.id}`); return; }
            const member = lobby.members.find((entry) => entry.id === lobby.selfId);
            if (member) setIdentity((current) => ({ roomId: lobby.room.id, role: member.role, characterId: current?.characterId ?? "" }));
          } else if (message.type === "game_snapshot") {
            if (message.protocolVersion !== GAME_PROTOCOL_VERSION || !hasCurrentGameState(message.state)) {
              snapshotRef.current = null;
              setSnapshot(null);
              setError(outdatedHostMessage);
              return;
            }
            const initial = message as GameSnapshotMessage;
            lastRevision.current = initial.revision;
            stream.reset(initial.revision);
            setSynchronizing(false);
            publish(initial.state);
            setIdentity((current) => current ? { ...current, characterId: initial.selfCharacterId } : null);
          } else if (message.type === "game_resumed") {
            if (message.protocolVersion !== GAME_PROTOCOL_VERSION || !hasCurrentGameState(snapshotRef.current)) {
              snapshotRef.current = null;
              setSnapshot(null);
              setError(outdatedHostMessage);
              return;
            }
            const resumed = message as GameResumeMessage;
            setIdentity((current) => current ? { ...current, characterId: resumed.selfCharacterId } : null);
            if (!snapshotRef.current) setError("이전 게임 상태가 없습니다. 새 상태를 요청하세요.");
            else {
              setSynchronizing(resumed.revision > lastRevision.current);
              stream.catchUp(resumed.revision);
            }
          } else if (message.type === "game_changed") {
            stream.accept(message as GameChange);
            setSynchronizing(!stream.caughtUp);
          } else if (message.type === "game_replay_error") {
            setError("변경 이력을 복구하지 못했습니다. 새 상태를 요청하세요.");
          } else if (message.type === "game_command_result") {
            pendingCommands.current.delete(String(message.commandId));
            setPending(pendingCommands.current.size > 0);
            if (!message.ok) setError(String(message.error ?? "명령을 처리하지 못했습니다."));
          } else if (message.type === "room_closed") {
            router.replace("/rooms");
          }
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (disposed) return;
          setConnected(false);
          pendingCommands.current.clear();
          setPending(false);
          setError("연결이 끊겼습니다. 다시 연결하세요.");
        };
        socket.onerror = () => { if (!disposed) setError("게임 서버에 연결하지 못했습니다."); };
      })
      .catch((cause) => { if (!disposed && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "방에 연결하지 못했습니다."); });
    return () => {
      disposed = true;
      controller.abort();
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [generation, router, requestedRoomId]);

  useEffect(() => {
    const islandId = snapshot?.place?.islandId;
    if (pathname.startsWith("/islands/") && islandId && pathname.split("/")[2] !== islandId && identity?.roomId) {
      router.replace(`/islands/${islandId}?room=${encodeURIComponent(identity.roomId)}`);
    }
  }, [pathname, router, snapshot?.place?.islandId, identity?.roomId]);

  const send = useCallback((command: GameCommand) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { setError("게임 서버와 연결되지 않았습니다."); return; }
    if (synchronizing) { setError("게임 상태를 동기화하고 있습니다."); return; }
    const commandId = nextCommandId();
    pendingCommands.current.add(commandId);
    setPending(true);
    setError("");
    socket.send(JSON.stringify({ type: "game_command", commandId, command }));
  }, [synchronizing]);

  const reconnect = (fresh = false) => {
    if (fresh) { snapshotRef.current = null; setSnapshot(null); lastRevision.current = 0; }
    setError("");
    setGeneration((value) => value + 1);
  };

  if (!snapshot || !identity?.characterId || (requestedRoomId && identity.roomId !== requestedRoomId)) return (
    <main className="grid min-h-dvh place-content-center gap-5 bg-[#071316] px-6 text-center text-[#efece1]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">게임에 연결하는 중</h1>
      {error ? <p role="alert" className="text-sm text-amber-200">{error}</p> : <p className="text-sm text-[#aebdb9]">방의 현재 상태를 받고 있습니다.</p>}
      {error && error !== outdatedHostMessage ? <button className="rounded bg-[#d9bc82] px-5 py-3 text-[#172322]" onClick={() => reconnect(true)}>새 상태 받기</button> : null}
      <Link href="/rooms" className="text-sm text-[#aebdb9]">멀티플레이로 돌아가기</Link>
    </main>
  );

  const move = (request: MoveRequest) => send({ kind: "move", request });
  const value: PlayContextValue = {
    state: { ...snapshot, pending: pending || synchronizing || !connected },
    identity,
    sendAction: (text) => { if (text.trim()) send({ kind: "act", text }); },
    sendIslandAction: (action, payload) => send({ kind: "island", action, payload }),
    endTurn: () => send({ kind: "end_turn" }),
    passBatch: () => send({ kind: "pass" }),
    proceedBatch: () => send({ kind: "proceed" }),
    move: {
      toLocation: (locationId) => move({ kind: "location", locationId }),
      toSpot: (spotId, characterIds) => move({ kind: "spot", spotId, characterIds: characterIds?.length ? characterIds : [identity.characterId] }),
      toIsland: (islandId) => move({ kind: "island", islandId }),
    },
  };

  return (
    <PlayContext.Provider value={value}>
      {children}
      {error || !connected ? <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-4 bg-[#291e1b] p-3 text-sm text-[#ffe0ba]" role="alert">
        <span>{error || "게임 서버 연결 중"}</span>
        <button className="rounded bg-[#d9bc82] px-3 py-1.5 font-semibold text-[#172322]" onClick={() => reconnect(error.includes("이력") || error.includes("새 상태"))}>{error.includes("이력") || error.includes("새 상태") ? "새 상태 받기" : "다시 연결"}</button>
      </div> : null}
    </PlayContext.Provider>
  );
}

function usePlay(): PlayContextValue {
  const context = useContext(PlayContext);
  if (!context) throw new Error("@codysseia/play 훅은 방에서 시작한 게임 화면에서만 쓸 수 있습니다.");
  return context;
}

export function useGameState(): DeepReadonly<GameState> { return usePlay().state; }
export function useSendAction(): (text: string) => void { return usePlay().sendAction; }
export function useMove(): Mover { return usePlay().move; }
export function usePlayIdentity(): PlayContextValue["identity"] { return usePlay().identity; }
export function useIslandAction(): PlayContextValue["sendIslandAction"] { return usePlay().sendIslandAction; }
export function useTurnState(): TurnState { return usePlay().state.turn; }
export function useEndTurn(): () => void { return usePlay().endTurn; }
/** 코어 틀 전용. 섬 장면에는 공개하지 않는다 */
export function useBatchSignals(): Pick<PlayContextValue, "passBatch" | "proceedBatch"> {
  const { passBatch, proceedBatch } = usePlay();
  return { passBatch, proceedBatch };
}
export function useIslandPlayerState(characterId?: string): DeepReadonly<JsonObject> | null {
  const { state, identity } = usePlay();
  return state.islandState.players[characterId ?? identity.characterId] ?? null;
}
