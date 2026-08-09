import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "캐치캐치 | 상품 가격 분석",
  description: "가격 흐름과 판매처 조건을 비교해 현명한 구매 결정을 도와드려요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
