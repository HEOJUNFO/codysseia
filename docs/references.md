# 참고 저장소

설치하지 않고 **설계 참고만** 하는 저장소 목록이다. 코드를 이 저장소에 복사하기 전에는 라이선스를 먼저 확인한다.
(2026-09-23, 2026-09-27 trendshift 트렌딩에서 선별)

| 저장소 | 무엇 | 언제 볼까 | 관련 대전제 절 |
|---|---|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | 통합 LLM API, 에이전트 루프(도구 호출, 상태 관리), TUI를 갖춘 툴킷 | Codex CLI 대신 GM 런타임과 텍스트 화면을 직접 만들 때 출발점 | 2.4 LLM 공급자 추상화, 2.5 클라이언트 형태 |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | 성격과 작업 절차가 정의된 전문 에이전트 모음 | NPC 페르소나 카드 형식(성격, 말투, 동기, 금지 사항)을 정할 때 | 템플릿 5. NPC |
| [THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) | 여러 에이전트가 역할을 나눠 한 세션을 진행하는 멀티에이전트 교실 | GM 에이전트와 NPC 에이전트를 분리할지, 세션 진행을 누가 조율할지 정할 때 | 9. GM 에이전트 규약 |
| [google/ax](https://github.com/google/ax) | 쿠버네티스 위에서 에이전트 작업을 선언형 매니페스트(`Task`, `Workspace`, `Model`)로 돌리는 오케스트레이터. 쿠버네티스와 Agent Substrate가 필요해 설치 대상은 아니다. Apache-2.0, 아직 알파 | GM 작업 디렉터리에 MCP 서버·지침을 미리 배선하는 방식(`Workspace`), GM 세션을 멈췄다 이어 가는 방식(`suspend`/`resume`), GM 모델·자격 증명을 분리하는 방식(`Model`)을 정할 때 | 2.4 GM 실행 방식, 9.3 운영 |
| [obra/superpowers](https://github.com/obra/superpowers) (설치하지 않은 부분) | `brainstorming`, `writing-plans` 등 개발 흐름 스킬 | 스킬 설계 사례로만. 설치된 mattpocock 세트와 역할이 겹친다 | — |

## 이미 설치한 도구

설치된 스킬과 개발 도구는 [`AGENTS.md`](../AGENTS.md)에 정리돼 있다.
- 에이전트 장기 메모리: [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) → `tools/hindsight/`
- 생성형 에이전트 시뮬레이션: [google-deepmind/concordia](https://github.com/google-deepmind/concordia) (Apache-2.0) → `tools/concordia/`
- 지식그래프: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) → `.agents/skills/graphify/`
- NPC 사회 시뮬레이션 (로컬 실행 참고용): [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) → `tools/ai-town/run.sh`. NPC 기억·성찰·대화 루프를 직접 돌려 보며 템플릿 5. NPC와 대전제 9장 설계에 참고한다. 코드는 저장소 밖 `~/.tragic_trpg/ai-town/`에 받는다. MIT
