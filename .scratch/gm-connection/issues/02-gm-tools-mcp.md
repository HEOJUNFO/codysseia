# 02: GM 도구 MCP 서버 (이동·플래그)

**What to build:** GM이 턴 중에 엔진 도구를 불러 실제 상태를 바꾼다. "GM이 문을 열었다"고 서술하면 플래그가 켜지고 지도·이동 목록에 반영된다. Next.js 서버 안에 MCP HTTP 엔드포인트를 열고, 턴마다 일회용 토큰을 만들어 `codex exec`에 붙인다. 스펙: `../spec.md` "GM 도구 (MCP)".

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 도구: `get_state`, `move_party`, `travel`, `move_to_spot`, `set_flag`, `get_flag`
- [ ] 이동 도구는 엔진 이동 함수를 그대로 쓰고, 실패 코드를 GM에 돌려준다
- [ ] `set_flag`는 ID 접두사 규칙(대전제 8.2)을 검사한다
- [ ] 닫힌 턴의 토큰이나 localhost가 아닌 곳에서 온 호출은 거부된다
- [ ] 모든 도구 호출과 결과가 턴 로그에 남고, 화면에는 system 로그로 요약된다
- [ ] 도구 핸들러 단위 테스트와, `ScriptedProvider`로 "도구 호출 → 상태 변경" 세션 테스트
- [ ] 실제 Codex로 GM이 도구를 부르는 것을 한 번 확인했다
