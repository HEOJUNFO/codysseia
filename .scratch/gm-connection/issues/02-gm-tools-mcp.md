# 02: GM 도구 MCP 서버 (이동·플래그)

**What to build:** GM이 턴 중에 엔진 도구를 불러 실제 상태를 바꾼다. "GM이 문을 열었다"고 서술하면 플래그가 켜지고 지도·이동 목록에 반영된다. 호스트 프로세스(`src/web/server.mjs`가 조립하는 호스트) 안에 MCP HTTP 엔드포인트를 열고, 턴마다 일회용 토큰을 만들어 `codex exec`에 붙인다. 도구는 해당 방의 `GameRoom`을 통해서만 상태를 바꾼다. 스펙: `../spec.md` "GM 도구 (MCP)".

**Blocked by:** 01

**Status:** ready-for-human

- [x] 도구: `get_state`, `move_party`, `travel`, `move_to_spot`, `set_flag`, `get_flag`
- [x] 이동 도구는 엔진 이동 함수를 그대로 쓰고, 실패 코드를 GM에 돌려준다
- [x] 엔진에 플래그 쓰기가 생기고, `set_flag`는 ID 접두사 규칙(대전제 8.2)을 검사한다
- [x] 일회용 토큰은 방 하나의 열린 턴 하나에만 묶인다. 닫힌 턴의 토큰, 다른 방의 토큰, 루프백이 아닌 곳에서 온 호출은 거부된다
- [x] 도구로 바뀐 상태는 다른 명령과 같은 연속 `revision` 변경분으로 모든 참가자에게 발행된다
- [x] 모든 도구 호출과 결과가 턴 로그에 남고, 화면에는 system 로그로 요약된다
- [x] 도구 핸들러 단위 테스트와, `ScriptedProvider`로 "도구 호출 → 상태 변경" 방 테스트
- [ ] 실제 Codex로 GM이 도구를 부르는 것을 한 번 확인했다

## Comments

### 2026-09-27 — PR #2 머지 뒤 정리

- MCP 엔드포인트 위치를 "Next.js 서버 안"에서 호스트 프로세스로 바꿨다. 이제 `src/web/server.mjs`가 Next.js, 로비, WebSocket을 한 프로세스로 조립한다.
- 호스트가 LAN 참가를 위해 기본값 `0.0.0.0`(`CODYSSEIA_BIND`)으로 열린다. 그래서 "localhost에서 온 요청만 받는다"를 소켓의 원격 주소 기준으로 확실히 검사해야 한다. `Host` 헤더만 보면 안 된다.
- 방이 여러 개라서 토큰이 방도 가리켜야 한다.

### 2026-09-27 — 구현

- 엔진: `src/engine/src/flags.ts`에 `setFlag`(현재 섬 플래그만)와 `readFlag`(현재 섬 + 다른 섬의 공개 플래그)를 두었다. 켜서 드러난 길의 끝 지역은 방문한 지역에서 보이므로 `discovered`에 더한다. `hooks.yaml`의 `flags`를 `IslandDef.publicFlags`로 읽고, 다른 섬 플래그를 적으면 로드 오류로 처리한다.
- 도구: 정의와 인자 검증은 `src/game/gm-tools.ts`의 순수 함수에 두었다. 방이 턴마다 `GMTools`를 열고, 턴이 끝나거나 방이 닫히면 `turn_closed`로 거부한다. `GMProvider.narrate(turn, tools, signal)`로 바뀌었다.
- MCP 서버: `src/gm/tool-server.ts`. 로비 포트에 붙이지 않고 `127.0.0.1`의 임시 포트에 따로 연다. 같은 컴퓨터의 터널이 로비 포트로 들어오면 원격 주소가 루프백이라 원격 주소 검사만으로는 거를 수 없기 때문이다. 이에 더해 `Origin`·전달 헤더가 붙은 요청도 거부한다. 토큰은 환경 변수와 `bearer_token_env_var`로 넘긴다.
- 발행: 이동은 기존 `scene`·`spot` 변경분에 system 요약을 붙인다. 플래그는 새 `routes` 변경분(이동 목록 + 섬 지도 전체 + 새로 드러난 지역)으로 나간다. GM 도구 이동은 도착 서술 턴을 따로 만들지 않고, 기다리던 옛 도착은 버린다(03과 같은 규칙).
- 확인 방법:
  - `npm test`: 엔진 플래그 테스트 7개, `hooks.yaml` 2개, 도구 핸들러 9개, 방 도구 8개, MCP 서버 6개를 추가했다.
  - 로그인 없는 실제 `codex exec`가 이 서버에 붙어 MCP 초기화를 마쳤고, `default_tools_approval_mode="approve"` 설정 값을 받아들였다. 모델 호출은 로그인이 없어 401로 끝났다.
  - `-c` 인자와 토큰 환경 변수로 도구를 부르는 가짜 `codex`로 실제 `ash_harbor` 월드를 돌렸다. `set_flag` → `routes` 발행 → 잠김 해제 → 호스트 턴 로그까지 확인했다.
- 남은 일: 실제 Codex GM이 도구를 부르는 것은 GM 전용 `CODEX_HOME` 로그인 뒤 호스트가 확인한다(`src/gm/README.md` 수동 점검 목록).
