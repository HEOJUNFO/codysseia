# 01: 행동 → Codex GM 턴 → 서술 (도구 없이)

**What to build:** 플레이어가 행동을 보내면 가짜 문장 대신 실제 Codex GM이 서술한다. 행동 1개 = GM 턴 1회이고 도구는 아직 없다. `GMProvider` 인터페이스와 `CodexCliProvider`·`ScriptedProvider`를 만들고, 턴마다 GM 작업 디렉터리에 프롬프트 계층(코어 프롬프트 + 현재 섬 `gm.md` + 현재 상태 + 이번 행동)을 써 넣는다. 스펙: `../spec.md` "턴 실행", "프롬프트 계층".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/gm`에 코어 GM 프롬프트 초안이 있다 (역할, 9.2 금지 사항, 서술만 출력)
- [ ] 턴마다 `~/.tragic_trpg/gm-workspace/AGENTS.md`가 새로 생성되고, 현재 섬의 `gm.md`만 들어간다
- [ ] `codex exec`는 읽기 전용 샌드박스, ephemeral, GM 전용 `CODEX_HOME`(`~/.tragic_trpg/gm-codex`)으로 실행된다
- [ ] GM 턴이 도는 동안 한 번에 하나만 돈다. 도중에 들어온 행동은 끝난 뒤에 처리된다
- [ ] 제한 시간 초과·비정상 종료 시 system 로그가 남고 다음 행동은 정상 처리된다
- [ ] `ScriptedProvider`로 세션 수준 테스트: 행동 → gm 로그, 실패 → system 로그
- [ ] 수동 점검 목록(로그인, 개발용 스킬이 GM에 보이지 않음)을 문서에 적고 한 번 확인했다
