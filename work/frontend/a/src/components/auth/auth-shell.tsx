import type { ReactNode } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  backHref?: string;
  eyebrow?: string;
  className?: string;
  detachedBrand?: boolean;
};

export function AuthShell({ children, title, description, backHref, eyebrow, className, detachedBrand = false }: AuthShellProps) {
  const brandPlaceholder = <p className="brand logo-layout-placeholder" aria-hidden="true">캐치캐치</p>;
  const heading = (
    <>
      {backHref ? (
        <Link className="back-link" href={backHref} aria-label="이전 화면으로 이동">
          <span aria-hidden="true">←</span>
        </Link>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 id="stage-title">{title}</h1>
      {description ? <p className="stage-description">{description}</p> : null}
    </>
  );

  return (
    <main className="stage-shell">
      <section className={["stage-card", className].filter(Boolean).join(" ")} aria-labelledby="stage-title">
        <AppLogo className="brand" />
        {detachedBrand ? (
          <>
            <header className="stage-header stage-logo-header">{brandPlaceholder}</header>
            <div className="stage-content-group">
              <header className="stage-header">{heading}</header>
              {children}
            </div>
          </>
        ) : (
          <>
            <header className="stage-header">
              {brandPlaceholder}
              {heading}
            </header>
            {children}
          </>
        )}
      </section>
    </main>
  );
}
