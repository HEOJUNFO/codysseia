#!/bin/sh
# a16z-infra/ai-town 을 이 컴퓨터에서 띄운다. Convex 는 docker 로 자체 호스팅하고, LLM 은 OpenAI API 를 쓴다.
#   화면      : http://localhost:5173  (포트가 차 있으면 vite 가 다음 포트를 골라 출력한다)
#   Convex    : http://127.0.0.1:3210  (HTTP API 3211)
#   대시보드  : http://localhost:6791  (관리 키는 $AI_TOWN_DIR/.env.local 의 CONVEX_SELF_HOSTED_ADMIN_KEY)
#
# NPC 기억·대화 루프를 돌려 보며 설계를 참고하는 용도다. 코드는 저장소 밖($AI_TOWN_DIR)에 받아
# 우리 src/ 와 섞지 않는다. 필요: git, node, docker(실행 중), 저장소 .env 의 AI_TOWN_OPENAI_API_KEY.
# 이 키는 ai-town 전용이다. 게임 GM 은 API 키를 쓰지 않는다 (대전제 2.4).
# 멈추기: Ctrl+C 후 `docker compose -p tragic-ai-town stop`
set -eu

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
AI_TOWN_DIR="${AI_TOWN_DIR:-$HOME/.tragic_trpg/ai-town}"
AI_TOWN_REF="${AI_TOWN_REF:-8e05997f2409275669c8344b84a51692e83f3f33}"

if [ -f "$REPO_DIR/.env" ]; then
  set -a; . "$REPO_DIR/.env"; set +a
fi
if [ -z "${AI_TOWN_OPENAI_API_KEY:-}" ]; then
  echo "$REPO_DIR/.env 에 AI_TOWN_OPENAI_API_KEY 를 넣어 주세요 (.env.example 참고)." >&2
  exit 1
fi

if [ ! -d "$AI_TOWN_DIR/.git" ]; then
  git init -q "$AI_TOWN_DIR"
  git -C "$AI_TOWN_DIR" remote add origin https://github.com/a16z-infra/ai-town.git
fi
if [ "$(git -C "$AI_TOWN_DIR" rev-parse -q --verify HEAD || true)" != "$AI_TOWN_REF" ]; then
  git -C "$AI_TOWN_DIR" fetch -q --depth 1 origin "$AI_TOWN_REF"
  git -C "$AI_TOWN_DIR" checkout -q -f FETCH_HEAD
fi
cd "$AI_TOWN_DIR"
[ -d node_modules ] || npm ci

# ai-town 은 임베딩 차원을 코드 상수로 고른다. OpenAI 임베딩은 1536 차원이다.
sed -i '' 's/^export const EMBEDDING_DIMENSION: number = .*/export const EMBEDDING_DIMENSION: number = OPENAI_EMBEDDING_DIMENSION;/' convex/util/llm.ts

# compose 파일이 backend 에 11434(Ollama 포트)를 여는데 쓰지 않으므로, 호스트 Ollama 와 부딪치지 않게 비켜 둔다.
export OLLAMA_PORT="${AI_TOWN_UNUSED_OLLAMA_PORT:-11499}"
docker compose -p tragic-ai-town up -d --wait backend dashboard

# 관리 키는 backend 를 새로 만들면 바뀌므로 매번 새로 받는다.
admin_key="$(docker compose -p tragic-ai-town exec -T backend ./generate_admin_key.sh | tail -n 1)"
cat > .env.local <<EOF
CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210"
CONVEX_SELF_HOSTED_ADMIN_KEY="$admin_key"
VITE_CONVEX_URL="http://127.0.0.1:3210"
EOF

npx convex env set OPENAI_API_KEY "$AI_TOWN_OPENAI_API_KEY"
[ -z "${AI_TOWN_OPENAI_CHAT_MODEL:-}" ] || npx convex env set OPENAI_CHAT_MODEL "$AI_TOWN_OPENAI_CHAT_MODEL"
[ -z "${AI_TOWN_OPENAI_EMBEDDING_MODEL:-}" ] || npx convex env set OPENAI_EMBEDDING_MODEL "$AI_TOWN_OPENAI_EMBEDDING_MODEL"

exec npm run dev
