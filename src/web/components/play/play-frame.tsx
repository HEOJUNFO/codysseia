// 코어 틀: 섬 장면 영역 + 위치·이동 + 파티 상태 + GM 로그·행동 입력 (대전제 8.5).
// 섬 장면(children)은 장면 영역을 꽉 채우는 크기로 들어온다. 섬은 h-full 로 채우면 된다.

import { ActionInput } from "./action-input";
import { GMLog } from "./gm-log";
import { LocationPanel } from "./location-panel";
import { PartyStatus } from "./party-status";
import { SceneArea } from "./scene-area";
import { TurnStatus } from "./turn-status";
import styles from "./play-ui.module.css";

export function PlayFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <SceneArea>{children}</SceneArea>
      <aside className={styles.sidebar}>
        <LocationPanel />
        <TurnStatus />
        <PartyStatus />
      </aside>
      <section className={styles.dialogue}>
        <GMLog />
        <ActionInput />
      </section>
    </div>
  );
}
