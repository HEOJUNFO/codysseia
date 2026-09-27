# 04: GM 턴 진행 상태 방송 + 대기 표시

**What to build:** 방이 "GM 턴이 도는 중"(06을 하면 "묶음을 모으는 중"까지)을 모든 참가자에게 발행하고, 코어 틀에 "GM이 생각 중" 표시를 한다. 지금 `GameState.pending`은 방이 늘 `false`로 보내고, 브라우저가 "내 명령이 응답을 기다리는 중·동기화 중·연결 끊김"으로 채운다(`src/web/lib/play/provider.tsx`). 스펙: `../spec.md` "실시간 갱신".

**Blocked by:** 01

**Status:** ready-for-human

- [x] GM 턴 시작·종료가 방의 연속 `revision` 변경분으로 발행되고, 재접속한 참가자도 현재 진행 상태를 받는다
- [x] 한 참가자의 행동으로 GM 턴이 돌면 다른 참가자 화면에도 대기 표시가 나온다
- [x] GM 턴 동안 행동 입력의 동작(막을지, 다음 턴으로 받을지)이 01의 큐 규칙과 맞는다
- [x] 섬 장면이 쓰는 공개 훅(`useGameState` 등)의 모양은 그대로다. 필드를 더하면 `docs/01_섬_제작_템플릿.md` 12절도 고친다

## Comments

### 2026-09-27 — PR #2 머지 뒤 범위 축소

원래 제목은 "실시간 상태 방송 (SSE) + GM 대기 표시"였다. PR #2가 상태 방송을 다른 방식으로 구현했다.

- WebSocket으로 첫 상태를 한 번 보내고, 그 뒤로는 연속 `revision` 변경분만 보낸다. 빠진 번호가 있으면 그 구간만 다시 받는다(`src/web/lib/revision-stream.ts`, `.scratch/room-lobby/spec.md`).
- 두 브라우저 동기화, 재접속, 훅 모양 유지는 이미 된다.

그래서 SSE 항목을 빼고, 남은 "GM 대기 표시"만 남겨 01 뒤로 옮겼다(GM 턴이 있어야 의미가 있다).

### 2026-09-27 — 구현

- `GameState.gmThinking`을 더했다. 방이 채우고 모든 참가자에게 같다. `pending`은 브라우저 전용으로 남기고 방이 보내는 상태에서 뺐다(`RoomGameState = Omit<GameState, "pending">`). 스냅숏 필수 필드가 바뀌어 `GAME_PROTOCOL_VERSION`을 2로 올렸다.
- 따로 revision을 쓰지 않는다. GM 큐가 켜질 때는 그 계기가 된 변경분(`log` 행동, 03의 `scene` 이동)에 `gmThinking: true`를, 큐가 비는 순간에는 마지막 서술 `log`에 `gmThinking: false`를 싣는다. 큐 진입은 03과 함께 `GameRoom#enqueueGm` 한 곳으로 모았다.
- 01의 큐 규칙대로 GM 턴 동안 행동·이동을 막지 않는다. 입력창 안내 문구만 "지금 보낸 행동은 다음 턴에 처리됩니다"로 바뀐다. "GM이 생각하는 중…"은 `gmThinking` 기준으로 GM 대화창에 나온다.
- 섬 제작 템플릿 12절에 `gmThinking`과 `pending`의 차이를 적었다.
- 확인 방법: `npm test`(방 테스트 2개 추가: 시작·종료 발행과 스냅숏, 턴 도중 행동은 상태를 바꾸지 않고 큐가 빌 때 한 번만 종료), 엔진 typecheck, `src/web`의 `tsc --noEmit`.
- 남은 일: 두 브라우저로 대기 표시를 눈으로 확인한다.
