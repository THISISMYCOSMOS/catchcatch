# CatchCatch 인기 상품 100개 데이터셋 수집 인계 프롬프트

아래 요청을 그대로 수행해 주세요. 작업 목적은 CatchCatch 데이터베이스에 안전하게 가져올 수 있는 인기 뷰티 상품 100개 데이터셋을 만드는 것입니다. **데이터베이스에는 직접 접속하거나 입력하지 말고**, 완성된 Excel 파일과 검수 보고서만 전달해 주세요.

## 1. 목표

- 국내에서 현재 인기 있는 뷰티 상품 **정확히 100개**를 선정합니다.
- 상품 자체의 기준 정보와 판매처별 실제 상품 상세 URL을 분리해 정리합니다.
- 동일 상품이라도 용량, 색상·호수·향, 리뉴얼 버전, 세트 구성이나 수량이 다르면 서로 다른 상품 또는 오퍼로 구분합니다.
- 확인하지 못한 정보는 추정하지 않습니다.
- 가격은 수집 시점의 비로그인 공개 가격만 기록합니다.
- 인기 근거와 상품·가격 확인 근거를 다시 검수할 수 있도록 출처 URL과 확인 시각을 기록합니다.

## 2. 조사 가능한 판매처

다음 판매처만 이번 데이터셋에 포함합니다. `seller_code`에는 아래 영문 코드를 정확히 사용해 주세요.

| 판매처 | seller_code | 허용되는 URL 예시 |
| --- | --- | --- |
| 올리브영 | `OLIVE_YOUNG` | `https://www.oliveyoung.co.kr/...` |
| 무신사 뷰티 | `MUSINSA_BEAUTY` | `https://www.musinsa.com/...` |
| 쿠팡 | `COUPANG` | `https://www.coupang.com/vp/products/...` |
| 지그재그 | `ZIGZAG` | `https://zigzag.kr/...` 또는 `https://store.zigzag.kr/...` |
| 브랜드 공식몰 | `BRAND_OFFICIAL` | 해당 브랜드가 직접 운영하는 공식 도메인의 상품 상세 URL |

이번 작업에서는 네이버쇼핑, 스마트스토어, 11번가, G마켓, 옥션, SSG, 롯데온 및 기타 판매처를 넣지 마세요. 쿠팡 URL은 일반 상품 상세 URL만 사용하고 쿠팡 파트너스 단축 URL은 만들지 마세요. 비그룸 데이터도 이번 파일에 포함하지 마세요.

## 3. 인기 상품 선정 기준

- 인기 상품은 판매처의 공식 베스트·랭킹·인기상품 페이지처럼 확인 가능한 공개 근거를 사용합니다.
- 개인 블로그, 광고성 게시물, 출처 없는 추천 목록만으로 선정하지 마세요.
- 한 브랜드나 한 카테고리에 과도하게 편중되지 않도록 스킨케어, 선케어, 클렌징, 메이크업, 헤어·바디 등 실제 인기 분포를 반영합니다.
- 동일 제품의 단순 판매처 차이는 상품 수를 별도로 세지 않습니다. 같은 기준 상품은 1개 상품이며 판매처 URL만 여러 개입니다.
- 용량, 색상·호수·향 또는 리뉴얼 버전이 다르면 동일 상품으로 합치지 않습니다.
- `popularity_rank`는 해당 출처 화면에 실제 순위가 있을 때만 기록합니다. 순위가 없으면 빈칸으로 둡니다.
- 인기 근거 확인 시각은 한국 시간 ISO 8601 형식으로 기록합니다. 예: `2026-09-05T10:30:00+09:00`.

## 4. 최종 산출물

다음 두 파일을 전달해 주세요.

1. `catchcatch_popular_products_100.xlsx`
2. `catchcatch_popular_products_100_QA.md`

Excel 파일에는 아래 네 시트가 정확히 있어야 합니다.

1. `products`
2. `product_components`
3. `seller_offers`
4. `seller_offer_components`

셀 병합, 수식, 매크로, 숨김 시트, 색상만으로 의미를 구분하는 방식은 사용하지 마세요. 첫 행은 영문 컬럼명으로 고정하고, 데이터가 없는 셀은 빈칸으로 둡니다. `없음`, `-`, `N/A`, `0원` 같은 임의 표기를 사용하지 마세요.

## 5. `products` 시트

정확히 100행이어야 하며 `dataset_product_id`는 `P001`부터 `P100`까지 중복 없이 사용합니다.

| 컬럼 | 필수 | 형식 및 규칙 |
| --- | --- | --- |
| `dataset_product_id` | 필수 | `P001`~`P100` |
| `brand` | 필수 | 페이지에 표시된 공식 브랜드명 |
| `canonical_name` | 필수 | 용량·증정 문구를 제거한 기준 상품명. 식별에 필요한 라인명은 유지 |
| `product_type` | 필수 | 예: 토너, 세럼, 크림, 선크림, 쿠션, 립틴트 |
| `option` | 선택 | 기준 옵션. 예: 기본, 기획세트, 본품+리필 |
| `shade_or_scent` | 선택 | 색상, 호수 또는 향. 예: 21N, 피그피그, 라벤더 |
| `version_or_renewal` | 선택 | 리뉴얼·연도·세대가 명확할 때만 기록 |
| `package_type` | 필수 | `single`, `set`, `bundle`, `unknown` 중 하나 |
| `image_url` | 선택 | HTTPS 상품 대표 이미지 URL. 검색 썸네일보다 상품 페이지 이미지를 우선 |
| `popularity_rank` | 선택 | 실제 공개 순위가 있을 때만 1 이상의 정수 |
| `popularity_source` | 필수 | 예: 올리브영 베스트, 무신사 뷰티 랭킹 |
| `popularity_source_url` | 필수 | 인기 근거를 확인한 HTTPS 페이지 |
| `popularity_observed_at` | 필수 | 한국 시간 ISO 8601 |

## 6. `product_components` 시트

기준 상품의 구성과 용량을 기록합니다. 한 상품에 구성품이 여러 개면 여러 행으로 작성합니다.

| 컬럼 | 필수 | 형식 및 규칙 |
| --- | --- | --- |
| `dataset_product_id` | 필수 | `products` 시트에 존재하는 ID |
| `component_order` | 필수 | 상품별 1부터 시작하는 정수 |
| `component_type` | 필수 | 아래 허용값 중 하나 |
| `component_name` | 선택 | 구성품의 실제 명칭 |
| `capacity_value` | 선택 | 0보다 큰 숫자. 단위 문자는 넣지 않음 |
| `capacity_unit` | 선택 | `ML`, `G` 중 하나. 확인 불가 시 빈칸 |
| `quantity` | 선택 | 1 이상의 정수 |

`component_type` 허용값:

- `MAIN`: 기준 본품
- `REFILL`: 리필
- `MINI`: 미니어처
- `TRAVEL`: 여행용
- `OTHER_COSMETIC`: 다른 화장품 증정품
- `NON_COSMETIC_GIFT`: 파우치, 화장솜 등 비화장품 사은품
- `UNKNOWN`: 구성을 확인할 수 없음

주의사항:

- ML과 G를 서로 환산하지 마세요.
- `1+1`, `2개입`은 본품 한 행의 `quantity=2`로 기록할 수 있습니다.
- 본품 50ML와 리필 50ML는 각각 `MAIN`, `REFILL` 행으로 분리합니다.
- 샘플이나 사은품을 본품 용량에 더하지 마세요.

## 7. `seller_offers` 시트

각 상품을 실제로 판매하는 판매처별 상세 페이지를 기록합니다. 한 상품이 여러 판매처에 있으면 여러 행을 작성합니다. 가능하면 다섯 판매처를 모두 확인하되, 정확한 동일 상품·동일 옵션을 찾은 경우에만 오퍼를 기록합니다.

| 컬럼 | 필수 | 형식 및 규칙 |
| --- | --- | --- |
| `dataset_offer_id` | 필수 | 중복 없는 값. 예: `O-P001-OLIVEYOUNG-01` |
| `dataset_product_id` | 필수 | `products` 시트에 존재하는 ID |
| `seller_code` | 필수 | 허용된 다섯 코드 중 하나 |
| `seller_url` | 필수 | HTTPS 실제 상품 상세 URL |
| `availability` | 필수 | `AVAILABLE`, `NOT_AVAILABLE`, `UNKNOWN` 중 하나 |
| `product_name_on_page` | 필수 | 판매 페이지에 표시된 상품명 원문 |
| `list_price` | 선택 | 정상가. 원 단위 0 이상의 정수 |
| `listed_sale_price` | 선택 | 비로그인 상태의 공개 판매가. 원 단위 0 이상의 정수 |
| `public_coupon_amount` | 선택 | 누구나 즉시 사용할 수 있음이 명확한 공개 쿠폰 금액 |
| `automatic_discount_amount` | 선택 | 결제 전에 자동 적용됨이 명확한 할인 금액 |
| `shipping_fee` | 선택 | 기본 공개 배송비. 무료면 `0` |
| `app_benefit_advertised` | 필수 | 앱 혜택 문구가 있으면 `true`, 아니면 `false` |
| `price_observed_at` | 선택 | 가격을 직접 확인한 한국 시간 ISO 8601. 가격이 모두 빈칸이면 빈칸 가능 |
| `match_verified_at` | 필수 | 상품·옵션 일치를 확인한 한국 시간 ISO 8601 |
| `verification_note` | 필수 | 브랜드·상품명·용량·옵션이 어떻게 일치하는지 짧고 구체적으로 기록 |

가격 작성 규칙:

- 숫자에는 쉼표, 통화기호, `원`을 넣지 않습니다. 예: `17900`.
- 로그인, 멤버십, 특정 사용자, 보유 쿠폰, 카드, 간편결제, 첫 구매 전용 가격은 기록하지 않습니다.
- 앱 전용 추가 혜택은 가격에서 차감하지 말고 `app_benefit_advertised=true`로만 표시합니다.
- 공개 판매가에 이미 포함된 할인을 `automatic_discount_amount`에 중복 기록하지 않습니다.
- 가격이나 할인 구조가 불명확하면 해당 셀을 비웁니다. 추정 계산하지 않습니다.
- `AVAILABLE`이라도 가격 확인에 실패했다면 가격 셀을 비울 수 있습니다.
- `NOT_AVAILABLE`은 페이지에 품절·판매 종료가 명확히 표시된 경우에만 사용합니다.
- 접속 차단, 로그인 요구, 로봇 차단, 페이지 오류는 `NOT_AVAILABLE`이 아니라 `UNKNOWN`입니다.

URL 작성 규칙:

- 검색결과, 카테고리, 베스트 목록, 장바구니 URL이 아니라 개별 상품 상세 URL이어야 합니다.
- URL 단축 서비스나 제휴 링크를 사용하지 않습니다.
- 추적용 파라미터는 가능하면 제거하되 상품·옵션 식별에 필요한 파라미터는 유지합니다.
- 실제로 브라우저에서 열어 상품 페이지임을 확인합니다.
- 브랜드 공식몰은 마켓 입점관이 아니라 브랜드가 직접 운영하는 공식 도메인만 허용합니다.

## 8. `seller_offer_components` 시트

판매처 오퍼의 실제 구성을 기록합니다. 판매처별 기획세트, 1+1, 리필 포함 구성이 기준 상품과 다를 수 있으므로 가능한 모든 오퍼에 작성해 주세요.

| 컬럼 | 필수 | 형식 및 규칙 |
| --- | --- | --- |
| `dataset_offer_id` | 필수 | `seller_offers` 시트에 존재하는 ID |
| `component_order` | 필수 | 오퍼별 1부터 시작하는 정수 |
| `component_type` | 필수 | `product_components`와 동일한 허용값 |
| `component_name` | 선택 | 페이지에 표시된 구성품명 |
| `capacity_value` | 선택 | 0보다 큰 숫자 |
| `capacity_unit` | 선택 | `ML`, `G` 또는 빈칸 |
| `quantity` | 선택 | 1 이상의 정수 |

## 9. 상품 동일성 판정 규칙

판매처 오퍼를 기준 상품과 연결하려면 아래 항목을 모두 대조합니다.

- 브랜드
- 상품 라인 및 정규 상품명
- 제품 유형
- 용량과 단위
- 수량 및 세트 구성
- 옵션
- 색상·호수·향
- 리뉴얼 또는 버전

하나라도 명확히 다르면 같은 상품 오퍼로 연결하지 마세요. 동일성이 불명확하면 `availability=UNKNOWN`으로 두고 가격을 비우며 `verification_note`에 불명확한 항목을 기록합니다.

## 10. 중복 금지 규칙

- `dataset_product_id`는 중복될 수 없습니다.
- `dataset_offer_id`는 중복될 수 없습니다.
- 같은 상품에서 `seller_code + seller_url` 조합은 중복될 수 없습니다.
- URL 끝의 `/` 유무나 불필요한 추적 파라미터만 다른 동일 URL을 별도 오퍼로 만들지 마세요.
- 같은 상품의 단순 이름 표기 차이는 중복 상품으로 만들지 마세요.
- 용량·옵션·호수·향·버전이 실제로 다른 경우에는 합치지 마세요.

## 11. 작성하면 안 되는 값

다음 값은 데이터베이스 가져오기 단계에서 시스템이 생성하거나 계산하므로 Excel에 만들지 마세요.

- DB UUID
- `product_key`
- `market_effective_price`
- `user_effective_price`
- `comparison_status`
- `purchase_url`
- 쿠팡 파트너스 링크
- `price_history` 또는 추정 과거 가격
- 사용자별 멤버십·카드·쿠폰 할인 가격

## 12. 예시

`products` 예시:

```csv
dataset_product_id,brand,canonical_name,product_type,option,shade_or_scent,version_or_renewal,package_type,image_url,popularity_rank,popularity_source,popularity_source_url,popularity_observed_at
P001,라운드랩,자작나무 수분 선크림,선크림,기본,,,single,https://example.com/image.jpg,1,올리브영 베스트,https://example.com/ranking,2026-09-05T10:30:00+09:00
```

`product_components` 예시:

```csv
dataset_product_id,component_order,component_type,component_name,capacity_value,capacity_unit,quantity
P001,1,MAIN,자작나무 수분 선크림,50,ML,1
```

`seller_offers` 예시:

```csv
dataset_offer_id,dataset_product_id,seller_code,seller_url,availability,product_name_on_page,list_price,listed_sale_price,public_coupon_amount,automatic_discount_amount,shipping_fee,app_benefit_advertised,price_observed_at,match_verified_at,verification_note
O-P001-OLIVEYOUNG-01,P001,OLIVE_YOUNG,https://www.oliveyoung.co.kr/example,AVAILABLE,[라운드랩] 자작나무 수분 선크림 50ML,25000,17900,,,0,false,2026-09-05T10:40:00+09:00,2026-09-05T10:40:00+09:00,브랜드 상품명 본품 50ML 기본 옵션 일치
```

`seller_offer_components` 예시:

```csv
dataset_offer_id,component_order,component_type,component_name,capacity_value,capacity_unit,quantity
O-P001-OLIVEYOUNG-01,1,MAIN,자작나무 수분 선크림,50,ML,1
```

## 13. QA 보고서

`catchcatch_popular_products_100_QA.md`에는 아래 내용을 포함합니다.

- 전체 상품 수
- 판매처별 오퍼 수
- `AVAILABLE`, `NOT_AVAILABLE`, `UNKNOWN` 개수
- 가격까지 확인한 오퍼 수
- 가격을 확인하지 못한 오퍼 수와 사유별 개수
- 공식몰 오퍼 수와 공식 도메인 확인 방법
- 중복 검사 결과
- 누락 필수값 검사 결과
- 잘못된 enum 검사 결과
- HTTP 또는 잘못된 URL 검사 결과
- 상품별 구성품 누락 검사 결과
- 사람이 추가 판단해야 하는 행 목록
- 사용한 인기 출처 목록과 확인 일시

## 14. 최종 검수 기준

다음 조건을 모두 만족해야 완료입니다.

- `products`에 정확히 100개 상품이 있습니다.
- 모든 상품에 인기 근거 URL과 확인 시각이 있습니다.
- 모든 상품에 최소 1개의 `product_components` 행이 있습니다.
- 모든 `seller_offers` URL을 실제로 열어 개별 상품 페이지임을 확인했습니다.
- 판매처 코드와 URL 도메인이 일치합니다.
- 다른 옵션이나 다른 버전의 가격을 같은 상품 가격으로 넣지 않았습니다.
- 개인화 할인이나 앱 전용 혜택을 공개 가격에서 차감하지 않았습니다.
- 추정값, 임의 환산값, 가짜 과거 가격이 없습니다.
- 네 시트 간 참조 ID가 모두 연결됩니다.
- 중복 ID 및 중복 오퍼가 없습니다.
- QA 보고서가 함께 제공됩니다.

완성 파일을 전달할 때 임의로 DB에 업로드하지 말고, CatchCatch 담당자의 스키마 검증과 가져오기 승인을 기다려 주세요.
