"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import styles from "@/components/preferences/preferences.module.css";
import { restoreAuthenticatedUser } from "@/lib/api/auth";
import { getSavedProducts, removeSavedProduct, type SavedProductCard } from "@/lib/api/saved-products";

function HeartIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 5.7a5.2 5.2 0 0 0-7.4 0L12 7.1l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21l8.8-7.9a5.2 5.2 0 0 0 0-7.4Z" /></svg>;
}

function formatPrice(price: number | null) {
  return price === null ? "가격 확인 필요" : `${price.toLocaleString("ko-KR")}원`;
}

export function SavedProductsScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [products, setProducts] = useState<SavedProductCard[]>([]);
  const [userId, setUserId] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await restoreAuthenticatedUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const savedProducts = await getSavedProducts();
      if (cancelled) return;
      setUserId(user.id);
      setProducts(savedProducts);
      setIsAuthorized(true);
    })().catch(() => {
      if (!cancelled) {
        setActionError("관심 상품을 불러오지 못했어요.");
        setIsAuthorized(true);
      }
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!isAuthorized) return null;

  async function remove(product: SavedProductCard) {
    if (!userId) return;
    setActionError("");
    try {
      await removeSavedProduct(userId, product.productId);
      setProducts((current) => current.filter((item) => item.productId !== product.productId));
    } catch {
      setActionError("관심 상품을 삭제하지 못했어요.");
    }
  }

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
        <span>전체 ({products.length})</span>
        <label>
          <span className="sr-only">정렬 기준</span>
          <select defaultValue="recent" aria-label="관심 상품 정렬 기준">
            <option value="recent">최근 추가순</option>
            <option value="price-low">낮은 가격순</option>
          </select>
        </label>
      </div>

      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      {products.length > 0 ? (
        <ul className={`${styles.productList} recent-list`} aria-live="polite">
          {products.map((product) => (
            <li className={`${styles.savedProductCard} recent-card recent-card-history`} key={product.productId}>
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="recent-card-image" src={product.imageUrl} alt="" />
              ) : <div className="product-image-placeholder compact" aria-label="상품 이미지 없음" />}
              <div className="recent-card-copy">
                <div className="recent-card-upper">
                  <h3>{product.canonicalName}</h3>
                  <strong className={styles.savedProductPrice}>{formatPrice(product.currentPrice)}</strong>
                  <p className={styles.savedProductMeta}>{product.brand ?? product.sellerName ?? "브랜드 확인 필요"}</p>
                </div>
              </div>
              <button
                className={styles.favoriteButton}
                type="button"
                aria-label={`${product.canonicalName} 관심 상품에서 삭제`}
                aria-pressed="true"
                onClick={() => void remove(product)}
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
