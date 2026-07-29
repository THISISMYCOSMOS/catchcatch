"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import {
  getMockAuthenticatedRoute,
  getMockAuthenticatedUsername,
} from "@/lib/mock/session";

const MY_PAGE_ITEMS = [
  { label: "내 정보", href: "/mypage/profile" },
  { label: "세일 캘린더", href: "/sale-calendar" },
  { label: "관심상품", href: null },
  { label: "설정", href: null },
] as const;

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

export function MyPageScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }
      const authenticatedUsername = getMockAuthenticatedUsername();
      if (!authenticatedUsername) {
        router.replace("/login");
        return;
      }
      setUsername(authenticatedUsername);
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  if (!isAuthorized) return null;

  return (
    <AuthenticatedAppFrame pageClassName="home-page feature-page" shellClassName="home-mobile-shell feature-shell mypage-shell" headerClassName="home-header feature-header">
      <section className="feature-heading mypage-heading" aria-labelledby="mypage-title">
        <h1 className="section-page-title" id="mypage-title">마이페이지</h1>
        <div className="mypage-profile-summary">
          <span>로그인 계정</span>
          <p><strong>{username}</strong></p>
        </div>
      </section>

      <nav className="mypage-menu-card" aria-label="마이페이지 메뉴">
        <ul>
          {MY_PAGE_ITEMS.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <Link href={item.href}>
                  <span>{item.label}</span>
                  <ChevronIcon />
                </Link>
              ) : (
                <button type="button" aria-disabled="true">
                  <span>{item.label}</span>
                  <ChevronIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </AuthenticatedAppFrame>
  );
}
