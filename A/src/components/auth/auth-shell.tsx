import type { ReactNode } from "react";
import Link from "next/link";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  backHref?: string;
  eyebrow?: string;
  className?: string;
};

export function AuthShell({ children, title, description, backHref, eyebrow, className }: AuthShellProps) {
  return (
    <main className="stage-shell">
      <section className={["stage-card", className].filter(Boolean).join(" ")} aria-labelledby="stage-title">
        <header className="stage-header">
          {backHref ? (
            <Link className="back-link" href={backHref} aria-label="이전 화면으로 이동">
              <span aria-hidden="true">←</span>
            </Link>
          ) : null}
          <p className="brand" aria-label="캐치캐치">캐치캐치</p>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 id="stage-title">{title}</h1>
          {description ? <p className="stage-description">{description}</p> : null}
        </header>
        {children}
      </section>
    </main>
  );
}
