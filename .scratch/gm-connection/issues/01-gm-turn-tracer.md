# 01: 행동 → Codex GM 턴 → 서술 (도구 없이)

**What to build:** 플레이어가 행동을 보내면 가짜 문장 대신 실제 Codex GM이 서술한다. 행동 1개 = GM 턴 1회이고 도구는 아직 없다. `src/gm/`에 `GMProvider` 인터페이스와 `CodexCliProvider`·`ScriptedProvider`를 만들고, 턴마다 GM 작업 디렉터리에 프롬프트 계층(코어 프롬프트 + 현재 섬 `gm.md` + 현재 상태 + 이번 행동)을 써 넣는다. `GameRoom`(`src/game/room.ts`)의 `#act`가 가짜 GM 문장 대신 GM 턴을 연다. 스펙: `../spec.md` "턴 실행", "프롬프트 계층".

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] `src/gm/`에 코어 GM 프롬프트 초안이 있다 (역할, 9.2 금지 사항, 서술만 출력)
- [x] 턴마다 `~/.tragic_trpg/gm-workspace/AGENTS.md`가 새로 생성되고, 현재 섬의 `gm.md`만 들어간다
- [x] `codex exec`는 읽기 전용 샌드박스, ephemeral, GM 전용 `CODEX_HOME`(`~/.tragic_trpg/gm-codex`)으로 실행된다
- [x] 방마다 GM 턴이 한 번에 하나만 돈다. 도중에 들어온 행동은 끝난 뒤에 처리된다. 방의 명령 큐는 GM 턴을 기다리는 동안에도 이동 등 다른 명령을 막지 않는다
- [x] 행동 로그 항목에 행동한 캐릭터 id가 붙고(`LogEntry`), GM 턴 입력의 행동에도 캐릭터가 붙어 간다 (05에서 옮겨 온 항목)
- [x] GM 서술 로그가 방의 연속 `revision` 변경분으로 발행된다 (턴 시작·종료 상태는 04)
- [x] 제한 시간 초과·비정상 종료 시 system 로그가 남고 다음 행동은 정상 처리된다
- [x] `ScriptedProvider`로 방 수준 테스트: 행동 → gm 로그, 실패 → system 로그. `src/game`·`src/gm`에 테스트 러너가 없으면 엔진처럼 `node --test`로 추가한다
- [x] 수동 점검 목록(로그인, 개발용 스킬이 GM에 보이지 않음)을 문서에 적었다 (`src/gm/README.md`)
- [ ] 호스트가 실제 `codex` 로그인으로 수동 점검 목록을 한 번 확인했다

## Comments

### 2026-09-27 — PR #2 머지 뒤 정리

- 세션이 `web/lib/play/session.ts`에서 `src/game/room.ts`의 `GameRoom`으로 옮겨졌다. Next.js와 분리돼 있으므로 테스트 이음새는 `GameRoom`이다.
- 방이 여러 개가 됐다. GM 턴 큐와 "한 번에 하나"는 방 단위다.
- 05의 남은 항목(행동 로그와 GM 입력에 캐릭터 붙이기)을 여기로 옮겼다.
- `ordered` 턴 모드(`src/game/turn.ts`)가 생겼다. 순서 턴에서는 현재 차례의 캐릭터만 행동할 수 있고, 이 검사는 이미 `#act`에 있다.

### 2026-09-27 — 구현

- `src/game/gm-port.ts`에 `GMProvider` 포트를 두었다. `src/gm/`에는 코어 프롬프트, 프롬프트 계층 조립, `CodexCliProvider`, `ScriptedProvider`를 두었다. 호스트(`src/host/game-factory.mjs`)가 공급자를 주입한다.
- 턴 작업 디렉터리는 `~/.tragic_trpg/gm-workspace/turn-*/`이다. 방이 여러 개라 턴마다 임시 디렉터리를 만들고 끝나면 지운다.
- `GameRoom.subscribe`를 추가했다. 명령 응답 뒤에 도착하는 GM 서술도 같은 경로로 revision 순서대로 방송된다. 이제 lobby는 `outcome.event`를 직접 방송하지 않는다.
- 확인 방법:
  - `npm test`: 방·프롬프트 테스트 11개를 추가했다.
  - 가짜 `codex` 실행 파일로 인자, `CODEX_HOME`, 실패, 시간 초과, 중단을 확인했다.
  - 실제 호스트 서버에 두 참가자를 붙여, 행동과 GM 서술이 둘 모두에게 revision 1과 2로 도착하는 것을 확인했다.
- 남은 일: GM 전용 `CODEX_HOME`에 아직 로그인하지 않아, 실제 Codex 점검은 호스트가 한다.
