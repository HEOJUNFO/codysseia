// 호스트의 공식 codex CLI로 GM 턴을 돈다 (대전제 2.4). 토큰은 다루지 않고 GM 전용 CODEX_HOME의 로그인을 codex가 쓴다.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GMProvider, GMTurn } from "../game/gm-port.ts";
import { buildGMInstructions, buildTurnPrompt } from "./prompt.ts";

export type CodexCliOptions = {
  /** 저장소 밖 GM 작업 디렉터리. 턴마다 이 안에 임시 디렉터리를 만든다 */
  workspace: string;
  /** GM 전용 CODEX_HOME. 호스트가 이 경로로 codex login 을 한 번 한다 */
  codexHome: string;
  corePrompt: string;
  islandGuide: (islandId: string) => Promise<string | null>;
  timeoutMs: number;
  command?: string;
};

export class CodexCliProvider implements GMProvider {
  readonly #options: CodexCliOptions;

  constructor(options: CodexCliOptions) {
    this.#options = options;
  }

  async narrate(turn: GMTurn, signal: AbortSignal): Promise<string> {
    const { workspace, codexHome, corePrompt, islandGuide, timeoutMs, command = "codex" } = this.#options;
    await mkdir(workspace, { recursive: true });
    // 방마다 턴이 동시에 돌 수 있으므로 턴 하나에 디렉터리 하나를 쓴다.
    const directory = await mkdtemp(path.join(workspace, "turn-"));
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
        "-",
      ], { ...process.env, CODEX_HOME: codexHome }, buildTurnPrompt(turn), timeoutMs, signal);
      return await readFile(output, "utf8");
    } finally {
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
