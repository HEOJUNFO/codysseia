# 07: 호스트 실행 가이드 (GM 로그인 + 외부 공개)

**What to build:** 호스트가 문서 하나를 보고 GM 전용 Codex 로그인, 호스트 앱 실행, 외부 참가자를 위한 주소 공개(LAN IP, 공개 IP, 또는 터널), 방 만들기와 초대까지 끝낼 수 있다. 원격 친구 한 명과 실제로 한 판 해 보고 턴 지연을 기록한다. 스펙: `../spec.md` "호스팅", `.scratch/room-lobby/spec.md` "IP 직접 연결".

**Blocked by:** 01, 02, 03, 04, 06

**Status:** ready-for-human

- [ ] `CODEX_HOME=~/.tragic_trpg/gm-codex codex login` 절차가 README에 있다
- [ ] 프로덕션 모드로 호스트 앱을 실행하는 절차가 있다 (`src/web/server.mjs`)
- [ ] 같은 네트워크(LAN IP)와 다른 네트워크(공개 IP:포트, Cloudflare Tunnel 또는 Tailscale Funnel)에서 참가하는 절차가 있다
- [ ] MCP 엔드포인트가 LAN이나 터널로는 닿지 않는 것을 확인했다
- [ ] 원격 접속자 1명 이상과 플레이테스트를 하고, 턴 체감 지연을 기록했다

## Comments

### 2026-09-27 — PR #2 머지 뒤 정리

- 이제 서버 실행과 방 코드 콘솔 출력 대신, 호스트 앱을 한 번 띄우고 화면에서 방을 만든다. 참가 주소는 LAN IP, 공개 IP, 터널 중 하나다.
- 호스트가 기본값 `0.0.0.0`으로 열린다. 그래서 MCP가 외부에서 닿지 않는지 확인하는 대상에 LAN도 넣었다.
- 05가 해결됐으므로 `Blocked by`에서 뺐다.
- 호스트 승계, 예비 호스트 준비 같은 PR #2 설계의 호스트 이전 절차는 이 가이드의 범위 밖이다.
