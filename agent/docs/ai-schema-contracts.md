# CatchCatch AI 스키마 계약

기준일: 2026-07-19
브랜치: `ai`

이 문서는 AI 입출력과 백엔드 검증 계약을 사람이 검토할 수 있게 정리한 문서다. 실제 런타임 원본은 다음 Zod 파일이다.

```text
src/ai-contracts/product-data.schema.ts
src/ai-contracts/seller-domain.policy.ts
src/product-identification/product-identification.schema.ts
src/product-search/product-search.schema.ts
src/ai-judgment/ai-judgment.schema.ts
src/similar-product-search/similar-product-search.schema.ts
```

## 1. 공통 상품 데이터

### 판매처

```text
OLIVE_YOUNG
MUSINSA_BEAUTY
COUPANG
BRAND_OFFICIAL
```

### 상품 식별 정보

```json
{
  "brand": "string|null",
  "normalized_product_name": "string|null",
  "product_type": "string|null",
  "option": "string|null",
  "shade_or_scent": "string|null",
  "version_or_renewal": "string|null",
  "components": [
    {
      "type": "MAIN | REFILL | MINI | TRAVEL | OTHER_COSMETIC | NON_COSMETIC_GIFT",
      "name": "string|null",
      "capacity_value": "positive number|null",
      "capacity_unit": "ML | G | null",
      "quantity": "positive integer|null"
    }
  ]
}
```

`ML`과 `G`는 서로 변환하지 않는다. 비화장품 사은품은 용량이나 금액 가치로 환산하지 않는다.

## 2. 출처의 두 단계

### AI가 반환할 수 있는 출처 후보

```json
{
  "source_type": "SELLER_PAGE",
  "source_url": "https://...",
  "acquisition_method": "AI_WEB_SEARCH",
  "verification_status": "UNVERIFIED"
}
```

AI 출력에는 `observed_at`이 없다. 추가 필드도 허용하지 않는다.

### 백엔드가 생성하는 출처

```json
{
  "source_type": "SELLER_PAGE",
  "source_url": "https://...",
  "acquisition_method": "AI_WEB_SEARCH",
  "observed_at": "ISO 8601 datetime with offset",
  "verification_status": "UNVERIFIED | URL_VERIFIED | CONTENT_VERIFIED | REJECTED"
}
```

- `URL_VERIFIED`: 허용 도메인, 판매처 코드, 실제 검색 공급자 URL 목록을 통과함
- `CONTENT_VERIFIED`: 가격·옵션·구성 등 판단에 쓰는 페이지 내용까지 백엔드가 검증함
- 최종 판단 입력은 `CONTENT_VERIFIED`만 허용함

## 3. 판매처 도메인 정책

고정 판매처 매핑은 백엔드 코드가 소유한다.

```text
OLIVE_YOUNG   → oliveyoung.co.kr
MUSINSA_BEAUTY → musinsa.com
COUPANG       → coupang.com
```

브랜드 공식몰은 외부 요청에서 도메인을 받지 않는다.

```json
{
  "brand_id": "backend-brand-id|null"
}
```

서비스는 `BRAND_OFFICIAL_DOMAINS_JSON` 또는 향후 브랜드 저장소에서 공식몰 도메인을 조회한다. URL 비교 시 fragment, trailing slash, `utm_*`, `ref`, `tracking`, `fbclid`, `gclid`를 정규화한다.

## 4. 조건부 상품 식별 계약

### 입력

```json
{
  "product_url": "https://...",
  "allowed_domains": ["seller-domain"]
}
```

`allowed_domains`는 공개 요청 DTO가 아니라 백엔드가 구성한 내부 실행 컨텍스트다.

### AI 출력

```json
{
  "identification_status": "IDENTIFIED | AMBIGUOUS | UNSUPPORTED | UNKNOWN",
  "anchor_product": "ProductIdentity|null",
  "preview": {
    "seller": "Seller|null",
    "listed_price": "nonnegative integer|null",
    "image_url": "URL|null"
  },
  "source": "SourceCandidate|null",
  "warnings": ["string"]
}
```

### 백엔드 검증

- `IDENTIFIED`는 브랜드, 정규화 상품명, 제품 유형과 출처 필수
- 출처는 입력 URL과 정규화 후 동일해야 함
- 출처는 허용 도메인 안에 있어야 함
- 판매처 코드와 출처 도메인이 일치해야 함
- 백엔드가 `observed_at`과 `URL_VERIFIED`를 부여함

## 5. 동일상품 검색 계약

### 외부에서 백엔드로 전달할 입력

```json
{
  "product_url": "https://...",
  "anchor_product": "verified ProductIdentity",
  "brand_id": "string|null"
}
```

검색 실행 프롬프트에는 백엔드가 `brand_id`로 해결한 공식몰 도메인과 전체 허용 도메인만 전달한다.

### AI 오퍼 후보

```json
{
  "product_name": "string|null",
  "brand": "string|null",
  "product_type": "string|null",
  "option": "string|null",
  "shade_or_scent": "string|null",
  "version_or_renewal": "string|null",
  "list_price": "nonnegative integer|null",
  "listed_sale_price": "nonnegative integer|null",
  "public_coupon_amount": "nonnegative integer|null",
  "automatic_discount_amount": "nonnegative integer|null",
  "shipping_fee": "nonnegative integer|null",
  "discount_conditions": ["string"],
  "shipping_condition": "string|null",
  "components": []
}
```

검색 AI는 개인 쿠폰, 로그인 가격, 멤버십·카드 자격 가격을 위 공개 가격 필드에 넣을 수 없다.

### 판매처별 결과

```json
{
  "seller": "Seller",
  "availability": "AVAILABLE | NOT_AVAILABLE | UNKNOWN",
  "candidate_offer": "SearchedOffer|null",
  "match_evidence": ["string"],
  "mismatch_reasons": ["string"],
  "source": "SourceCandidate|null"
}
```

### 백엔드 검증

- 네 판매처가 정확히 한 번씩 존재해야 함
- `AVAILABLE`은 후보 오퍼, 출처, 명시적 일치 근거가 필수
- `UNKNOWN`, `NOT_AVAILABLE`은 후보 오퍼를 가질 수 없음
- AI가 응답의 `anchor_product`를 바꾸면 전체 거부
- 판매처 코드와 도메인이 다르면 거부
- 검색 공급자의 실제 source URL 목록에 없는 URL이면 거부
- 브랜드·상품명·제품 유형·기준 옵션이 누락되거나 충돌하면 `UNKNOWN`으로 강등
- AI 출처는 백엔드가 `observed_at`과 `URL_VERIFIED`를 부여한 뒤 저장

`URL_VERIFIED`는 상품 내용이 검증됐다는 뜻이 아니다. 별도 콘텐츠 검증을 통과하기 전에는 판단 fact로 승격하지 않는다.

## 6. 최종 판단 입력 계약

### 검증 오퍼

```json
{
  "offer_id": "string",
  "seller": "Seller",
  "product_name": "string",
  "comparison_status": "DIRECTLY_COMPARABLE | UNIT_COMPARABLE | NOT_COMPARABLE | UNKNOWN",
  "components": [],
  "public_effective_price": "nonnegative integer|null",
  "personalized_effective_price": "nonnegative integer|null",
  "personalized_price_status": "NOT_EVALUATED | VERIFIED_ELIGIBLE | VERIFIED_INELIGIBLE | UNKNOWN_ELIGIBILITY",
  "unit_price": "nonnegative number|null",
  "displayed_discount_rate": "number|null",
  "recent_average_discount_rate": "number|null",
  "previous_sale_discount_rate": "number|null",
  "recent_average_price": "nonnegative integer|null",
  "previous_sale_price": "nonnegative integer|null",
  "shipping_fee": "nonnegative integer|null",
  "source": "CONTENT_VERIFIED SourceMetadata"
}
```

`personalized_effective_price`는 `VERIFIED_ELIGIBLE`일 때만 값을 가질 수 있다.

### fact

```json
{
  "id": "unique-fact-id",
  "description": "string",
  "numeric_values": [0],
  "source_urls": ["CONTENT_VERIFIED offer source URL"]
}
```

fact의 모든 출처 URL은 현재 판단 입력의 검증 오퍼 출처에 포함되어야 한다.

### 전체 판단 입력 핵심 필드

```json
{
  "product_data_mode": "sample | web_search",
  "product": {},
  "offers": [],
  "facts": [],
  "selected_criteria": ["exactly 3 distinct criteria"],
  "criterion_assessments": ["exactly 3 matching assessments"],
  "comparison_price_basis": "PUBLIC | PERSONALIZED",
  "cheapest_offer_id": "string|null",
  "price_history_status": "SUFFICIENT | INSUFFICIENT | UNAVAILABLE",
  "data_quality": {
    "status": "COMPLETE | PARTIAL | LIMITED",
    "warnings": []
  },
  "allowed_conclusions": [],
  "allowed_offer_ids": []
}
```

추가 불변 조건:

- 추천 허용 오퍼와 최저가 오퍼는 `DIRECTLY_COMPARABLE` 또는 `UNIT_COMPARABLE`이어야 함
- `PUBLIC` 최저가 기준은 공개 실효 가격 필수
- `PERSONALIZED` 최저가 기준은 `VERIFIED_ELIGIBLE` 개인화 가격 필수
- fact ID, offer ID, 허용 목록은 중복 불가
- 기준별 fact ID는 해당 criterion assessment가 허용한 fact만 사용

## 7. 최종 판단 출력 계약

```json
{
  "evidence_review": {
    "supporting_fact_ids": ["fact-id"],
    "contradicting_fact_ids": ["fact-id"],
    "missing_evidence": ["string"]
  },
  "decision_status": "DECIDED | INSUFFICIENT_EVIDENCE",
  "conclusion": "LOW_POINT_BUY | NEAR_REGULAR_PRICE | REASONABLE_BUY | null",
  "conclusion_reason": "string",
  "confidence": {
    "level": "HIGH | MEDIUM | LOW",
    "reason": "string",
    "used_fact_ids": ["fact-id"]
  },
  "criteria_results": [
    {
      "criterion": "selected criterion",
      "status": "POSITIVE | NEUTRAL | NEGATIVE | UNKNOWN",
      "reason": "string",
      "used_fact_ids": ["fact-id"]
    }
  ],
  "recommended_offer_id": "allowed-offer-id|null",
  "recommendation_reason": "string",
  "warnings": ["string"],
  "used_fact_ids": ["fact-id"]
}
```

### 판단 유보 불변 조건

`INSUFFICIENT_EVIDENCE`이면 다음을 모두 만족해야 한다.

```text
conclusion = null
confidence.level = LOW
recommended_offer_id = null
contradicting_fact_ids 또는 missing_evidence 중 하나 이상 존재
```

AI는 백엔드가 허용 결론을 제공했더라도 근거가 부족하거나 충돌하면 판단을 유보할 수 있다.

`DECIDED`는 지지 fact가 한 개 이상 필요하다. 지지·반대 fact ID는 각각 중복될 수 없고 같은 fact를 양쪽에 동시에 넣을 수 없다.

## 8. 유사상품 검색 계약

### 입력

```json
{
  "anchor_product_id": "string",
  "anchor_product": "ProductIdentity",
  "selected_criteria": ["exactly 3 distinct criteria"],
  "allowed_domains": ["seller-domain"],
  "excluded_source_urls": ["URL"],
  "max_candidates": "integer 1..3"
}
```

### AI 출력

```json
{
  "search_status": "FOUND | NO_MATCH | INSUFFICIENT_DATA",
  "candidates": [
    {
      "product": "ProductIdentity",
      "seller": "Seller",
      "listed_price": "nonnegative integer|null",
      "similarity_reason": "string",
      "meaningful_differences": ["at least one string"],
      "matched_criteria": ["criterion"],
      "source": "SourceCandidate"
    }
  ],
  "warnings": ["string"]
}
```

### 백엔드 검증

- 최대 세 후보
- `FOUND`는 후보 한 개 이상, 다른 상태는 빈 배열
- 후보 URL 중복 금지
- 허용 도메인과 판매처 코드 일치
- 기준 상품 자체와 제외 URL 반환 금지
- 추적 파라미터를 제거한 정규화 URL로 중복 판정
- 백엔드가 관측 시각을 부여하되, 실제 검색 공급자 출처 대조 전에는 `UNVERIFIED` 유지

## 9. 소유권 경계

| 책임 | AI | 백엔드 |
|---|---:|---:|
| 검색 후보 URL과 페이지 원천값 추출 | O | 검증 |
| 관측 시각 생성 | X | O |
| 판매처-도메인 검증 | X | O |
| 상품 동일성 최종 확정 | X | O |
| 가격·할인·용량 계산 | X | O |
| 공개/개인화 가격 자격 판정 | X | O |
| facts와 출처 연결 | X | O |
| 결론·신뢰도·설명 선택 | O | 허용 범위 및 출력 검증 |
| 결과 영속 저장·사용자 격리 | X | O |
