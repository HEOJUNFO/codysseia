"use client";

import { useBatchSignals, useGameState, usePlayIdentity } from "@/lib/play/provider";
import styles from "./play-ui.module.css";

const SIGNAL_LABEL = { ready: "행동함", pass: "넘김" } as const;

/** 자유 진행의 행동 묶음 (이슈 06). 전원이 행동하거나 넘기면, 또는 호스트가 진행하면 GM에게 간다 */
export function BatchStatus() {
  const { turn, party, batch, pending } = useGameState();
  const { characterId, role } = usePlayIdentity();
  const { passBatch, proceedBatch } = useBatchSignals();
  if (turn.mode !== "free" || party.length < 2) return null;

  const signalOf = (id: string) => batch?.signals.find((entry) => entry.characterId === id)?.signal;
  const status = (id: string) => {
    const signal = signalOf(id);
    if (signal) return SIGNAL_LABEL[signal];
    return batch?.waiting.includes(id) ? "기다리는 중" : "자리 비움";
  };
  const summary = !batch ? "행동을 보내면 모두가 준비될 때 GM에게 넘깁니다"
    : batch.closing || batch.waiting.length === 0 ? "앞 GM 턴이 끝나는 대로 넘깁니다"
    : `${batch.waiting.length}명을 기다리는 중`;

  return (
    <section className={styles.batchStatus} aria-live="polite">
      <p>{summary}</p>
      {batch ? (
        <ul>
          {party.map((character) => (
            <li key={character.id}>
              <span>{character.name}</span>
              <span>{status(character.id)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        {!signalOf(characterId) ? <button type="button" onClick={passBatch} disabled={pending}>이번엔 넘기기</button> : null}
        {role === "host" && batch && !batch.closing ? <button type="button" onClick={proceedBatch} disabled={pending}>기다리지 않고 진행</button> : null}
      </div>
    </section>
  );
}
