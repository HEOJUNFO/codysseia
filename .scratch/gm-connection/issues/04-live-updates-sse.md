# 04: 실시간 상태 방송 (SSE) + GM 대기 표시

**What to build:** 서버가 상태 스냅숏을 SSE로 모든 접속자에게 밀어서, 다른 사람의 행동·이동·GM 서술이 모든 화면에 바로 나타난다. `pending`은 "GM 턴이 돌거나 모음 창이 열려 있음"을 뜻하게 바꾸고, 코어 틀에 "GM이 생각 중" 표시를 한다. 스펙: `../spec.md` "실시간 갱신".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 브라우저 두 개를 열면 한쪽의 행동·이동이 다른 쪽에 새로고침 없이 나타난다
- [ ] 연결이 끊기면 다시 연결하고 최신 스냅숏을 받는다
- [ ] `useGameState`, `useMove`, `useSendAction`의 모양은 그대로다 (섬 장면 코드 수정 없음)
- [ ] GM 턴 동안 코어 틀에 대기 표시가 나온다
