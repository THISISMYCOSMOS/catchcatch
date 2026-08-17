"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { FormField } from "@/components/auth/form-field";
import { isMockAuthenticated } from "@/lib/mock/session";
import styles from "./inquiry.module.css";

export function InquiryScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      if (!isMockAuthenticated()) {
        router.replace("/login");
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !content.trim()) return;
    // 문의 API가 연결되기 전까지 입력값을 전송하거나 성공 상태를 표시하지 않습니다.
  }

  if (!isAuthorized) return null;

  return (
    <>
      <AppLogo
        className="home-logo"
        leftAction={<Link className="recent-back" href="/home" aria-label="홈으로 돌아가기">‹</Link>}
      />
      <main className="home-page feature-page">
        <div className="home-mobile-shell feature-shell">
          <header className="home-header feature-header">
            <span aria-hidden="true" />
            <p className="home-logo logo-layout-placeholder" aria-hidden="true">캐치캐치</p>
            <span aria-hidden="true" />
          </header>

          <section className={styles.pageHeading} aria-labelledby="inquiry-title">
            <h1 className="section-page-title" id="inquiry-title">1:1 문의</h1>
          </section>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <FormField
              id="inquiry-subject"
              label="문의 제목"
              homeLinkFocus
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <div className="field-group">
              <label htmlFor="inquiry-content">문의 내용</label>
              <textarea
                className={styles.textarea}
                id="inquiry-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
            <button className={`button button-primary ${styles.submit}`} type="submit" disabled={!subject.trim() || !content.trim()}>
              문의 보내기
            </button>
          </form>

          <section className={styles.myInquiries} aria-labelledby="my-inquiries-title">
            <h2 id="my-inquiries-title">내 문의</h2>
            <p className={styles.emptyState}>아직 작성한 문의가 없어요.</p>
          </section>
        </div>
      </main>
    </>
  );
}
