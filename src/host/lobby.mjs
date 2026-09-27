import { randomBytes, randomUUID } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function roomCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function participant(name, role) {
  return {
    id: randomUUID(),
    name,
    role,
    online: false,
    ready: false,
  };
}

function publicRoom(room) {
  let onlineCount = 0;
  for (const member of room.members.values()) if (member.online) onlineCount += 1;
  return {
    id: room.id,
    name: room.name,
    islandId: room.islandId,
    capacity: room.capacity,
    count: room.members.size,
    onlineCount,
    phase: room.phase,
  };
}

export class Lobby {
  #room = null;
  #createGame;

  constructor(createGame) {
    this.#createGame = createGame;
  }

  currentRoom() {
    return this.#room ? publicRoom(this.#room) : null;
  }

  create({ name, islandId, capacity, hostName }) {
    if (this.#room) throw new Error("이미 열려 있는 방이 있습니다.");
    const cleanName = String(name ?? "").trim();
    const cleanIslandId = String(islandId ?? "").trim();
    const slots = Number(capacity);
    if (cleanName.length < 2 || cleanName.length > 36) throw new Error("방 이름은 2~36자로 입력하세요.");
    if (!/^[a-z][a-z0-9_]*$/.test(cleanIslandId)) throw new Error("시작할 섬이 올바르지 않습니다.");
    if (!Number.isInteger(slots) || slots < 1 || slots > 4) throw new Error("플레이어 수는 1~4명이어야 합니다.");
    const cleanHostName = String(hostName ?? "").trim();
    if (cleanHostName.length < 1 || cleanHostName.length > 24) throw new Error("호스트 이름은 1~24자로 입력하세요.");

    const token = randomBytes(32).toString("base64url");
    const host = participant(cleanHostName, "host");
    this.#room = {
      id: randomUUID(),
      name: cleanName,
      islandId: cleanIslandId,
      capacity: slots,
      code: roomCode(),
      phase: "waiting",
      members: new Map([[token, host]]),
      sockets: new Map(),
      events: [],
      seq: 0,
      game: null,
    };
    return { room: publicRoom(this.#room), code: this.#room.code, token, memberId: host.id };
  }

  join({ code, name, roomId }) {
    const room = this.#room;
    if (!room || (roomId && room.id !== roomId)) throw new Error("방을 찾을 수 없습니다.");
    if (room.phase !== "waiting") throw new Error("현재 입장할 수 없는 방입니다.");
    if (String(code ?? "").trim().toUpperCase() !== room.code) throw new Error("방 코드가 맞지 않습니다.");
    const cleanName = String(name ?? "").trim();
    if (cleanName.length < 1 || cleanName.length > 24) throw new Error("플레이어 이름은 1~24자로 입력하세요.");
    if (room.members.size >= room.capacity) throw new Error("방이 가득 찼습니다.");
    const token = randomBytes(32).toString("base64url");
    const member = participant(cleanName, "player");
    room.members.set(token, member);
    this.#publish(room, { type: "member_joined", member });
    return { room: publicRoom(room), token, memberId: member.id };
  }

  membership(token, roomId) {
    const room = this.#room;
    if (!room || room.id !== roomId) return null;
    const member = room.members.get(token);
    return member ? { room, member } : null;
  }

  connect(token, roomId, socket, resumeRevision = null) {
    const membership = this.membership(token, roomId);
    if (!membership) return false;
    const { room, member } = membership;
    const sockets = room.sockets.get(member.id) ?? new Set();
    room.sockets.set(member.id, sockets);
    sockets.add(socket);
    socket.send(JSON.stringify({
      type: "snapshot",
      seq: room.seq,
      room: publicRoom(room),
      members: [...room.members.values()],
      selfId: member.id,
      code: member.role === "host" ? room.code : undefined,
    }));
    if (room.game) {
      const canResume = Number.isInteger(resumeRevision) && resumeRevision >= 0 && resumeRevision <= room.game.revision;
      socket.send(JSON.stringify(canResume ? {
        type: "game_resumed",
        revision: room.game.revision,
        selfCharacterId: room.game.characterFor(member.id),
      } : {
        type: "game_snapshot",
        revision: room.game.revision,
        state: room.game.snapshot(),
        selfCharacterId: room.game.characterFor(member.id),
      }));
    }
    if (!member.online) {
      member.online = true;
      this.#publish(room, { type: "member_updated", member });
    }
    socket.on("message", (data) => {
      if (this.#room !== room || room.members.get(token) !== member) return;
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (!message || typeof message !== "object") return;
      if (message.type === "replay") {
        const from = Number(message.from);
        const to = Number(message.to);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 255) return;
        for (let index = from; index <= to; index++) {
          const event = room.events[index - 1];
          if (!event || event.seq !== index) {
            socket.send(JSON.stringify({ type: "replay_error", from, to }));
            return;
          }
          socket.send(JSON.stringify(event));
        }
      } else if (message.type === "ready" && member.role === "player") {
        if (room.phase !== "waiting") return;
        const ready = Boolean(message.ready);
        if (member.ready !== ready) {
          member.ready = ready;
          this.#publish(room, { type: "member_updated", member });
        }
      } else if (message.type === "rename") {
        if (room.phase !== "waiting") return;
        const name = String(message.name ?? "").trim();
        if (name.length >= 1 && name.length <= 24 && name !== member.name) {
          member.name = name;
          this.#publish(room, { type: "member_updated", member });
        }
      } else if (message.type === "leave" && member.role !== "host") {
        if (room.phase !== "waiting") return;
        this.#removeMember(room, token);
      } else if (message.type === "kick" && member.role === "host") {
        if (room.phase !== "waiting") return;
        for (const [memberToken, candidate] of room.members) {
          if (candidate.id === message.memberId && candidate.role !== "host") {
            this.#removeMember(room, memberToken);
            break;
          }
        }
      } else if (message.type === "close_room" && member.role === "host") {
        this.close(room.id);
      } else if (message.type === "start_game" && member.role === "host") {
        this.#startGame(room, socket);
      } else if (message.type === "game_command" && room.game) {
        void room.game.execute(member.id, message.commandId, message.command).then((outcome) => {
          if (this.#room !== room) return;
          if (outcome.ok && outcome.event) this.#broadcast(room, outcome.event);
          if (socket.readyState === 1) socket.send(JSON.stringify({
            type: "game_command_result",
            commandId: message.commandId,
            ok: outcome.ok,
            error: outcome.ok ? undefined : outcome.error,
          }));
        }).catch((error) => {
          console.error("[game] 명령 처리 실패", error);
          if (this.#room === room && socket.readyState === 1) socket.send(JSON.stringify({
            type: "game_command_result",
            commandId: message.commandId,
            ok: false,
            error: "게임 명령을 처리하지 못했습니다.",
          }));
        });
      } else if (message.type === "game_replay" && room.game) {
        const events = room.game.replay(message.from, message.to);
        if (!events) socket.send(JSON.stringify({ type: "game_replay_error", from: message.from, to: message.to }));
        else for (const event of events) socket.send(JSON.stringify(event));
      }
    });
    socket.on("close", () => {
      sockets.delete(socket);
      if (sockets.size === 0) {
        room.sockets.delete(member.id);
        if (room.members.get(token) === member && member.online && this.#room === room) {
          member.online = false;
          member.ready = false;
          this.#publish(room, { type: "member_updated", member });
        }
      }
    });
    return true;
  }

  close(roomId) {
    const room = this.#room;
    if (!room || room.id !== roomId) return;
    this.#publish(room, { type: "room_closed" });
    this.#room = null;
    room.game?.close();
    for (const sockets of room.sockets.values()) for (const socket of sockets) socket.close(1000, "room closed");
  }

  #removeMember(room, token) {
    const member = room.members.get(token);
    if (!member) return;
    room.members.delete(token);
    this.#publish(room, { type: "member_left", memberId: member.id });
    for (const socket of room.sockets.get(member.id) ?? []) socket.close(1000, "left room");
  }

  #startGame(room, socket) {
    if (room.phase !== "waiting") return;
    for (const member of room.members.values()) {
      if (member.role === "player" && (!member.online || !member.ready)) {
        socket.send(JSON.stringify({ type: "command_error", error: "모든 참가자가 준비해야 시작할 수 있습니다." }));
        return;
      }
    }
    try {
      room.game = this.#createGame(room.islandId, room.members.values());
      room.phase = "playing";
      this.#publish(room, { type: "game_started", room: publicRoom(room) });
    } catch (error) {
      socket.send(JSON.stringify({ type: "command_error", error: error instanceof Error ? error.message : "게임을 시작하지 못했습니다." }));
    }
  }

  #broadcast(room, message) {
    const data = JSON.stringify(message);
    for (const sockets of room.sockets.values()) {
      for (const socket of sockets) if (socket.readyState === 1) socket.send(data);
    }
  }

  #publish(room, change) {
    const event = { ...change, member: change.member ? { ...change.member } : undefined, seq: ++room.seq };
    room.events.push(event);
    this.#broadcast(room, event);
  }
}
