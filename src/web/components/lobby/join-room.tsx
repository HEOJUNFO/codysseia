"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { islands } from "@/lib/islands.generated";
import type { RoomInfo } from "@/lib/lobby/types";
import { LobbyIcon } from "./lobby-icon";
import { LobbyShell } from "./lobby-shell";
import styles from "./lobby.module.css";

function hostOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function JoinRoom({ invitedRoom, initialError }: { invitedRoom: string; initialError: string }) {
  const [hostAddress, setHostAddress] = useState("");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState(invitedRoom);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState(initialError);
  const origin = hostOrigin(hostAddress);

  useEffect(() => {
    if (!invitedRoom && !initialError) return;
    const controller = new AbortController();
    fetch("/api/lobby/local", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((result: { room: RoomInfo | null }) => {
        setHostAddress(window.location.origin);
        if (invitedRoom) setCurrentRoom(result.room);
      })
      .catch(() => { if (!controller.signal.aborted) setHostAddress(window.location.origin); });
    return () => controller.abort();
  }, [invitedRoom, initialError]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (origin === null) {
      event.preventDefault();
      setError("호스트 IP 또는 주소를 확인해 주세요.");
    } else {
      setError("");
    }
  };

  const displayRoom = currentRoom && (!roomId || roomId === currentRoom.id) ? currentRoom : null;
  const island = islands.find((entry) => entry.id === displayRoom?.islandId);
  const action = origin ? `${origin}/api/lobby/join-form` : "/api/lobby/join-form";

  return (
    <LobbyShell current="join">
      <main className={styles.pageMain}>
        <Link href="/rooms" className={styles.backLink}><LobbyIcon name="back" size={18} /> 멀티플레이</Link>
        <div className={styles.pageHeading}><div><p className={styles.sectionHint}>JOIN GAME</p><h1>방 참가</h1></div><div className={styles.headingEmblem}><LobbyIcon name="link" size={35} /></div></div>
        <div className={styles.setupGrid}>
          <form className={styles.formPanel} action={action} method="POST" onSubmit={onSubmit}>
            <div className={styles.formIntro}><span className={styles.formStep}>02</span><div><h2>접속 정보</h2></div></div>
            <div className={styles.formFields}><div className={`${styles.field} ${styles.fieldWide}`}>
              <label htmlFor="host-address">호스트 IP 또는 주소</label>
              <input id="host-address" type="text" inputMode="url" value={hostAddress} onChange={(event) => { setHostAddress(event.target.value); setRoomId(""); setCurrentRoom(null); }} required placeholder="예: 192.168.0.12:3000" />
              <p className={styles.fieldHelp}>같은 네트워크에서는 내부 IP, 인터넷에서는 공개 IP:포트 또는 터널 주소를 입력합니다.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="room-code">방 코드</label>
              <input id="room-code" name="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={8} autoCapitalize="characters" autoComplete="off" required placeholder="8자리 코드" />
            </div>
            <div className={styles.field}>
              <label htmlFor="player-name">내 이름</label>
              <input id="player-name" name="name" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} required placeholder="플레이어 이름" />
            </div></div>
            <input type="hidden" name="roomId" value={roomId} />
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.formFooter}><button className={styles.primaryButton} type="submit">방 입장 <LobbyIcon name="arrow" size={19} /></button><Link href="/rooms" className={styles.secondaryTextButton}>취소</Link></div>
          </form>
          <aside className={styles.joinAside} aria-label="선택한 방">
            <div className={styles.joinAsideTop}><LobbyIcon name="users" size={28} /><span>CONNECTION</span></div>
            <h2>{displayRoom?.name ?? "호스트에 접속"}</h2>
            <div className={styles.previewDivider} />
            <dl className={styles.roomStats}><div><dt>시작 섬</dt><dd>{island?.name ?? displayRoom?.islandId ?? "입장 후 표시"}</dd></div><div><dt>현재 인원</dt><dd>{displayRoom ? `${displayRoom.onlineCount} / ${displayRoom.capacity}` : "—"}</dd></div><div><dt>방 코드</dt><dd>호스트에게 확인</dd></div></dl>
            <div className={styles.joinAsideRule}><LobbyIcon name="lock" size={19} /><span>온라인 IP 접속에는 호스트의 포트 개방 또는 터널 주소가 필요합니다.</span></div>
          </aside>
        </div>
      </main>
    </LobbyShell>
  );
}
