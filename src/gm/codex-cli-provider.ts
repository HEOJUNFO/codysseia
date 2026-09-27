// 호스트의 공식 codex CLI로 GM 턴을 돈다 (대전제 2.4). 토큰은 다루지 않고 GM 전용 CODEX_HOME의 로그인을 codex가 쓴다.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GMProvider, GMTools, GMTurn } from "../game/gm-port.ts";
import { buildGMInstructions, buildTurnPrompt } from "./prompt.ts";
import type { GMToolAccess } from "./tool-server.ts";

/** codex 가 MCP 서버에 붙일 토큰을 읽는 환경 변수. 인자에 넣으면 프로세스 목록에 보인다 */
const TOOL_TOKEN_ENV = "CODYSSEIA_GM_TOOL_TOKEN";

export type CodexCliOptions = {
  /** 저장소 밖 GM 작업 디렉터리. 턴마다 이 안에 임시 디렉터리를 만든다 */
  workspace: string;
  /** GM 전용 CODEX_HOME. 호스트가 이 경로로 codex login 을 한 번 한다 */
  codexHome: string;
  corePrompt: string;
  islandGuide: (islandId: string) => Promise<string | null>;
  timeoutMs: number;
  /** 턴마다 일회용 MCP 접근을 발급하는 엔진 도구 서버 */
  toolServer: { open(tools: GMTools): Promise<GMToolAccess> };
  command?: string;
};

export class CodexCliProvider implements GMProvider {
  readonly #options: CodexCliOptions;

  constructor(options: CodexCliOptions) {
    this.#options = options;
  }

  async narrate(turn: GMTurn, tools: GMTools, signal: AbortSignal): Promise<string> {
    const { workspace, codexHome, corePrompt, islandGuide, timeoutMs, toolServer, command = "codex" } = this.#options;
    await mkdir(workspace, { recursive: true });
    // 방마다 턴이 동시에 돌 수 있으므로 턴 하나에 디렉터리 하나를 쓴다.
    const directory = await mkdtemp(path.join(workspace, "turn-"));
    const access = await toolServer.open(tools);
    try {
      await writeFile(path.join(directory, "AGENTS.md"), buildGMInstructions(corePrompt, await islandGuide(turn.island.id), turn));
      const output = path.join(directory, "last-message.txt");
      await run(command, [
        "exec",
        "--cd", directory,
        "--sandbox", "read-only",
        "--ephemeral",
        "--skip-git-repo-check",
        "--color", "never",
        "--output-last-message", output,
        // 엔진 도구 서버 하나만 붙인다. GM 전용 CODEX_HOME 이라 다른 MCP 설정은 없다.
        "-c", `mcp_servers.codysseia.url=${JSON.stringify(access.url)}`,
        "-c", `mcp_servers.codysseia.bearer_token_env_var=${JSON.stringify(TOOL_TOKEN_ENV)}`,
        "-c", "mcp_servers.codysseia.startup_timeout_sec=10",
        "-c", "mcp_servers.codysseia.tool_timeout_sec=30",
        // codex exec 는 승인을 물을 사람이 없다. 엔진 도구는 턴 토큰으로 범위가 묶여 있으므로 미리 승인한다.
        "-c", `mcp_servers.codysseia.default_tools_approval_mode="approve"`,
        "-",
      ], { ...process.env, CODEX_HOME: codexHome, [TOOL_TOKEN_ENV]: access.token }, buildTurnPrompt(turn), timeoutMs, signal);
      return await readFile(output, "utf8");
    } finally {
      access.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, input: string, timeoutMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("방이 닫혀 GM 턴을 멈췄습니다."));
      return;
    }
    const child = spawn(command, args, { env, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    let failure: Error | null = null;
    const stop = (error: Error) => {
      failure ??= error;
      child.kill("SIGTERM");
    };
    const deadline = setTimeout(() => stop(new Error(`GM 응답 시간 초과 (${Math.round(timeoutMs / 1000)}초)`)), timeoutMs);
    const onAbort = () => stop(new Error("방이 닫혀 GM 턴을 멈췄습니다."));
    signal.addEventListener("abort", onAbort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      console.error("[gm] codex 실행 실패", error);
      failure ??= new Error("codex를 실행할 수 없습니다.");
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      signal.removeEventListener("abort", onAbort);
      if (failure) reject(failure);
      else if (code !== 0) {
        // 자세한 내용은 호스트 콘솔에만 남긴다. 로그는 모든 참가자에게 보인다.
        console.error(`[gm] codex exec 종료 코드 ${code}\n${stderr}`);
        reject(new Error(`codex가 종료 코드 ${code}로 끝났습니다.`));
      } else resolve();
    });
    child.stdin.on("error", () => { /* 조기 종료 시 close 이벤트에서 처리한다 */ });
    child.stdin.end(input);
  });
}
