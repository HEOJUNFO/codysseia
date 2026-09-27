"use client";

// 가장 간단한 장면: 코어 현장 뷰를 그대로 쓴다.
// 배경은 지역 yaml 의 image, 지점 위치는 spots[].position 에서 온다.
// 직접 그리고 싶으면 useGameState / useMove / useSendAction 으로 바꾼다 (docs/01_섬_제작_템플릿.md 12절).
import { LocationView } from "@codysseia/play";

export default function Scene() {
  return <LocationView />;
}
