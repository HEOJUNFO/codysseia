#!/bin/sh
# Hindsight 메모리 서버를 호스트의 Codex(ChatGPT) 로그인으로 실행한다. API 키 불필요.
#   API + MCP : http://localhost:8888   (MCP: /mcp/<bank_id>/)
#   웹 UI     : npx @vectorize-io/hindsight-control-plane --port 9999 --api-url http://localhost:8888
#
# GM 으로 도는 codex 프로세스와 토큰 갱신이 서로 꼬이지 않도록 hindsight 전용 CODEX_HOME 을 쓴다
# (hindsight 문서 "Isolating Codex auth for long-running services" 권장).
set -eu

export CODEX_HOME="${HINDSIGHT_CODEX_HOME:-$HOME/.tragic_trpg/hindsight-codex}"
mkdir -p "$CODEX_HOME"

if [ ! -f "$CODEX_HOME/auth.json" ]; then
  echo "hindsight 전용 Codex 로그인이 필요합니다 (최초 1회). 브라우저가 열립니다."
  codex login
fi

export HINDSIGHT_API_LLM_PROVIDER=openai-codex
# export HINDSIGHT_API_LLM_MODEL=...   # 비우면 hindsight 기본 Codex 모델

exec uvx --python 3.12 --from hindsight-api hindsight-api "$@"
