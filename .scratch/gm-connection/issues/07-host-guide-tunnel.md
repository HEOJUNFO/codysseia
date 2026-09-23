# 07: 호스트 실행 가이드 (서버 + 터널)

**What to build:** 호스트가 문서 하나를 보고 GM 전용 Codex 로그인, 서버 실행, 터널 공개, 방 코드 공유까지 끝낼 수 있다. 원격 친구 한 명과 실제로 한 판 해 보고, 턴 지연을 재서 모음 창 길이를 조정한다. 스펙: `../spec.md` "호스팅".

**Blocked by:** 02, 03, 04, 05, 06

**Status:** ready-for-human

- [ ] `CODEX_HOME=~/.tragic_trpg/gm-codex codex login` 절차가 README에 있다
- [ ] 프로덕션 모드 실행과 Cloudflare Tunnel 또는 Tailscale Funnel 공개 절차가 있다
- [ ] MCP 엔드포인트가 터널로는 닿지 않는 것을 확인했다
- [ ] 원격 접속자 1명 이상과 플레이테스트를 하고, 턴 체감 지연을 기록했다
- [ ] 기록에 따라 모음 창 기본값을 조정했거나 그대로 두는 이유를 남겼다
