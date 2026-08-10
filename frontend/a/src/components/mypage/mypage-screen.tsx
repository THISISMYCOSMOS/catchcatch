"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import { getMockUserProfile } from "@/lib/mock/profile";
import {
  getMockAuthenticatedRoute,
  getMockAuthenticatedUsername,
} from "@/lib/mock/session";

const MY_PAGE_ITEMS = [
  { label: "내 정보", href: "/mypage/profile" },
  { label: "세일 캘린더", href: "/sale-calendar" },
  { label: "관심상품", href: "/saved-products" },
  { label: "설정", href: "/settings" },
] as const;

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

export function MyPageScreen() {
  const router = useRouter();
  const [accountEmail, setAccountEmail] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const authorizationCheck = window.setTimeout(async () => {
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
      const profile = await getMockUserProfile(authenticatedUsername);
      if (isCancelled) return;
      setAccountEmail(profile?.email ?? "이메일 등록 정보 없음");
      setIsAuthorized(true);
    }, 0);
    return () => {
      isCancelled = true;
      window.clearTimeout(authorizationCheck);
    };
  }, [router]);

  if (!isAuthorized) return null;

  return (
    <AuthenticatedAppFrame pageClassName="home-page feature-page" shellClassName="home-mobile-shell feature-shell mypage-shell" headerClassName="home-header feature-header">
      <section className="feature-heading mypage-heading" aria-labelledby="mypage-title">
        <h1 className="section-page-title" id="mypage-title">마이페이지</h1>
        <div className="mypage-profile-summary">
          <span>로그인 계정</span>
          <p><strong>{accountEmail}</strong></p>
        </div>
      </section>

      <nav className="mypage-menu-card" aria-label="마이페이지 메뉴">
        <ul>
          {MY_PAGE_ITEMS.map((item) => (
            <li key={item.label}>
              <Link href={item.href}>
                <span>{item.label}</span>
                <ChevronIcon />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </AuthenticatedAppFrame>
  );
}
