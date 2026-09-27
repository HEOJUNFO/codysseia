type IconName = "compass" | "arrow" | "plus" | "link" | "map" | "users" | "chevron" | "edit" | "trash" | "lock" | "check" | "back" | "spark";

export function LobbyIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shapes: Record<IconName, React.ReactNode> = {
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.7 8.3-2.3 5.1-5.1 2.3 2.3-5.1 5.1-2.3Z" /></>,
    arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
    map: <><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" /><path d="M9 4v14M15 6v14" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19H3.5ZM16 5.3a3 3 0 0 1 0 5.4M18 14a5 5 0 0 1 2.5 4.3V19" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    edit: <><path d="M12 20h9M4 17.5V20h2.5L18.8 7.7l-2.5-2.5L4 17.5ZM15.5 6l2.5 2.5" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    back: <><path d="M20 12H5M11 6l-6 6 6 6" /></>,
    spark: <><path d="m12 3 1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8L12 3Z" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  );
}
