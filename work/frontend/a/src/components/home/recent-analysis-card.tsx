import { KeyboardEvent, MouseEvent } from "react";
import { RecentAnalysisItem } from "@/lib/mock/home";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR") + "원";
}

type RecentAnalysisCardProps = {
  item: RecentAnalysisItem;
  onSelect: (id: string) => void;
};

const INTERACTIVE_ELEMENT_SELECTOR = "a, button, input, select, textarea, [role='button'], [data-prevent-card-click]";

function isNestedInteractiveElement(target: EventTarget, card: HTMLElement) {
  if (!(target instanceof Element) || target === card) return false;
  const interactiveElement = target.closest(INTERACTIVE_ELEMENT_SELECTOR);
  return interactiveElement !== null && interactiveElement !== card;
}

export function RecentAnalysisCard({ item, onSelect }: RecentAnalysisCardProps) {
  function handleClick(event: MouseEvent<HTMLElement>) {
    if (isNestedInteractiveElement(event.target, event.currentTarget)) return;
    onSelect(item.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect(item.id);
  }

  return (
    <article
      className="recent-card recent-card-interactive"
      role="button"
      tabIndex={0}
      aria-label={`${item.productName}의 이전 분석 결과 보기`}
      data-analysis-id={item.id}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {item.imageUrl ? (
        // The stored seller image may come from any external marketplace.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="recent-card-image" src={item.imageUrl} alt="" />
      ) : <div className="product-image-placeholder compact" aria-label="상품 이미지 없음" />}
      <div className="recent-card-copy">
        <h3>{item.productName}</h3>
        <p>{item.sellerName} <span aria-hidden="true">|</span> {item.analyzedAt}</p>
        <strong>{formatPrice(item.price)}</strong>
      </div>
    </article>
  );
}
