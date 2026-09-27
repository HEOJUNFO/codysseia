"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { islands } from "@/lib/islands.generated";
import type { LocalRoom, LocalRooms } from "@/lib/lobby/types";
import { LobbyIcon } from "./lobby-icon";
import { LobbyShell } from "./lobby-shell";
import styles from "./lobby.module.css";

function roomHref(room: LocalRoom): string {
  if (room.isMember) return room.phase === "playing" ? `/explore?room=${encodeURIComponent(room.id)}` : `/rooms/${room.id}`;
  return `/rooms/join?room=${encodeURIComponent(room.id)}`;
}

export function RoomDashboard() {
  const [local, setLocal] = useState<LocalRooms | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/lobby/local", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("방 정보를 불러오지 못했습니다.");
        return response.json() as Promise<LocalRooms>;
      })
      .then(setLocal)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "방 정보를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, []);

  const rooms = local?.rooms ?? [];

  return (
    <LobbyShell current="rooms">
      <main className={styles.main}>
        <div className={styles.gameTitle}><h1>멀티플레이</h1></div>
        <div className={styles.lobbyGrid}>
          <section className={styles.gameMenu} aria-label="협동 플레이 메뉴">
            {local?.canHost === true
              ? <Link href="/rooms/new" className={styles.menuItem}><span className={styles.menuItemText}><strong>방 만들기</strong></span><LobbyIcon name="arrow" size={20} /></Link>
              : <button type="button" className={styles.menuUnavailable} disabled><span className={styles.menuItemText}><strong>방 만들기</strong><small>{local?.canHost === false ? "호스트 PC에서만 가능" : error ? "호스트 확인 실패" : "호스트 확인 중"}</small></span></button>}
            <Link href="/rooms/join" className={styles.menuItem}><span className={styles.menuItemText}><strong>IP로 참가</strong></span><LobbyIcon name="arrow" size={20} /></Link>
            <Link href="/" className={styles.menuItem}><span className={styles.menuItemText}><strong>군도 지도</strong></span><LobbyIcon name="arrow" size={20} /></Link>
            <p className={styles.menuFoot}><span className={styles.statusDot} /> 호스트 주소와 방 코드로 연결</p>
          </section>

          <section className={styles.savePanel} aria-labelledby="connection-title">
            <div className={styles.saveHeader}><h2 id="connection-title">직접 연결</h2></div>
            <p className={styles.connectIntro}>호스트에게 IP 주소와 방 코드를 받아 입력하세요. 같은 네트워크에서도, 인터넷에서도 접속 방법은 같습니다.</p>
            <Link href="/rooms/join" className={styles.connectAction}>호스트 IP 입력하기 <LobbyIcon name="arrow" size={18} /></Link>
            <p className={styles.connectHint}>같은 네트워크: 호스트의 내부 IP:포트<br />인터넷: 공개 IP:포트 또는 터널 주소</p>

            {rooms.length > 0 ? <div className={styles.roomList}>
              {rooms.map((room) => {
                const island = islands.find((entry) => entry.id === room.islandId);
                return <div key={room.id} className={styles.currentRoom}>
                  <span>{room.phase === "playing" ? "진행 중" : "대기 중"} · {room.isMember ? "내가 참가한 방" : "이 서버에서 열린 방"}</span>
                  <h3>{room.name}</h3>
                  <p>{island?.name ?? room.islandId} · {room.onlineCount}/{room.capacity}명</p>
                  {room.isMember || room.phase === "waiting" ? <Link href={roomHref(room)}>{room.isMember ? room.phase === "playing" ? "게임으로 돌아가기" : "대기실로 이동" : "이 방에 참가"} <LobbyIcon name="arrow" size={16} /></Link> : <span>입장 마감</span>}
                </div>;
              })}
            </div> : <p className={styles.currentRoomEmpty}>{error || (local ? "이 서버에는 열린 방이 없습니다." : "방 정보를 확인하는 중...")}</p>}
          </section>
        </div>
      </main>
    </LobbyShell>
  );
}
