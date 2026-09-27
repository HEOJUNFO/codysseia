import { JoinRoom } from "@/components/lobby/join-room";

export default async function JoinRoomPage({ searchParams }: { searchParams: Promise<{ room?: string; error?: string }> }) {
  const { room = "", error = "" } = await searchParams;
  return <JoinRoom invitedRoom={room} initialError={error} />;
}
