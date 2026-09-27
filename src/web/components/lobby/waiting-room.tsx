"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { islands } from "@/lib/islands.generated";
import type { LobbyChange, MemberInfo, RoomInfo } from "@/lib/lobby/types";
import { RevisionStream } from "@/lib/revision-stream";
import { LobbyIcon } from "./lobby-icon";
import { LobbyShell } from "./lobby-shell";
import styles from "./lobby.module.css";

type RoomDetails = { room: RoomInfo; self: MemberInfo; code?: string; addresses: string[] };
type Snapshot = { type: "snapshot"; seq: number; room: RoomInfo; members: MemberInfo[]; selfId: string; code?: string };

function updateMembers(current: MemberInfo[], change: LobbyChange): MemberInfo[] {
  if (change.type === "member_left") return current.filter((member) => member.id !== change.memberId);
  if (change.type === "room_closed" || change.type === "game_started") return current;
  const index = current.findIndex((member) => member.id === change.member.id);
  if (index === -1) return [...current, change.member];
  return current.map((member) => member.id === change.member.id ? change.member : member);
}

export function WaitingRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = String(params.roomId ?? "");
  const socketRef = useRef<WebSocket | null>(null);
  const [details, setDetails] = useState<RoomDetails | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/lobby/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "방에 들어갈 수 없습니다.");
        return result as RoomDetails;
      })
      .then((result) => { if (active) { setDetails(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "방에 들어갈 수 없습니다."); });
    return () => { active = false; };
  }, [roomId]);

  const hasDetails = Boolean(details);
  useEffect(() => {
    if (!hasDetails || closed) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/lobby?room=${encodeURIComponent(roomId)}`);
    socketRef.current = socket;
    const apply = (change: LobbyChange) => {
      if (change.type === "room_closed") setClosed(true);
      else if (change.type === "game_started") {
        setDetails((current) => current ? { ...current, room: change.room } : current);
        router.replace(`/explore?room=${encodeURIComponent(roomId)}`);
      }
      else setMembers((current) => updateMembers(current, change));
    };
    const stream = new RevisionStream<LobbyChange>(
      (change) => change.seq,
      apply,
      (from, to) => socket.send(JSON.stringify({ type: "replay", from, to })),
      () => setError("받지 못한 상태가 너무 많습니다. 다시 연결해 주세요."),
    );
    socket.onopen = () => { setConnected(true); setError(""); };
    socket.onmessage = (event) => {
      let message: Snapshot | LobbyChange | { type: "replay_error" } | { type: "command_error"; error: string };
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "snapshot") {
        stream.reset(message.seq);
        setMembers(message.members);
        setDetails((current) => current ? { ...current, room: message.room, code: message.code ?? current.code } : current);
        if (message.room.phase === "playing") router.replace(`/explore?room=${encodeURIComponent(roomId)}`);
        return;
      }
      if (message.type === "command_error") { setError(message.error); return; }
      if (message.type === "replay_error") {
        setError("방 상태 이력을 복구하지 못했습니다. 다시 연결해 주세요.");
        return;
      }
      if (!("seq" in message) || !Number.isInteger(message.seq)) return;
      stream.accept(message);
    };
    socket.onclose = (event) => {
      setConnected(false);
      if (event.reason === "left room") router.replace("/rooms");
      else if (!closed && event.reason !== "room closed") setError("연결이 끊겼습니다. 다시 연결을 누르세요.");
    };
    socket.onerror = () => setError("대기실 연결에 실패했습니다.");
    return () => { socket.close(); if (socketRef.current === socket) socketRef.current = null; };
  }, [hasDetails, roomId, generation, closed, router]);

  const send = (message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setNotice("복사했습니다."); }
    catch { setNotice("복사할 수 없습니다. 표시된 값을 직접 선택해 주세요."); }
  };
  const self = members.find((member) => member.id === details?.self.id) ?? details?.self;
  const room = details?.room;
  const island = islands.find((entry) => entry.id === room?.islandId);
  const orderedMembers = [...members].sort((a, b) => a.role === b.role ? a.name.localeCompare(b.name) : a.role === "host" ? -1 : 1);
  const invitation = details?.addresses[0] ? `${details.addresses[0]}/rooms/join?room=${roomId}` : "";
  const canStart = connected && members.length > 0 && members.every((member) => member.role === "host" || (member.online && member.ready));

  return (
    <LobbyShell current="rooms">
      <main className={styles.pageMain}>
        <Link href="/rooms" className={styles.backLink}><LobbyIcon name="back" size={18} /> 멀티플레이</Link>
        <div className={styles.pageHeading}><div><p className={styles.sectionHint}>WAITING ROOM</p><h1>{room?.name ?? "대기실"}</h1></div><div className={styles.headingEmblem}><LobbyIcon name="users" size={34} /></div></div>
        {error && !details ? <div className={styles.formPanel}><p className={styles.formError} role="alert">{error}</p><Link href="/rooms/join" className={styles.primaryButton}>방 참가로 이동</Link></div> : null}
        {details ? <div className={styles.waitingGrid}>
          <section className={styles.rosterPanel} aria-labelledby="roster-title">
            <div className={styles.saveHeader}><div><span className={styles.eyebrow}>PARTY</span><h2 id="roster-title">참가자</h2></div><span className={styles.saveCount}>{members.filter((member) => member.online).length} / {room?.capacity}</span></div>
            <ul className={styles.rosterList}>
              {orderedMembers.map((member, index) => <li key={member.id} className={styles.rosterMember}>
                <span className={styles.rosterNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.rosterName}>{member.name}<small>{member.role === "host" ? "HOST" : member.id === self?.id ? "YOU" : "PLAYER"}</small></span>
                <span className={member.online ? styles.memberOnline : styles.memberOffline}>{member.online ? member.role === "host" ? "대기 중" : member.ready ? "준비 완료" : "대기 중" : "연결 끊김"}</span>
                {self?.role === "host" && member.role !== "host" ? <button type="button" className={styles.rosterKick} onClick={() => send({ type: "kick", memberId: member.id })} aria-label={`${member.name} 내보내기`}>내보내기</button> : null}
              </li>)}
              {Array.from({ length: Math.max(0, (room?.capacity ?? 0) - members.length) }, (_, index) => <li key={`empty-${index}`} className={styles.rosterEmpty}><span className={styles.rosterNumber}>{String(members.length + index + 1).padStart(2, "0")}</span><span>빈 자리</span></li>)}
            </ul>
            <div className={styles.rosterBottom}><span className={styles.statusDot} /> {closed ? "방이 종료되었습니다." : connected ? "연결됨" : "연결 안 됨"}{error ? <span role="alert"> · {error}</span> : null}</div>
          </section>
          <aside className={styles.roomSide} aria-label="방 정보">
            <span className={styles.eyebrow}>ROOM INFO</span>
            <h2>{island?.name ?? room?.islandId}</h2>
            <dl className={styles.roomStats}><div><dt>방 상태</dt><dd>{closed ? "종료" : "대기 중"}</dd></div><div><dt>참가 인원</dt><dd>{members.filter((member) => member.online).length} / {room?.capacity}</dd></div></dl>
            {self?.role === "host" && !closed ? <div className={styles.inviteInfo}><span>방 코드</span><div><strong>{details.code}</strong><button type="button" onClick={() => void copy(details.code ?? "")}>복사</button></div><span>같은 네트워크 접속 주소</span><div><code>{invitation || "내부 IP 주소 없음"}</code>{invitation ? <button type="button" onClick={() => void copy(invitation)}>복사</button> : null}</div><p>다른 네트워크의 참가자에게는 공개 IP:포트와 방 코드를 전달하세요.</p></div> : <p className={styles.roomSideNote}>호스트가 게임을 시작할 때까지 대기합니다.</p>}
            {notice ? <p className={styles.copyNotice} role="status">{notice}</p> : null}
            <div className={styles.waitingActions}>
              {!closed && self?.role === "host" ? <button type="button" className={styles.primaryButton} disabled={!canStart} onClick={() => send({ type: "start_game" })}>게임 시작</button> : null}
              {!closed && self?.role === "player" ? <button type="button" className={styles.primaryButton} disabled={!connected} onClick={() => send({ type: "ready", ready: !self.ready })}>{self.ready ? "준비 취소" : "준비 완료"}</button> : null}
              {!closed && self?.role === "host" ? <button type="button" className={styles.dangerButton} disabled={!connected} onClick={() => { if (window.confirm("방을 닫을까요?")) send({ type: "close_room" }); }}>방 닫기</button> : null}
              {!closed && self?.role === "player" ? <button type="button" className={styles.dangerButton} disabled={!connected} onClick={() => send({ type: "leave" })}>방 나가기</button> : null}
              {!closed && !connected ? <button type="button" className={styles.secondaryButton} onClick={() => { setError(""); setGeneration((value) => value + 1); }}>다시 연결</button> : null}
              {closed ? <Link href="/rooms" className={styles.primaryButton}>멀티플레이</Link> : null}
            </div>
          </aside>
        </div> : null}
      </main>
    </LobbyShell>
  );
}
