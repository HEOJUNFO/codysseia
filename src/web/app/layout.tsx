import type { Metadata } from "next";
import { Hahmlet, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const displayFont = Hahmlet({
  variable: "--font-display",
  display: "swap",
  preload: false,
});

const uiFont = Noto_Sans_KR({
  variable: "--font-ui",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "코디세이아",
  description: "여러 제작자가 만든 섬을 탐험하는 디지털 TRPG",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${displayFont.variable} ${uiFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
