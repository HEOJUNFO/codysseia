# 멀티플레이 로비 기본 구현

Status: implemented locally, proposal until team review
Date: 2026-09-27

## 범위

- 호스트가 자기 컴퓨터에서 방 이름·시작 섬·정원·이름을 입력해 활성 방 하나를 연다.
- 방 코드는 8자리 입장 비밀이고 호스트 권한은 별도 브라우저 쿠키로 판별한다.
- 참가자는 호스트 IP:포트·방 코드·이름을 입력해 들어간다. 같은 네트워크에서는 내부 IP, 다른 네트워크에서는 공개 IP 또는 터널 주소를 쓴다.
- 대기실은 WebSocket으로 참가·접속 종료·준비 상태·퇴장·강퇴·방 닫기를 전파한다. 참가자 목록과 빈 자리를 보여준다.
- 로비 이벤트마다 연속 번호를 붙여 호스트 메모리에 모두 보관한다. 클라이언트가 번호 누락을 감지하면 빠진 범위만 재전송해 순서대로 적용한다.
- 준비된 참가자와 함께 호스트가 게임을 시작한다. 방마다 엔진 상태와 별도의 게임 변경 번호·이력을 가진다.
- 접속 시 게임 상태를 한 번 전달하고 이후 장면·지점·로그 변경만 전파한다. 재접속하거나 번호가 빠지면 누락 범위만 요청하고 번호 순서대로 반영한다.
- 호스트가 파티의 지역·섬 이동을 결정하고, 참가자는 자기 캐릭터의 지점 이동과 행동 입력만 보낸다.

## IP 직접 연결

- 자동 LAN 검색과 중앙 방 목록은 없다. `/rooms`는 직접 연결 메뉴와 현재 접속한 서버의 활성 방만 보여준다.
- 참가 화면에서 호스트 IP 또는 주소를 필수로 입력한다. 초대 링크에는 접속한 호스트 주소와 방 ID가 미리 채워진다.
- 호스트 대기실은 같은 네트워크에서 쓸 수 있는 내부 IP 초대 링크와 방 코드를 보여준다. 인터넷 참가자에게는 공개 IP:포트 또는 터널 주소를 전달한다.

## 실행

- `src/web/server.mjs`: Next.js 사용자 정의 서버, 로비 HTTP 요청, WebSocket 업그레이드.
- `src/host/lobby.mjs`: 한 활성 방의 소유권·참가자·이벤트 이력.
- `src/host/game-factory.mjs`: 섬 데이터를 읽어 방 게임에 주입하는 호스트 어댑터.
- `src/game/room.ts`: 엔진 기반 게임 상태, 명령 처리, 변경 이력과 현재 장면 투영.
- `src/protocol/play.ts`: 클라이언트·방 게임이 공유하는 명령과 상태 메시지.
- `src/web/lib/play/provider.tsx`: WebSocket 연결, 빠진 게임 변경 복구, 플레이 훅.
- `src/web/components/lobby/`: 직접 연결 메뉴, 생성, 참가, 대기실.

## 현재 한계와 다음 연결

방과 게임 상태·이력은 현재 호스트 프로세스 메모리에만 있다. 서버 재시작 시 방이 사라진다. 실제 GM, 영속 사건 저장, 예비 호스트 복제·승계는 [플레이어 호스팅 멀티플레이 설계](../player-hosted-multiplayer/spec.md)의 후속 단계다. 행동 입력의 GM 답변은 임시 문장이다.

## 화면 방향과 출처

- [Don't Starve Together의 서버 브라우저](https://steamcommunity.com/sharedfiles/filedetails/?id=3063102445): 게임 메뉴와 방 정보의 시각적 참고.
- [Stardew Valley 협동 플레이 메뉴](https://www.stardewvalley.net/multiplayer-troubleshooting-guide/): 호스트와 참가 흐름.
- 배경화 `src/web/public/lobby/archipelago-harbor.png`: 내장 ImageGen으로 생성. 프롬프트는 “A wide 16:9 hand-painted dark fantasy archipelago harbor at blue hour, fog, scattered islands, one distant lighthouse, dark calm center for game UI overlays; no text, logo or UI.”
