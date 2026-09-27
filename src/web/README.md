# 웹 클라이언트

실행·접속 방법은 저장소 루트의 [README](../../README.md#웹-실행)를 따른다.

`app/`은 경로, `components/`는 화면, `lib/play/provider.tsx`는 게임 변경 동기화와 공개 훅, `lib/lobby/`는 대기실 메시지 계약을 맡는다. 방 소유권과 WebSocket은 `../host/`, 게임 명령과 상태는 `../game/`, 직렬화 계약은 `../protocol/`에 둔다. `server.mjs`는 Next.js와 호스트 어댑터를 조립하는 실행 진입점이다.

섬 화면은 `../islands/<섬_id>/web/`에서 `@codysseia/play`만 사용한다. 규칙·판정·상태 변경은 [대전제](../../docs/00_대전제.md)의 엔진 경계를 따른다.
