"use client";

// 지도·현장 뷰 공통 무대. 이미지 원본 비율의 SVG 좌표계에 퍼센트 좌표를 그대로 올린다.

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/play/types";

const DEFAULT_SIZE = { w: 1600, h: 900 };

function useImageSize(src: string | null) {
  const [loaded, setLoaded] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => setLoaded({ src, w: img.naturalWidth || DEFAULT_SIZE.w, h: img.naturalHeight || DEFAULT_SIZE.h });
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return loaded && loaded.src === src ? loaded : null;
}

/** 화면에 그려진 SVG 박스 크기 */
function useBoxSize() {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ bw: number; bh: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ bw: entry.contentRect.width, bh: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, box };
}

export type Stage = {
  /** 퍼센트 좌표 → SVG 좌표 */
  at: (p: Point) => { x: number; y: number };
  /** 마커·글자 크기 기준. 화면에서 약 7px 이 되도록 맞춘다 (이미지 크기·비율과 무관) */
  unit: number;
};

export function MapStage({
  image,
  fallbackClassName,
  label,
  children,
}: {
  image: string | null;
  /** 이미지가 없을 때 바탕 (Tailwind fill-*) */
  fallbackClassName: string;
  label: string;
  children: (stage: Stage) => React.ReactNode;
}) {
  const loaded = useImageSize(image);
  const { ref, box } = useBoxSize();
  const { w, h } = loaded ?? DEFAULT_SIZE;
  // meet 배치에서 이미지가 실제로 그려지는 폭 → SVG 1 단위가 화면 몇 px 인지
  const drawnWidth = box && box.bw > 0 ? Math.min(box.bw, box.bh * (w / h)) : 800;
  const stage: Stage = { at: (p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h }), unit: (w / drawnWidth) * 7 };
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet" className="h-full w-full select-none" role="img" aria-label={label}>
      <rect width={w} height={h} className={fallbackClassName} />
      {image && loaded ? <image href={image} width={w} height={h} /> : null}
      {children(stage)}
    </svg>
  );
}

export type MarkerTone = "current" | "open" | "locked" | "idle" | "unknown";

const TONE: Record<MarkerTone, string> = {
  current: "fill-amber-400 stroke-amber-100",
  open: "fill-sky-500 stroke-sky-100",
  locked: "fill-zinc-500 stroke-zinc-300",
  idle: "fill-zinc-300 stroke-zinc-100",
  unknown: "fill-transparent stroke-zinc-300",
};

export function Marker({
  stage,
  point,
  label,
  tone,
  onSelect,
}: {
  stage: Stage;
  point: Point;
  label: string;
  tone: MarkerTone;
  onSelect?: () => void;
}) {
  const { x, y } = stage.at(point);
  const u = stage.unit;
  return (
    <g
      transform={`translate(${x} ${y})`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={label}
      className={onSelect ? "cursor-pointer outline-none [&:focus-visible>circle]:stroke-[6]" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <circle r={u * 1.3} strokeWidth={u * 0.3} strokeDasharray={tone === "locked" ? `${u * 0.6} ${u * 0.4}` : undefined} className={TONE[tone]} />
      <text
        y={-u * 2.1}
        textAnchor="middle"
        fontSize={u * 2}
        className="fill-white font-medium"
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: u * 0.45 }}
      >
        {label}
        {tone === "locked" ? " · 잠김" : ""}
      </text>
    </g>
  );
}

/** 좌표가 없는 항목을 무대 아래에 칩으로 보여준다. */
export function Unplaced({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-black/50 px-3 py-2 text-xs text-white">
      <span className="text-zinc-300">{title}</span>
      {children}
    </div>
  );
}

export const chipClass =
  "rounded border border-white/40 px-2 py-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
