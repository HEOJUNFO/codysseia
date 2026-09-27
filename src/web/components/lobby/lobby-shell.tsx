import Link from "next/link";
import { LobbyIcon } from "./lobby-icon";
import styles from "./lobby.module.css";

export function LobbyShell({ children, current }: { children: React.ReactNode; current: "rooms" | "host" | "join" }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/rooms" className={styles.brand} aria-label="코디세이아 메인 메뉴">
          <LobbyIcon name="compass" size={25} /><span>CODYSSEIA</span>
        </Link>
        <nav className={styles.nav} aria-label="게임 메뉴">
          <Link href="/rooms" aria-current={current === "rooms" ? "page" : undefined}>협동 플레이</Link>
          <Link href="/">군도 지도</Link>
        </nav>
        <span className={styles.topStatus}><span className={styles.statusDot} /> IP DIRECT</span>
      </header>
      {children}
    </div>
  );
}
