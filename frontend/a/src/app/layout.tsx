import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "캐치캐치",
  description: "화장품 구매 판단을 돕는 캐치캐치",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
