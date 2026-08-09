import type { ReactNode } from "react";
import Link from "next/link";

type AppLogoProps = {
  className: "brand" | "home-logo";
  leftAction?: ReactNode;
  rightAction?: ReactNode;
};

export function AppLogo({ className, leftAction, rightAction }: AppLogoProps) {
  return (
    <div className="app-logo-coordinate-space">
      <div className="app-logo-slot">
        <div className="app-header-action app-header-action-left">{leftAction}</div>
        <Link className={`${className} app-logo-link`} href="/home" aria-label="캐치캐치 홈으로 이동">캐치캐치</Link>
        <div className="app-header-action app-header-action-right">{rightAction}</div>
      </div>
    </div>
  );
}
