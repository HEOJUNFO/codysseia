import type { LocalRoom } from "./types";

/** URL로 방을 지정하거나, 참가한 방이 정확히 하나일 때만 자동 선택한다. */
export function selectMemberRoom(rooms: LocalRoom[], requestedRoomId: string | null): LocalRoom | null {
  if (requestedRoomId) return rooms.find((room) => room.id === requestedRoomId && room.isMember) ?? null;
  let selected: LocalRoom | null = null;
  for (const room of rooms) {
    if (!room.isMember) continue;
    if (selected) return null;
    selected = room;
  }
  return selected;
}
