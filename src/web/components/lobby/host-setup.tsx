"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { islands } from "@/lib/islands.generated";
import type { LocalRooms } from "@/lib/lobby/types";
import { LobbyIcon } from "./lobby-icon";
import { LobbyShell } from "./lobby-shell";
import styles from "./lobby.module.css";

const availableIslands = islands.filter((island) => island.playable);

export function HostSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hostName, setHostName] = useState("");
  const [islandId, setIslandId] = useState(availableIslands[0]?.id ?? "");
  const [capacity, setCapacity] = useState<1 | 2 | 3 | 4>(4);
  const [canHost, setCanHost] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const selectedIsland = availableIslands.find((island) => island.id === islandId);

  useEffect(() => {
    let active = true;
    fetch("/api/lobby/local", { cache: "no-store" })
      .then((response) => response.json())
      .then((status: LocalRooms) => {
        if (!active) return;
        setCanHost(status.canHost);
      })
      .catch(() => { if (active) setError("호스트 상태를 확인하지 못했습니다."); });
    return () => { active = false; };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/lobby/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hostName, islandId, capacity }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "방을 열지 못했습니다.");
      router.push(`/rooms/${result.room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "방을 열지 못했습니다.");
      setCreating(false);
    }
  };

  return (
    <LobbyShell current="host">
      <main className={styles.pageMain}>
        <Link href="/rooms" className={styles.backLink}><LobbyIcon name="back" size={18} /> 멀티플레이</Link>
        <div className={styles.pageHeading}><div><p className={styles.sectionHint}>HOST GAME</p><h1>방 만들기</h1></div><div className={styles.headingEmblem}><LobbyIcon name="compass" size={36} /></div></div>
        <div className={styles.setupGrid}>
          <form className={styles.formPanel} onSubmit={onSubmit}>
            <div className={styles.formIntro}><span className={styles.formStep}>01</span><div><h2>방 설정</h2></div></div>
            <div className={styles.formFields}><div className={styles.field}>
              <label htmlFor="room-name">방 이름</label>
              <input id="room-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={36} required placeholder="안개 너머의 첫 항해" />
            </div>
            <div className={styles.field}>
              <label htmlFor="host-name">내 이름</label>
              <input id="host-name" value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} required placeholder="호스트 이름" />
            </div>
            <div className={styles.field}>
              <label htmlFor="start-island">시작할 섬</label>
              <div className={styles.selectWrap}><select id="start-island" value={islandId} onChange={(event) => setIslandId(event.target.value)} disabled={availableIslands.length === 0}>{availableIslands.length === 0 ? <option value="">플레이 가능한 섬 없음</option> : availableIslands.map((island) => <option key={island.id} value={island.id}>{island.name}</option>)}</select><LobbyIcon name="chevron" size={18} /></div>
            </div>
            <fieldset className={styles.fieldset}>
              <legend>최대 플레이어 수</legend>
              <div className={styles.capacityOptions}>{([1, 2, 3, 4] as const).map((count) => <label key={count} className={capacity === count ? styles.capacitySelected : styles.capacityOption}><input type="radio" name="capacity" checked={capacity === count} onChange={() => setCapacity(count)} /><strong>{count}</strong><span>명</span></label>)}</div>
            </fieldset></div>
            <div className={styles.formNotice}><LobbyIcon name="lock" size={20} /><p>방을 열면 이 컴퓨터가 호스트가 됩니다. 방을 여러 개 열 수 있으며 각 방의 참가자와 게임은 따로 관리됩니다.</p></div>
            {canHost === false ? <p className={styles.formError} role="alert">방 생성은 자신의 컴퓨터에서 실행한 앱에서만 가능합니다.</p> : null}
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.formFooter}><button className={styles.primaryButton} type="submit" disabled={creating || canHost !== true || !islandId}><LobbyIcon name="check" size={19} /> {creating ? "방 여는 중..." : "방 열기"}</button><Link href="/rooms" className={styles.secondaryTextButton}>취소</Link></div>
          </form>
          <aside className={styles.hostAside} aria-label="방 설정 미리보기">
            <p className={styles.asideKicker}>ROOM PREVIEW</p>
            <h2>{name.trim() || "이름 없는 방"}</h2>
            <div className={styles.previewDivider} />
            <dl className={styles.roomStats}><div><dt>시작 지점</dt><dd>{selectedIsland?.name ?? "미선택"}</dd></div><div><dt>플레이어</dt><dd>1 / {capacity}</dd></div><div><dt>접속</dt><dd>IP 직접 입력</dd></div></dl>
            <div className={styles.playerSlots} aria-label="플레이어 슬롯">{Array.from({ length: capacity }, (_, index) => <div key={index}><span>{String(index + 1).padStart(2, "0")}</span>{index === 0 ? hostName.trim() || "호스트" : "빈 자리"}</div>)}</div>
          </aside>
        </div>
      </main>
    </LobbyShell>
  );
}
