# 코디세이아 (Codysseia) — 에이전트 지침

이 파일은 이 저장소에서 작업하는 사람과 AI 에이전트(Codex, Claude Code 등)가 먼저 읽는 공통 지침이다.
`CLAUDE.md`는 이 파일을 가져오기만 하므로 내용은 여기에만 쓴다.

## 프로젝트 한 줄

여러 제작자가 각자 만든 섬을 파티가 자유롭게 탐험하는 디지털 TRPG. 게임 속 GM은 LLM 에이전트가 맡는다.
모든 규약의 원본은 [`docs/00_대전제.md`](docs/00_대전제.md), 섬 제출 양식은 [`docs/01_섬_제작_템플릿.md`](docs/01_섬_제작_템플릿.md)다. 작업 전에 관련 절을 먼저 읽는다.

## 두 종류의 에이전트를 섞지 않는다

| 구분 | 누구 | 무엇을 읽나 |
|---|---|---|
| **개발 에이전트** | 이 저장소를 편집하는 Codex / Claude Code | 이 파일, `.agents/skills/`, `docs/` |
| **게임 속 GM** | 호스트 컴퓨터에서 엔진이 실행하는 Codex CLI (호스트 본인 로그인, 대전제 2.4) | 코어 GM 프롬프트 + 섬 `gm.md` + 엔진이 만든 현재 상태 (대전제 9.1) |

- `.agents/skills/`의 개발용 스킬은 게임 속 GM 프롬프트에 넣지 않는다.
- GM용 Codex는 저장소 밖 전용 작업 디렉터리(예: `~/.tragic_trpg/gm-workspace/`)에서 실행한다. 저장소 안에서 실행하면 개발용 스킬과 이 파일이 GM 컨텍스트에 섞인다.

## 반드시 지킬 것

- **엔진이 진실, GM은 서술자** (대전제 2.1). 주사위·수치·상태 변경은 엔진 코드와 GM 도구 호출로만 한다. 프롬프트나 서술로 수치를 정하지 않는다.
- **섬은 데이터 패키지** (대전제 2.3). 섬 작업에서 `/engine`, `/gm`, `/schemas`를 고치지 않는다. 필요하면 대전제 8.3 확장 절차로 이슈를 연다.
- **남의 섬은 건드리지 않는다.** 요청받은 섬 폴더(`islands/<섬_id>/`) 밖은 읽기만 한다. 다른 섬은 공개 훅(`hooks.yaml`)에 있는 것만 참조한다.
- **ID 접두사** (대전제 8.2). 모든 ID와 플래그는 `<섬_id>.` 으로 시작한다.
- `docs/00_대전제.md`, `/schemas`, `/engine`, `/gm` 변경은 PR + 전원 합의 대상이다. 에이전트가 임의로 [제안]을 [확정]으로 바꾸지 않는다.
- **Codex 로그인 토큰을 코드에서 다루지 않는다.** 게임 코드는 공식 `codex` 실행 파일만 호출한다. `~/.codex/auth.json`을 읽거나 토큰을 꺼내 직접 API를 부르는 코드는 만들지 않는다.
- 비밀값이 생기면 `.env`에만 둔다. `.env.example`에 키 이름만 적는다.

## 폴더

```
AGENTS.md / CLAUDE.md   에이전트 공통 지침 (이 파일)
docs/                   대전제, 템플릿, 설계 문서, 참고 자료
schemas/                데이터 JSON Schema
engine/                 코어 엔진 (판정, 상태, 전투)
gm/                     게임 속 GM (프롬프트, 도구 연결, 공급자)
islands/<섬_id>/        각자의 섬
tools/                  개발 보조 도구 설정 (메모리 서버 등)
.agents/skills/         개발 에이전트 스킬 (Codex가 읽는 원본)
.claude/skills/         Claude Code용 — .agents/skills 로의 심볼릭 링크 + Claude 전용 스킬
```

## 개발 에이전트 스킬

`npx skills`로 설치했고 출처와 해시는 `skills-lock.json`에 있다. 새로 클론한 뒤 복원: `npx skills experimental_install`.

| 출처 | 스킬 | 비고 |
|---|---|---|
| mattpocock/skills | ask-matt, grill-me, grilling, grill-with-docs, domain-modeling, to-spec, to-tickets, implement, triage, wayfinder, tdd, diagnosing-bugs, research, prototype, codebase-design, improve-codebase-architecture, mp-code-review, resolving-merge-conflicts, handoff, teach, wait-what, to-questionnaire, writing-for-agents, wizard, setup-matt-pocock-skills | 어떤 스킬을 쓸지 모르겠으면 `ask-matt` |
| obra/superpowers | verification-before-completion, receiving-code-review | mattpocock 세트와 겹치지 않는 것만 |
| anthropics/skills | mcp-builder (공용), skill-creator (`.claude/skills`만) | GM 도구 MCP 서버 제작, 스킬 작성 |
| Graphify-Labs/graphify | graphify | 아래 "지식그래프" 참고 |

스킬 관리 규칙:
- `code-review`는 Claude Code 내장 `/code-review`와 겹쳐 `mp-code-review`로 이름을 바꿨다. 업데이트 후 원래 이름으로 돌아오면 다시 바꾼다.
- `ask-matt`는 자동 호출되게 바꿨다 (원본은 수동). 업데이트 시 되돌아가는지 확인한다.
- superpowers의 `using-superpowers`, `brainstorming` 등은 설치하지 않는다. 모든 응답 전에 스킬 사용을 강제해 mattpocock 흐름과 충돌한다.
- anthropics `skill-creator`는 Codex 내장 `skill-creator`와 이름이 겹치고 평가 스크립트가 `claude -p`에 의존해 Claude Code에만 둔다.
- mattpocock 스킬의 이슈·스펙은 `.scratch/<작업>/` 마크다운으로 관리하고 커밋한다. 규칙: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, 도메인 문서 규칙: `docs/agents/domain.md`.
- GM용 스킬(예: 판정 규칙 조회, 섬 로더)을 만들면 개발용과 섞이지 않게 `gm/skills/`에 둔다.

## 처음 한 번 할 일

1. `codex login`으로 본인 ChatGPT 계정 로그인 (GM을 돌릴 호스트)
2. Codex가 `.codex/config.toml`(공용 MCP 설정)을 읽도록 이 저장소를 신뢰 등록: `~/.codex/config.toml`에
   `[projects."<이 저장소 절대경로>"]` + `trust_level = "trusted"` (또는 codex 첫 실행 때 신뢰 질문에 yes)
3. 메모리 서버: `./tools/hindsight/run.sh` (최초 실행 때 hindsight 전용 Codex 로그인을 한 번 더 한다)
4. (선택) 지식그래프 CLI `uv tool install graphifyy`

## 장기 메모리 (hindsight)

플레이테스트에서 GM이 방문한 섬, NPC와의 관계, 플레이어 행적을 세션을 넘어 기억하게 한다.
- Codex는 MCP `hindsight`(`http://localhost:8888/mcp/tragic-trpg-playtest/`)로 `retain` / `recall` / `reflect`를 쓴다.
- 은행(bank)은 서로 완전히 격리된다. 캠페인마다 은행을 따로 쓴다. 섬 제작용 메모와 캠페인 기록을 한 은행에 섞지 않는다.
- 메모리는 **서술 참고용**이다. HP·인벤토리·플래그의 원본은 엔진 상태이며 메모리에서 수치를 되살리지 않는다.
- 기억 추출도 호스트의 Codex 로그인(`openai-codex` 공급자)을 쓴다. GM용 로그인과 토큰이 꼬이지 않게 전용 `CODEX_HOME`(`~/.tragic_trpg/hindsight-codex`)을 쓴다.
- 게임 속 GM에는 같은 MCP 주소를 붙인다. 연결 방식은 `/gm` 설계 때 정한다.
- 웹 UI(선택): `npx @vectorize-io/hindsight-control-plane --port 9999 --api-url http://localhost:8888`

## 지식그래프 (graphify)

섬과 문서가 많아지면 `graphify`로 저장소를 그래프로 만들어 섬끼리 ID·설정 충돌을 찾는다.
- CLI 설치: `uv tool install graphifyy` (y 두 개)
- 결과물 `graphify-out/`은 커밋하지 않는다.
- 문서·YAML 의미 추출은 모델 토큰을 쓴다. 필요할 때만 돌린다.

## 참고 자료

직접 쓰지 않고 설계 참고만 하는 저장소는 [`docs/references.md`](docs/references.md)에 정리한다.
