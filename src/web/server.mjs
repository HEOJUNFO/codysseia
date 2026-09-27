import { createServer } from "node:http";
import os from "node:os";
import next from "next";
import { WebSocketServer } from "ws";
import { Lobby } from "../host/lobby.mjs";
import { createGameRoom } from "../host/game-factory.mjs";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.CODYSSEIA_BIND ?? "0.0.0.0";
const dev = !process.argv.includes("--production") && process.env.NODE_ENV !== "production";
const lobby = new Lobby(createGameRoom);
const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });

function hostAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family !== "IPv4" || item.internal) continue;
      const [first, second] = item.address.split(".").map(Number);
      if (first !== 10 && !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168)) continue;
      addresses.push(`http://${item.address}:${port}`);
    }
  }
  return addresses;
}

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function localRequest(request) {
  const address = (request.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (address !== "127.0.0.1" && address !== "::1") return false;
  try {
    const hostname = new URL(`http://${request.headers.host}`).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function memberToken(request, roomId) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  const name = `codysseia_member_${roomId}=`;
  const raw = cookies.find((item) => item.trim().startsWith(name));
  return raw?.trim().slice(name.length) ?? "";
}

function memberCookie(request, roomId, token) {
  const secure = request.socket.encrypted || request.headers["x-forwarded-proto"] === "https";
  return `codysseia_member_${roomId}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`;
}

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk.toString();
    if (value.length > 4096) throw new Error("요청이 너무 큽니다.");
  }
  return value;
}

function redirect(response, location, cookie) {
  response.writeHead(303, { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) });
  response.end();
}

async function lobbyRoute(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/api/lobby/local" && request.method === "GET") {
    const canHost = localRequest(request);
    const rooms = lobby.listRooms().map((room) => ({
      ...room,
      isMember: Boolean(lobby.membership(memberToken(request, room.id), room.id)),
    }));
    json(response, 200, {
      canHost,
      rooms,
    });
    return true;
  }
  if (url.pathname === "/api/lobby/create" && request.method === "POST") {
    if (!localRequest(request)) { json(response, 403, { error: "방은 이 컴퓨터에서만 만들 수 있습니다." }); return true; }
    try {
      const input = JSON.parse(await body(request));
      const result = lobby.create(input);
      json(response, 201, { room: result.room, code: result.code }, { "Set-Cookie": memberCookie(request, result.room.id, result.token) });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : "방을 만들지 못했습니다." });
    }
    return true;
  }
  if (url.pathname === "/api/lobby/join-form" && request.method === "POST") {
    let requestedRoomId = "";
    try {
      const input = new URLSearchParams(await body(request));
      requestedRoomId = input.get("roomId") ?? "";
      const result = lobby.join({
        code: input.get("code"),
        name: input.get("name"),
        roomId: requestedRoomId,
      });
      redirect(response, `/rooms/${encodeURIComponent(result.room.id)}`, memberCookie(request, result.room.id, result.token));
    } catch (error) {
      const message = error instanceof Error ? error.message : "방에 입장하지 못했습니다.";
      const query = new URLSearchParams({ error: message });
      if (requestedRoomId) query.set("room", requestedRoomId);
      redirect(response, `/rooms/join?${query}`);
    }
    return true;
  }
  const roomRoute = /^\/api\/lobby\/rooms\/([^/]+)$/.exec(url.pathname);
  if (roomRoute && request.method === "GET") {
    const membership = lobby.membership(memberToken(request, roomRoute[1]), roomRoute[1]);
    if (!membership) json(response, 401, { error: "참가 정보가 없습니다." });
    else json(response, 200, {
      room: lobby.room(roomRoute[1]),
      self: membership.member,
      code: membership.member.role === "host" ? membership.room.code : undefined,
      addresses: membership.member.role === "host" ? hostAddresses() : [],
    });
    return true;
  }
  return false;
}

const server = createServer(async (request, response) => {
  try {
    if (!await lobbyRoute(request, response)) await handle(request, response);
  } catch (error) {
    if (!response.headersSent) json(response, 500, { error: "서버 요청을 처리하지 못했습니다." });
    else response.destroy(error);
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws/lobby") return;
  const origin = request.headers.origin;
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && new URL(origin).host === request.headers.host); } catch { /* invalid origin */ }
  if (!sameOrigin) {
    socket.destroy();
    return;
  }
  const roomId = url.searchParams.get("room") ?? "";
  const revisionParam = url.searchParams.get("revision");
  const resumeRevision = revisionParam === null ? null : Number(revisionParam);
  const token = memberToken(request, roomId);
  if (!lobby.membership(token, roomId)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (websocket) => {
    if (!lobby.connect(token, roomId, websocket, resumeRevision)) websocket.close(1008, "unauthorized");
  });
});

const app = next({ dev, dir: import.meta.dirname, hostname, port, httpServer: server, turbopack: dev });
const handle = app.getRequestHandler();
await app.prepare();
server.listen(port, hostname, () => {
  console.log(`Codysseia host ready at http://localhost:${port}`);
});
