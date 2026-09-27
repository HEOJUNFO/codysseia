import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { GMTools } from "../../game/gm-port.ts";
import { GMToolServer, type GMToolLogEntry } from "../tool-server.ts";

const log: GMToolLogEntry[] = [];
const server = new GMToolServer({ log: (entry) => log.push(entry) });
after(() => server.close());

/** 호출 이름을 기록하고 방 이름을 돌려주는 가짜 턴 도구 */
function tools(room: string, calls: string[] = []): GMTools {
  return {
    definitions: [{ name: "get_flag", description: "읽기", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }],
    call: (name, args) => {
      calls.push(name);
      return name === "get_flag" ? { ok: true, value: { room, args: args as never } } : { ok: false, code: "unknown_tool", message: `없는 도구: ${name}` };
    },
  };
}

function rpc(url: string, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

describe("GM 도구 MCP 서버", () => {
  it("127.0.0.1 에서 initialize · tools/list · tools/call 을 JSON 으로 응답한다", async () => {
    const access = await server.open(tools("room-a"));
    assert.match(access.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const init = await rpc(access.url, access.token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    assert.equal(init.status, 200);
    const initBody = await init.json();
    assert.equal(initBody.result.protocolVersion, "2025-03-26");
    assert.deepEqual(initBody.result.capabilities, { tools: { listChanged: false } });

    const note = await rpc(access.url, access.token, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(note.status, 202);

    const list = await (await rpc(access.url, access.token, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name), ["get_flag"]);

    const call = await (await rpc(access.url, access.token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_flag", arguments: { flag_id: "ash.flag.key" } } })).json();
    assert.deepEqual(call.result.structuredContent, { room: "room-a", args: { flag_id: "ash.flag.key" } });
    assert.equal(call.result.isError, false);
    assert.deepEqual(JSON.parse(call.result.content[0].text), { room: "room-a", args: { flag_id: "ash.flag.key" } });
    access.close();
  });

  it("도구 실패는 isError 와 code·message 로 돌려준다", async () => {
    const access = await server.open(tools("room-a"));
    const call = await (await rpc(access.url, access.token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "roll_check", arguments: {} } })).json();
    assert.equal(call.result.isError, true);
    assert.deepEqual(call.result.structuredContent, { code: "unknown_tool", message: "없는 도구: roll_check" });
    access.close();
  });

  it("모든 도구 호출과 결과를 턴 로그에 남긴다", async () => {
    log.length = 0;
    const access = await server.open(tools("room-a"));
    await rpc(access.url, access.token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_flag", arguments: { flag_id: "ash.flag.key" } } });
    await rpc(access.url, access.token, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "roll_check" } });
    assert.deepEqual(log.map((entry) => [entry.tool, (entry.result as { ok: boolean }).ok]), [["get_flag", true], ["roll_check", false]]);
    assert.equal(log[0].turn, log[1].turn);
    access.close();
  });

  it("토큰은 발급한 턴의 도구에만 닿는다: 다른 방 토큰은 그 방, 닫힌 턴과 가짜 토큰은 401", async () => {
    const callsA: string[] = [];
    const callsB: string[] = [];
    const a = await server.open(tools("room-a", callsA));
    const b = await server.open(tools("room-b", callsB));
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_flag", arguments: {} } };

    assert.equal((await (await rpc(b.url, b.token, call)).json()).result.structuredContent.room, "room-b");
    a.close();
    assert.equal((await rpc(a.url, a.token, call)).status, 401);
    assert.equal((await rpc(a.url, "forged", call)).status, 401);
    assert.equal((await rpc(a.url, null, call)).status, 401);
    assert.deepEqual(callsA, []);
    assert.deepEqual(callsB, ["get_flag"]);
    b.close();
  });

  it("브라우저(Origin)나 프록시를 거친 요청은 토큰이 맞아도 거부한다", async () => {
    const access = await server.open(tools("room-a"));
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    assert.equal((await rpc(access.url, access.token, ping, { Origin: "http://evil.example" })).status, 403);
    assert.equal((await rpc(access.url, access.token, ping, { "X-Forwarded-For": "203.0.113.9" })).status, 403);
    assert.equal((await rpc(access.url, access.token, ping)).status, 200);
    access.close();
  });

  it("SSE 스트림(GET)은 열지 않고, 잘못된 JSON 과 없는 메서드는 JSON-RPC 오류다", async () => {
    const access = await server.open(tools("room-a"));
    assert.equal((await fetch(access.url, { headers: { Authorization: `Bearer ${access.token}` } })).status, 405);
    const broken = await fetch(access.url, { method: "POST", headers: { Authorization: `Bearer ${access.token}` }, body: "{" });
    assert.equal((await broken.json()).error.code, -32700);
    assert.equal((await (await rpc(access.url, access.token, { jsonrpc: "2.0", id: 9, method: "resources/list" })).json()).error.code, -32601);
    access.close();
  });
});
