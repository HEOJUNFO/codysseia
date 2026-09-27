# 게임 속 GM

호스트 PC의 공식 `codex` CLI를 GM으로 쓴다 (대전제 2.4). 이 폴더는 GM 공급자 어댑터와 코어 GM 프롬프트를 둔다. 방(`src/game/room.ts`)은 `src/game/gm-port.ts`의 `GMProvider` 포트만 알고, 호스트(`src/host/game-factory.mjs`)가 `CodexCliProvider`를 주입한다.

| 파일 | 역할 |
|---|---|
| `core-prompt.md` | 코어 GM 프롬프트 (대전제 9.1 계층 1, 9.2 금지 사항) |
| `prompt.ts` | 프롬프트 계층 조립. 1~3 계층은 작업 디렉터리 `AGENTS.md`, 4 계층(이번 턴 입력)은 `codex exec` 프롬프트 |
| `codex-cli-provider.ts` | 턴 1회 = `codex exec` 1회. 엔진 도구 MCP를 `-c`로 붙인다 |
| `tool-server.ts` | GM 도구 MCP 서버 (streamable HTTP, 상태 없는 JSON 응답). 턴마다 일회용 토큰 |
| `scripted-provider.ts` | 테스트용 공급자. 스크립트가 도구를 직접 부를 수 있다 |

도구 정의와 인자 검증은 `src/game/gm-tools.ts`, 적용과 발행은 방(`GameRoom`)이 한다.

## 실행 방식

- 턴마다 GM 작업 디렉터리 안에 임시 디렉터리를 만들고, 거기에 `AGENTS.md`를 써서 `codex exec`를 실행한 뒤 지운다. 방이 여러 개라 턴 디렉터리를 나눈다.
- 옵션: `--sandbox read-only`, `--ephemeral`, `--skip-git-repo-check`, 엔진 도구 MCP 서버 `codysseia` 하나.

## GM 도구 (이슈 02)

| 도구 | 엔진 함수 | 화면 요약 (system 로그) |
|---|---|---|
| `get_state` | 방의 현재 상태 (GM 턴 입력과 같은 모양) | 없음 |
| `move_party(location_id)` | `moveToLocation` | "GM이 파티를 ○○(으)로 옮겼습니다." |
| `travel(island_id)` | `travelToIsland` | "GM이 파티를 ○○(으)로 항해시켰습니다." |
| `move_to_spot(character_id, spot_id)` | `moveToSpot` | "GM이 ○○의 위치를 ○○(으)로 옮겼습니다." |
| `set_flag(flag_id, value)` | `setFlag` (현재 섬 플래그만, 대전제 8.2) | "GM이 이야기 진행 상태를 바꿨습니다." (플래그 ID는 비밀일 수 있어 숨긴다) |
| `get_flag(flag_id)` | `readFlag` (현재 섬 + 다른 섬의 `hooks.yaml` 공개 플래그) | 없음 |

- 실패하면 엔진 실패 코드(`not_connected`, `locked`, `foreign_flag` 등)를 `isError`와 함께 돌려주고 상태는 그대로다.
- 바뀐 상태는 다른 명령과 같은 연속 `revision` 변경분으로 발행된다. 플래그로 길이 바뀌면 `routes` 변경분(이동 목록, 섬 지도 전체, 새로 드러난 지역)이 나간다.
- GM 도구로 파티를 옮기면 도착 서술 턴을 따로 만들지 않는다. 그 턴의 GM이 도착까지 서술한다.
- 이미 적용된 도구 호출은 턴이 실패해도 되돌리지 않는다.
- 모든 도구 호출과 결과는 호스트 콘솔에 `[gm] {"turn":…,"tool":…,"arguments":…,"result":…}` 한 줄로 남는다 (턴 로그).

### 접근 통제

- MCP 서버는 로비 포트와 따로 `127.0.0.1`의 임시 포트에 연다(첫 GM 턴 때). 로비 포트는 LAN·터널에 공개되지만 이 포트는 공개되지 않는다.
- 소켓 원격 주소가 루프백이 아니거나, `Origin`(브라우저)·`X-Forwarded-For`·`Forwarded`(같은 컴퓨터의 프록시·터널) 헤더가 있으면 403.
- 토큰은 턴마다 새로 만든 32바이트 난수이고 열린 턴 하나(그 방의 `GMTools`)에만 묶인다. 턴이 끝나면 지워져 401이 되고, 방 쪽 도구도 `turn_closed`로 닫힌다.
- 토큰은 `codex` 인자가 아니라 환경 변수 `CODYSSEIA_GM_TOOL_TOKEN`으로 넘긴다(`bearer_token_env_var`). 인자는 프로세스 목록에 보인다.
- `codex exec`는 승인을 물을 사람이 없으므로 이 서버의 도구만 `default_tools_approval_mode="approve"`로 미리 승인한다.
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
- [ ] `ash_harbor`에서 "종을 울린다"처럼 섬 지침의 조건을 채우는 행동을 보내면, 호스트 콘솔에 `[gm] {"tool":"set_flag",…}` 줄이 찍히고 화면에 "GM이 이야기 진행 상태를 바꿨습니다."가 뜬다
- [ ] "몰래 시장으로 간다"를 보내면 GM이 `move_party`를 불러 파티가 옮겨지고, 서술이 도착한 곳까지 이어진다
- [ ] 잠긴 길로 가라고 해도 GM이 성공한 것처럼 서술하지 않는다 (도구가 `locked`를 돌려준다)
