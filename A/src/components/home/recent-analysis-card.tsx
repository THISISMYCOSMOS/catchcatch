import { RecentAnalysisItem } from "@/lib/mock/home";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR") + "원";
}

export function RecentAnalysisCard({ item }: { item: RecentAnalysisItem }) {
  return (
    <article className="recent-card">
      <div className="product-image-placeholder compact" aria-label="상품 이미지 없음" />
      <div className="recent-card-copy">
        <h3>{item.productName}</h3>
        <p>{item.sellerName} <span aria-hidden="true">|</span> {item.analyzedAt}</p>
        <strong>{formatPrice(item.price)}</strong>
      </div>
    </article>
  );
}
