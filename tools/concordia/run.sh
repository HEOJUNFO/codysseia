#!/bin/sh
# Concordia 시뮬레이션을 호스트의 Codex(ChatGPT) 로그인으로 실행한다. API 키 불필요.
#   ./tools/concordia/run.sh                 # 기본: smoke.py (두 사람 + GM, 몇 스텝)
#   ./tools/concordia/run.sh my_sim.py ...   # tools/concordia/ 안의 다른 스크립트
#
# GM·hindsight 의 codex 와 토큰 갱신이 꼬이지 않도록 Concordia 전용 CODEX_HOME 을 쓴다.
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"

export CODEX_HOME="${CONCORDIA_CODEX_HOME:-$HOME/.tragic_trpg/concordia-codex}"
mkdir -p "$CODEX_HOME"

if [ ! -f "$CODEX_HOME/auth.json" ]; then
  echo "Concordia 전용 Codex 로그인이 필요합니다 (최초 1회). 브라우저가 열립니다."
  codex login
fi

SCRIPT="${1:-smoke.py}"
[ $# -gt 0 ] && shift
exec uv run --project "$DIR" python "$DIR/$SCRIPT" "$@"
