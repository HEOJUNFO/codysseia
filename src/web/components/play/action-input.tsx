"use client";

import { useState } from "react";
import { useGameState, useSendAction } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

export function ActionInput() {
  const [text, setText] = useState("");
  const { pending } = useGameState();
  const send = useSendAction();

  return (
    <form
      className={styles.actionForm}
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
        className={styles.actionInput}
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className={styles.actionButton}
      >
        행동
      </button>
    </form>
  );
}
