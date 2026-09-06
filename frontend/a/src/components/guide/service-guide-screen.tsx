"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import { restoreAuthenticatedUser } from "@/lib/api/auth";
import styles from "./service-guide-screen.module.css";

const ANALYSIS_DETAILS = [
  {
    label: "이용 횟수",
    description: "첫 분석 이용 시점부터 14일 동안 최대 10회 분석할 수 있어요. 이용 구간이 끝난 뒤 다음 분석을 시작하면 새 구간이 시작되고, 남은 횟수는 홈에서 확인할 수 있어요.",
  },
  {
    label: "횟수 차감",
    description: "입력한 상품이 분석 대상으로 확인되고 분석 절차를 시작할 때 1회가 사용돼요.",
  },
  {
    label: "비교 판매처",
    description: "올리브영, 무신사 뷰티, 쿠팡, 지그재그, 비그룸과 확인 가능한 브랜드 공식몰의 정보를 비교해요.",
  },
] as const;

const PRICE_DETAILS = [
  {
    title: "판매가와 공개 할인",
    description: "상품 페이지에서 확인할 수 있는 판매가, 자동 할인, 공개 쿠폰은 적용 조건과 금액이 확인된 경우 분석 가격에 반영해요.",
  },
  {
    title: "등록한 개인 혜택",
    description: "혜택 등록에 저장한 멤버십, 쇼핑 등급, 카드는 판매처의 혜택 조건과 일치하고 할인 금액까지 확인된 경우에만 반영해요.",
  },
  {
    title: "배송비",
    description: "확인된 배송비는 분석 가격에 포함해요. 배송비를 확인할 수 없으면 실구매가를 확정하지 않아요.",
  },
  {
    title: "반영하지 않는 혜택",
    description: "로그인 후에만 보이는 개인 쿠폰, 앱 전용 가격처럼 확인할 수 없는 혜택은 추정하지 않아요. 적립금과 포인트도 최종 가격에서 차감하지 않아요.",
  },
] as const;

const FAQ_ITEMS = [
  {
    question: "분석은 몇 번 사용할 수 있나요?",
    answer: "첫 분석부터 시작되는 14일 이용 구간마다 최대 10회예요. 구간이 끝난 뒤 다음 분석 시 새 이용 구간이 시작돼요.",
  },
  {
    question: "쿠폰이나 할인도 반영되나요?",
    answer: "공개 할인·쿠폰과 등록한 멤버십·등급·카드는 조건과 금액이 확인되면 반영해요. 확인할 수 없는 개인 쿠폰이나 앱 전용 혜택은 추정하지 않아요.",
  },
  {
    question: "실제 결제 가격과 분석 가격이 다를 수 있나요?",
    answer: "판매처의 가격, 재고, 배송 조건과 로그인 상태의 개인 혜택은 수시로 달라질 수 있어요. 구매 전 판매처의 최종 결제 화면을 확인해 주세요.",
  },
  {
    question: "분석 결과는 반드시 구매하라는 뜻인가요?",
    answer: "아니요. 상품 정보와 확인된 가격·혜택, 선택한 기준을 바탕으로 구매 판단을 돕는 참고 정보예요. 근거가 부족하면 추천을 확정하지 않을 수 있어요.",
  },
] as const;

export function ServiceGuideScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void restoreAuthenticatedUser().then((user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (!cancelled) setIsAuthorized(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!isAuthorized) return null;

  return (
    <AuthenticatedAppFrame
      pageClassName="home-page feature-page"
      shellClassName="home-mobile-shell feature-shell"
      headerClassName="home-header feature-header"
      backHref="/home"
      backLabel="홈으로 돌아가기"
    >
      <section className={styles.pageHeading} aria-labelledby="guide-title">
        <h1 className="section-page-title" id="guide-title">서비스 이용안내</h1>
        <p>캐치캐치를 이용하기 전에 알아두면 좋은 내용을 모아두었어요.</p>
      </section>

      <section className={styles.guideSection} aria-labelledby="usage-guide-title">
        <h2 id="usage-guide-title">테스트 이용 안내</h2>
        <dl className={styles.detailCard}>
          {ANALYSIS_DETAILS.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.guideSection} aria-labelledby="price-guide-title">
        <h2 id="price-guide-title">분석에는 무엇을 반영하나요?</h2>
        <div className={styles.copyCard}>
          {PRICE_DETAILS.map((detail) => (
            <article key={detail.title}>
              <h3>{detail.title}</h3>
              <p>{detail.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.guideSection} aria-labelledby="result-guide-title">
        <h2 id="result-guide-title">분석 결과에서 확인할 수 있어요</h2>
        <p className={styles.resultSummary}>
          판매처별 가격·배송비와 상품 구성, 최근 가격 흐름, 선택한 기준별 판단을 확인할 수 있어요. 비교 근거가 충분하면 최종 추천과 다른 구성의 용량당 가격도 함께 보여줘요.
        </p>
      </section>

      <section className={styles.guideSection} aria-labelledby="faq-title">
        <h2 id="faq-title">자주 묻는 질문</h2>
        <div className={styles.faqCard}>
          {FAQ_ITEMS.map((item) => (
            <article key={item.question}>
              <h3 className={styles.faqQuestion}>
                <span className={styles.faqPrefix}>Q.</span>
                <span>{item.question}</span>
              </h3>
              <p className={styles.faqAnswer}>
                <span className={styles.faqPrefix}>A.</span>
                <span>{item.answer}</span>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.guideSection} ${styles.notesSection}`} aria-labelledby="notes-title">
        <h2 id="notes-title">이용 전 참고해 주세요</h2>
        <ul className={styles.notesCard}>
          <li>확인할 수 없는 가격이나 혜택은 임의로 추정하지 않으며, 결과에 확인 불가 또는 주의사항으로 표시될 수 있어요.</li>
          <li>같은 상품을 우선 비교하고, 용량이나 구성이 다르면 확인 가능한 경우 용량당 가격으로 나누어 보여줘요.</li>
        </ul>
      </section>
    </AuthenticatedAppFrame>
  );
}
