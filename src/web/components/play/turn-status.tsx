"use client";

import { useEndTurn, useGameState, usePlayIdentity } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

export function TurnStatus() {
  const { turn, party, pending } = useGameState();
  const { characterId, role } = usePlayIdentity();
  const endTurn = useEndTurn();
  if (turn.mode !== "ordered") return null;

  const activeName = party.find((character) => character.id === turn.activeCharacterId)?.name ?? "알 수 없는 캐릭터";
  const myTurn = turn.activeCharacterId === characterId;
  return (
    <section className={styles.turnStatus} aria-live="polite">
      <span>{turn.round}라운드 · {activeName}의 차례</span>
      {myTurn || role === "host" ? <button type="button" onClick={endTurn} disabled={pending}>{myTurn ? "턴 종료" : "차례 넘기기"}</button> : null}
    </section>
  );
}
