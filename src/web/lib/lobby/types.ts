export type RoomInfo = {
  id: string;
  name: string;
  islandId: string;
  capacity: number;
  count: number;
  onlineCount: number;
  phase: "waiting" | "playing";
};

export type LocalRoom = RoomInfo & { isMember: boolean };
export type LocalRooms = { canHost: boolean; rooms: LocalRoom[] };

export type MemberInfo = {
  id: string;
  name: string;
  role: "host" | "player";
  online: boolean;
  ready: boolean;
};

export type LobbyChange =
  | { type: "member_joined" | "member_updated"; seq: number; member: MemberInfo }
  | { type: "member_left"; seq: number; memberId: string }
  | { type: "room_closed"; seq: number }
  | { type: "game_started"; seq: number; room: RoomInfo };
