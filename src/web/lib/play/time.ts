// 게임 시간 표시. 엔진은 시간 단위 숫자만 다룬다 (대전제 8.6).

/** 58 → "2일 10시간", 24 → "1일", 5 → "5시간" */
export function formatHours(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return `${rest}시간`;
  return rest === 0 ? `${days}일` : `${days}일 ${rest}시간`;
}
