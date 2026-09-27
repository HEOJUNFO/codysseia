"use client";

import { useState } from "react";
import { useGameState, usePlayIdentity, useSendAction } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

export function ActionInput() {
  const [text, setText] = useState("");
  const { pending, gmThinking, turn } = useGameState();
  const { characterId } = usePlayIdentity();
  const send = useSendAction();
  const canAct = turn.mode === "free" || turn.activeCharacterId === characterId;

  return (
    <form
      className={styles.actionForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !canAct || !text.trim()) return;
        send(text);
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={!canAct ? "다른 참가자의 차례입니다" : gmThinking ? "GM이 서술하는 중 · 지금 보낸 행동은 다음 턴에 처리됩니다" : "무엇을 하시겠습니까?"}
        aria-label="행동 입력"
        className={styles.actionInput}
        disabled={!canAct}
      />
      <button
        type="submit"
        disabled={pending || !canAct || !text.trim()}
        className={styles.actionButton}
      >
        행동
      </button>
    </form>
  );
}
