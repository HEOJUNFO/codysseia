# 02: GM 도구 MCP 서버 (이동·플래그)

**What to build:** GM이 턴 중에 엔진 도구를 불러 실제 상태를 바꾼다. "GM이 문을 열었다"고 서술하면 플래그가 켜지고 지도·이동 목록에 반영된다. 호스트 프로세스(`src/web/server.mjs`가 조립하는 호스트) 안에 MCP HTTP 엔드포인트를 열고, 턴마다 일회용 토큰을 만들어 `codex exec`에 붙인다. 도구는 해당 방의 `GameRoom`을 통해서만 상태를 바꾼다. 스펙: `../spec.md` "GM 도구 (MCP)".

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 도구: `get_state`, `move_party`, `travel`, `move_to_spot`, `set_flag`, `get_flag`
- [ ] 이동 도구는 엔진 이동 함수를 그대로 쓰고, 실패 코드를 GM에 돌려준다
- [ ] 엔진에 플래그 쓰기가 생기고, `set_flag`는 ID 접두사 규칙(대전제 8.2)을 검사한다
- [ ] 일회용 토큰은 방 하나의 열린 턴 하나에만 묶인다. 닫힌 턴의 토큰, 다른 방의 토큰, 루프백이 아닌 곳에서 온 호출은 거부된다
- [ ] 도구로 바뀐 상태는 다른 명령과 같은 연속 `revision` 변경분으로 모든 참가자에게 발행된다
- [ ] 모든 도구 호출과 결과가 턴 로그에 남고, 화면에는 system 로그로 요약된다
- [ ] 도구 핸들러 단위 테스트와, `ScriptedProvider`로 "도구 호출 → 상태 변경" 방 테스트
- [ ] 실제 Codex로 GM이 도구를 부르는 것을 한 번 확인했다

## Comments

### 2026-09-27 — PR #2 머지 뒤 정리

- MCP 엔드포인트 위치를 "Next.js 서버 안"에서 호스트 프로세스로 바꿨다. 이제 `src/web/server.mjs`가 Next.js, 로비, WebSocket을 한 프로세스로 조립한다.
- 호스트가 LAN 참가를 위해 기본값 `0.0.0.0`(`CODYSSEIA_BIND`)으로 열린다. 그래서 "localhost에서 온 요청만 받는다"를 소켓의 원격 주소 기준으로 확실히 검사해야 한다. `Host` 헤더만 보면 안 된다.
- 방이 여러 개라서 토큰이 방도 가리켜야 한다.
