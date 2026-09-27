"use client";

import { voyageHours } from "@codysseia/engine/movement";
import { islands } from "@/lib/islands.generated";
import { useGameState, useMove, usePlayIdentity } from "@/lib/play/provider";
import { ArchipelagoHome, type HomeIsland, type HomeParty } from "./archipelago-home";

export function RoomArchipelago() {
  const state = useGameState();
  const move = useMove();
  const identity = usePlayIdentity();
  const current = islands.find((island) => island.id === state.place?.islandId);
  const party: HomeParty = state.place ? { islandId: state.place.islandId, islandName: state.place.islandName, time: state.time } : null;
  const entries: HomeIsland[] = islands.map((island) => ({
    ...island,
    hours: current?.position && island.position && island.playable && island.id !== current.id
      ? voyageHours(current.position, island.position)
      : null,
  }));
  return <ArchipelagoHome key={party?.islandId ?? "none"} islands={entries} party={party} canLead={identity.role === "host"} travelOptions={state.moves.islands} onTravel={move.toIsland} pending={state.pending} />;
}
