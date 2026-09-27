// GM 도구 MCP 서버 (streamable HTTP, 상태 없는 JSON 응답).
// 호스트 프로세스 안에서 127.0.0.1 전용 포트로 따로 연다. 로비 포트(LAN·터널로 공개)와 나눠 외부에서는 닿지 않게 한다.
// GM 턴마다 일회용 토큰을 발급하고, 토큰은 방 하나의 열린 턴 하나(GMTools)에만 묶인다.
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { GMTools } from "../game/gm-port.ts";

/** 턴 로그 한 줄. 모든 도구 호출과 결과를 호스트에 남긴다 (화면에는 방이 system 로그로 요약한다) */
export type GMToolLogEntry = { turn: string; tool: string; arguments: unknown; result: unknown };

export type GMToolAccess = {
  /** codex 에 넘길 MCP 주소 */
  url: string;
  /** Authorization: Bearer 로 보낼 일회용 토큰 */
  token: string;
  /** 턴이 끝나면 부른다. 그 뒤 이 토큰의 호출은 거부된다 */
  close: () => void;
};

type Session = { tools: GMTools; turn: string };
type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const MCP_PATH = "/mcp";
const MAX_BODY = 64 * 1024;
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "codysseia-gm", version: "0.1.0" };

function loopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export class GMToolServer {
  readonly #sessions = new Map<string, Session>();
  readonly #log: (entry: GMToolLogEntry) => void;
  #listening: Promise<{ server: Server; port: number }> | null = null;
  #turns = 0;

  constructor(options: { log?: (entry: GMToolLogEntry) => void } = {}) {
    this.#log = options.log ?? ((entry) => console.info(`[gm] ${JSON.stringify(entry)}`));
  }

  /** 열린 GM 턴의 도구를 등록하고 일회용 접근 정보를 돌려준다. 첫 호출 때 서버를 연다. */
  async open(tools: GMTools): Promise<GMToolAccess> {
    const { port } = await this.#listen();
    const token = randomBytes(32).toString("base64url");
    this.#sessions.set(token, { tools, turn: `turn-${++this.#turns}` });
    return {
      url: `http://127.0.0.1:${port}${MCP_PATH}`,
      token,
      close: () => { this.#sessions.delete(token); },
    };
  }

  async close(): Promise<void> {
    const listening = this.#listening;
    this.#listening = null;
    this.#sessions.clear();
    if (!listening) return;
    const { server } = await listening;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  #listen(): Promise<{ server: Server; port: number }> {
    this.#listening ??= new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        this.#handle(request, response).catch((error) => {
          console.error("[gm] MCP 요청 처리 실패", error);
          if (!response.headersSent) reply(response, 500, { error: "internal error" });
          else response.destroy();
        });
      });
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        // 대기 중인 GM 턴이 없을 때 호스트 종료를 막지 않는다.
        server.unref();
        resolve({ server, port: (server.address() as AddressInfo).port });
      });
    });
    return this.#listening;
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // 127.0.0.1 에만 열었지만, 같은 컴퓨터의 터널·프록시가 넘겨준 요청과 브라우저 요청(DNS 리바인딩)도 막는다.
    if (!loopback(request.socket.remoteAddress) || request.headers.origin !== undefined || request.headers["x-forwarded-for"] !== undefined || request.headers.forwarded !== undefined) {
      reply(response, 403, { error: "forbidden" });
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== MCP_PATH) {
      reply(response, 404, { error: "not found" });
      return;
    }
    const session = this.#sessions.get(/^Bearer (\S+)$/.exec(request.headers.authorization ?? "")?.[1] ?? "");
    if (!session) {
      // 닫힌 턴·다른 방·가짜 토큰은 모두 여기서 끝난다.
      reply(response, 401, { error: "GM 턴 토큰이 없거나 만료되었습니다." });
      return;
    }
    if (request.method !== "POST") {
      // 상태 없는 서버라 서버 → 클라이언트 SSE 스트림은 열지 않는다.
      response.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(await readBody(request));
    } catch {
      reply(response, 400, rpcError(null, -32700, "Parse error"));
      return;
    }
    const messages = Array.isArray(message) ? message : [message];
    const replies = messages.map((entry) => this.#dispatch(session, entry)).filter((entry) => entry !== null);
    if (replies.length === 0) response.writeHead(202).end();
    else reply(response, 200, Array.isArray(message) ? replies : replies[0]);
  }

  /** JSON-RPC 메시지 하나를 처리한다. 알림(id 없음)이면 null */
  #dispatch(session: Session, raw: unknown): object | null {
    const message = (raw && typeof raw === "object" ? raw : {}) as JsonRpcRequest;
    const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(id, -32600, "Invalid Request");
    if (id === null) return null;
    const params = (message.params && typeof message.params === "object" ? message.params : {}) as Record<string, unknown>;
    switch (message.method) {
      case "initialize": {
        const requested = params.protocolVersion;
        return rpcResult(id, {
          protocolVersion: typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: "코디세이아 엔진 도구. 상태를 바꾸는 것은 이 도구뿐이다. 실패하면 code 와 message 를 읽고 서술을 맞춘다.",
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: session.tools.definitions });
      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        const result = session.tools.call(name, params.arguments);
        this.#log({ turn: session.turn, tool: name, arguments: params.arguments ?? null, result });
        const body = result.ok ? result.value : { code: result.code, message: result.message };
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(body) }],
          ...(body && typeof body === "object" && !Array.isArray(body) ? { structuredContent: body } : {}),
          isError: !result.ok,
        });
      }
      default:
        return rpcError(id, -32601, `Method not found: ${message.method}`);
    }
  }
}

function rpcResult(id: string | number, result: object): object {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("요청이 너무 큽니다.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
