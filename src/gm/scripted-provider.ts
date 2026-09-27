// 테스트용 GM 공급자. 실제 Codex 없이 턴 흐름과 도구 호출을 검증한다.
import type { GMProvider, GMTools, GMTurn } from "../game/gm-port.ts";

type Script = (turn: GMTurn, signal: AbortSignal, tools: GMTools) => string | Promise<string>;

export class ScriptedProvider implements GMProvider {
  readonly turns: GMTurn[] = [];
  readonly #script: Script;

  constructor(script: Script) {
    this.#script = script;
  }

  async narrate(turn: GMTurn, tools: GMTools, signal: AbortSignal): Promise<string> {
    this.turns.push(turn);
    return this.#script(turn, signal, tools);
  }
}
