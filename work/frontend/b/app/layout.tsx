import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "캐치캐치 | 화장품 가격 분석",
  description: "표시가 너머의 실구매가와 판매처 조건을 비교해 보세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
