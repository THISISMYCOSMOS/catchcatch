"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import styles from "@/components/preferences/preferences.module.css";
import { getMockAuthenticatedRoute, getMockAuthenticatedUsername } from "@/lib/mock/session";
import { SAVED_PRODUCTS } from "@/lib/mock/saved-products";

function HeartIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 5.7a5.2 5.2 0 0 0-7.4 0L12 7.1l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21l8.8-7.9a5.2 5.2 0 0 0 0-7.4Z" /></svg>;
}

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function SavedProductsScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [savedProductIds, setSavedProductIds] = useState(() => SAVED_PRODUCTS.map((product) => product.id));

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }
      if (!getMockAuthenticatedUsername()) {
        router.replace("/login");
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  if (!isAuthorized) return null;

  const visibleProducts = SAVED_PRODUCTS.filter((product) => savedProductIds.includes(product.id));

  return (
    <AuthenticatedAppFrame
      pageClassName="home-page feature-page"
      shellClassName="home-mobile-shell feature-shell"
      headerClassName="home-header feature-header"
      backHref="/home"
      backLabel="홈으로 돌아가기"
    >
      <section className={styles.pageHeading} aria-labelledby="saved-products-title">
        <h1 className="section-page-title" id="saved-products-title">관심 상품</h1>
      </section>

      <div className={styles.listToolbar}>
        <span>전체 ({visibleProducts.length})</span>
        <label>
          <span className="sr-only">정렬 기준</span>
          <select defaultValue="recent" aria-label="관심 상품 정렬 기준">
            <option value="recent">최근 추가순</option>
            <option value="price-low">낮은 가격순</option>
          </select>
        </label>
      </div>

      {visibleProducts.length > 0 ? (
        <ul className={`${styles.productList} recent-list`} aria-live="polite">
          {visibleProducts.map((product) => (
            <li className={`${styles.savedProductCard} recent-card recent-card-history`} key={product.id}>
              <div className="product-image-placeholder compact" aria-label="상품 이미지 없음" />
              <div className="recent-card-copy">
                <div className="recent-card-upper">
                  <h3>{product.name}</h3>
                  <strong className={styles.savedProductPrice}>{formatPrice(product.price)}</strong>
                  <p className={styles.savedProductMeta}>{product.brand}</p>
                </div>
              </div>
              <button
                className={styles.favoriteButton}
                type="button"
                aria-label={`${product.name} 관심 상품에서 삭제`}
                aria-pressed="true"
                onClick={() => setSavedProductIds((current) => current.filter((id) => id !== product.id))}
              >
                <HeartIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>
          <strong>저장한 관심 상품이 없어요.</strong>
          <p>상품 분석 결과에서 하트를 눌러 관심 상품을 추가해보세요.</p>
        </div>
      )}
    </AuthenticatedAppFrame>
  );
}
