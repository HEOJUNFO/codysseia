"""공식 codex CLI 로 Concordia LanguageModel 을 구현한다 (대전제 2.4).

토큰은 다루지 않는다. run.sh 가 지정한 전용 CODEX_HOME 의 로그인을 codex 가 쓴다.
codex exec 는 저장소 밖 빈 작업 디렉터리에서 돌려 개발용 AGENTS.md·스킬이 섞이지 않게 한다.
"""

from collections.abc import Collection, Mapping, Sequence
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any

from concordia.language_model import language_model
from concordia.utils import sampling

_WORKSPACE = Path(
    os.environ.get(
        "CONCORDIA_WORKSPACE",
        Path.home() / ".tragic_trpg" / "concordia-workspace",
    )
)
_MAX_CHOICE_ATTEMPTS = 5
# codex exec 는 에이전트 한 턴이라 Concordia 기본 60초로는 모자랄 때가 있다.
_MIN_TIMEOUT_SECONDS = 180

_COMPLETION_INSTRUCTIONS = (
    "You are the text-completion model behind a simulation. Do not run tools"
    " or commands. Reply with only the requested text, with no preamble or"
    " explanation.\n\n"
)


class CodexLanguageModel(language_model.LanguageModel):
  """codex exec 한 번이 sample 한 번이다. 느리므로 스텝 수를 작게 잡는다."""

  def __init__(
      self,
      *,
      model: str | None = os.environ.get("CONCORDIA_CODEX_MODEL"),
      reasoning_effort: str = os.environ.get(
          "CONCORDIA_CODEX_REASONING", "low"
      ),
      command: str = "codex",
  ):
    self._model = model
    self._reasoning_effort = reasoning_effort
    self._command = command
    _WORKSPACE.mkdir(parents=True, exist_ok=True)

  def sample_text(
      self,
      prompt: str,
      *,
      max_tokens: int = language_model.DEFAULT_MAX_TOKENS,
      terminators: Collection[str] = language_model.DEFAULT_TERMINATORS,
      temperature: float = language_model.DEFAULT_TEMPERATURE,
      top_p: float = language_model.DEFAULT_TOP_P,
      top_k: int = language_model.DEFAULT_TOP_K,
      timeout: float = language_model.DEFAULT_TIMEOUT_SECONDS,
      seed: int | None = None,
  ) -> str:
    # codex exec 는 샘플링 인자를 받지 않는다.
    del max_tokens, temperature, top_p, top_k, seed
    text = self._exec(prompt, max(timeout, _MIN_TIMEOUT_SECONDS))
    for terminator in terminators:
      text = text.split(terminator, 1)[0]
    return text

  def sample_choice(
      self,
      prompt: str,
      responses: Sequence[str],
      *,
      seed: int | None = None,
  ) -> tuple[int, str, Mapping[str, Any]]:
    del seed
    question = (
        f"{prompt}\n\nAnswer with exactly one of the following, copied"
        f" verbatim: {', '.join(repr(r) for r in responses)}"
    )
    for attempt in range(_MAX_CHOICE_ATTEMPTS):
      sample = self._exec(question, _MIN_TIMEOUT_SECONDS).strip()
      answer = sampling.extract_choice_response(sample)
      if answer in responses:
        return responses.index(answer), answer, {"attempts": attempt + 1}
      if sample in responses:
        return responses.index(sample), sample, {"attempts": attempt + 1}
    raise language_model.InvalidResponseError(
        f"{_MAX_CHOICE_ATTEMPTS}번 시도에도 선택지를 고르지 못했습니다:"
        f" {responses}"
    )

  def _exec(self, prompt: str, timeout: float) -> str:
    with tempfile.TemporaryDirectory() as directory:
      output = Path(directory) / "last-message.txt"
      args = [
          self._command, "exec",
          "--cd", str(_WORKSPACE),
          "--sandbox", "read-only",
          "--ephemeral",
          "--skip-git-repo-check",
          "--ignore-user-config",
          "--color", "never",
          "--output-last-message", str(output),
          "-c", f'model_reasoning_effort="{self._reasoning_effort}"',
      ]
      if self._model:
        args += ["--model", self._model]
      args.append("-")
      result = subprocess.run(
          args,
          input=_COMPLETION_INSTRUCTIONS + prompt,
          text=True,
          stdout=subprocess.DEVNULL,
          stderr=subprocess.PIPE,
          timeout=timeout,
          check=False,
      )
      if result.returncode != 0:
        raise RuntimeError(
            f"codex exec 종료 코드 {result.returncode}\n{result.stderr}"
        )
      return output.read_text()
