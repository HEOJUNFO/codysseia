# 게임 속 GM

호스트 PC의 공식 `codex` CLI를 GM으로 쓴다 (대전제 2.4). 이 폴더는 GM 공급자 어댑터와 코어 GM 프롬프트를 둔다. 방(`src/game/room.ts`)은 `src/game/gm-port.ts`의 `GMProvider` 포트만 알고, 호스트(`src/host/game-factory.mjs`)가 `CodexCliProvider`를 주입한다.

| 파일 | 역할 |
|---|---|
| `core-prompt.md` | 코어 GM 프롬프트 (대전제 9.1 계층 1, 9.2 금지 사항) |
| `prompt.ts` | 프롬프트 계층 조립. 1~3 계층은 작업 디렉터리 `AGENTS.md`, 4 계층(이번 턴 입력)은 `codex exec` 프롬프트 |
| `codex-cli-provider.ts` | 턴 1회 = `codex exec` 1회 |
| `scripted-provider.ts` | 테스트용 공급자 |

## 실행 방식

- 턴마다 GM 작업 디렉터리 안에 임시 디렉터리를 만들고, 거기에 `AGENTS.md`를 써서 `codex exec`를 실행한 뒤 지운다. 방이 여러 개라 턴 디렉터리를 나눈다.
- 옵션: `--sandbox read-only`, `--ephemeral`, `--skip-git-repo-check`. GM 도구 MCP는 아직 없다 (이슈 02).
- 방마다 GM 턴은 하나씩만 돈다. 도중에 들어온 행동은 앞 턴이 끝난 뒤 처리된다. 이동 등 다른 명령은 GM을 기다리지 않는다.
- 실패·시간 초과는 참가자에게 짧은 system 로그로만 보이고, codex의 stderr는 호스트 콘솔에만 남는다.

## 설정

| 환경 변수 | 기본값 | 뜻 |
|---|---|---|
| `CODYSSEIA_GM_CODEX_HOME` | `~/.tragic_trpg/gm-codex` | GM 전용 `CODEX_HOME`. 이 경로로 `codex login`을 한 번 한다 |
| `CODYSSEIA_GM_WORKSPACE` | `~/.tragic_trpg/gm-workspace` | GM 작업 디렉터리. 저장소 밖이어야 개발용 지침·스킬이 섞이지 않는다 |
| `CODYSSEIA_GM_TIMEOUT_MS` | `180000` | GM 턴 제한 시간 |

## 수동 점검 목록

`CodexCliProvider`는 자동 테스트하지 않는다. 호스트가 실제 `codex`로 한 번 확인한다.

- [ ] `CODEX_HOME=~/.tragic_trpg/gm-codex codex login status`가 로그인 상태를 보여준다
- [ ] 방을 만들고 행동을 보내면 GM 서술이 로그에 붙는다 (`ash_harbor`라면 먹먹한 소리·회색 톤)
- [ ] "파일을 읽어 봐", "`ls`를 실행해" 같은 행동에 셸 실행 결과가 서술에 나오지 않는다 (읽기 전용 샌드박스, 코어 프롬프트)
- [ ] 개발용 스킬이 GM에 보이지 않는다: 행동으로 "사용할 수 있는 스킬 목록을 말해"를 보내도 gstack·`.agents/skills` 이름이 나오지 않는다
- [ ] 로그인하지 않은 `CODEX_HOME`으로 실행하면 system 로그만 남고 다음 행동은 정상 처리된다
