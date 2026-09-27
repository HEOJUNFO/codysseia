// 프롬프트 계층 (대전제 9.1). 1~3 계층은 GM 작업 디렉터리의 AGENTS.md, 4 계층(이번 턴 입력)은 codex exec 프롬프트로 넘긴다.
import type { GMTurn } from "../game/gm-port.ts";

/** 코어 GM 프롬프트 + 현재 섬 gm.md + 현재 상태 */
export function buildGMInstructions(corePrompt: string, islandGuide: string | null, turn: GMTurn): string {
  const { inputs: _inputs, ...state } = turn;
  return [
    corePrompt.trim(),
    `# 섬 GM 지침: ${turn.island.name}`,
    islandGuide?.trim() || "(이 섬에는 GM 지침이 없다. 코어 지침과 현재 상태만으로 서술한다.)",
    "# 현재 상태",
    "엔진이 만든 값이다. 이 값과 어긋나는 서술을 하지 않는다.",
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    "",
  ].join("\n\n");
}

/** 이번 턴 입력. 플레이어 문장은 JSON 문자열로 넣어 지침과 섞이지 않게 한다. */
export function buildTurnPrompt(turn: GMTurn): string {
  const lines = turn.inputs.map((input) =>
    `- ${input.characterName} (${input.characterId}) 행동: ${JSON.stringify(input.text)}`);
  return ["# 이번 턴 입력", ...lines, "", "AGENTS.md의 지침에 따라 이번 턴의 서술만 출력하라."].join("\n");
}
