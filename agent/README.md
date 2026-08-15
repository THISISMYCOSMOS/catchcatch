# CatchCatch / 캐치캐치

캐치캐치는 화장품 상품 링크를 넣으면 지금 가격이 살 만한 가격인지 확인해 주는 웹앱입니다.

화장품은 세일이 잦고 판매처마다 조건이 다릅니다. 표시가는 낮아 보여도 쿠폰, 배송비, 용량, 기획세트 구성, 직전 세일가까지 보면 실제로는 별로 싸지 않은 경우가 있습니다. 캐치캐치는 이 조건들을 같은 기준으로 정리해서 사용자가 결제 전에 한 번 더 판단할 수 있게 합니다.

## 하려는 것

- 상품 링크에서 이름, 브랜드, 용량, 옵션, 구성품을 읽어옵니다.
- 올리브영, 무신사 뷰티, 쿠팡, 브랜드 공식몰의 가격 조건을 비교합니다.
- 쿠폰과 배송비를 포함한 실구매가를 계산합니다.
- 1ml 또는 1g 기준으로 용량당 가격을 계산합니다.
- 최근 평균가와 직전 세일가를 비교합니다.
- 최저가와 추천 구매처를 따로 보여줍니다.
- 정보가 부족하거나 상품 매칭이 애매하면 신뢰도를 낮춰 표시합니다.

## 사용자 기준

사용자는 가입할 때 구매 기준 3개를 고릅니다.

- 가장 적게 결제하기
- 지금 사기 좋은지 확인하기
- 본품·추가 용량 많이 받기
- 용량 대비 오래 쓰기
- 한정 사은품 챙기기
- 필요한 만큼만 사기

결과 화면에서는 전체 판단과 함께 사용자가 고른 기준별 결과를 따로 보여줍니다.

## 결과

결과는 크게 세 가지로 나눕니다.

- `저점매수`: 최근 평균가나 직전 세일보다 조건이 좋은 경우
- `평시 가격에 가까움`: 세일처럼 보이지만 최근 평소 구매 가능한 가격과 큰 차이가 없는 경우
- `적당히 살 만함`: 가격만 보면 저점은 아니지만 구성이나 사은품까지 보면 살 이유가 있는 경우

결론 아래에는 가격 변화 차트, 판매처별 비교표, 기준별 판단 근거를 둡니다.

## MVP 범위

처음부터 모든 판매처의 실시간 가격을 자동으로 수집하지는 않습니다. 데모에서는 대표 상품과 샘플 데이터를 먼저 넣고, 링크 입력부터 결과 화면까지 흐름이 실제로 동작하는 것을 목표로 합니다.

MVP에서 구현할 내용:

- 회원가입 및 구매 기준 선택
- 상품 링크 입력
- 샘플 상품 데이터 조회
- 실구매가, 용량당 가격, 실질 할인율 계산
- 상품 구성품 구분
- 최종 결론과 기준별 결과 표시
- 관심 상품 저장 및 알림 예시

## API 초안

- `POST /analyze-link`
- `GET /analysis/{id}`
- `GET /products/{id}/offers`
- `POST /user-criteria`
- `POST /saved-products`
- `GET /saved-products`
- `POST /alerts`

## 기술 방향

- Frontend: React 또는 Next.js
- Backend: Node.js 또는 NestJS
- Database: Supabase PostgreSQL
- AI: OpenAI API
- Chart: Recharts
- Deploy: Vercel, Render, Supabase

AI는 가격을 새로 만들거나 임의로 판단하지 않습니다. 상품 설명에서 단품, 기획세트, 본품, 추가 용량, 사은품을 구분하고 계산 결과를 설명하는 데 사용합니다.

## Agent 서비스 실행 모드

`agent/`는 Core가 순서대로 호출하는 세 내부 엔드포인트(`product-identification` → `product-search` → `ai-judgment`)를 제공하는 NestJS 서비스입니다. 두 환경 변수로 실제 OpenAI 호출 여부를 결정합니다.

| 변수 | 값 | 동작 |
|---|---|---|
| `PRODUCT_DATA_MODE` | `sample` (기본값) | `product-identification`, `product-search`가 OpenAI를 호출하지 않고, 실제 응답과 동일한 Zod 스키마를 통과하는 고정 샘플 데이터를 반환합니다. 응답의 `warnings`에 샘플 데이터임을 명시합니다. |
| | `web_search` | OpenAI Responses API의 `web_search` 도구로 실제 판매처를 조회합니다. `OPENAI_API_KEY`가 필요합니다. |
| `AI_JUDGMENT_MODE` | `mock` (기본값) | `ai-judgment`가 OpenAI를 호출하지 않고, 입력을 그대로 반영한 결정적 mock 판단을 반환합니다. |
| | `real` | OpenAI로 실제 구매 판단을 생성합니다. `OPENAI_API_KEY`가 필요합니다. |

`agent/.env.example`을 그대로 `.env`로 복사하고 `INTERNAL_API_TOKEN`만 채우면(`PRODUCT_DATA_MODE=sample`, `AI_JUDGMENT_MODE=mock`이 기본값이므로) `OPENAI_API_KEY` 없이도 세 엔드포인트 모두 스키마를 통과하는 응답을 반환합니다. Core↔Agent 연동을 로컬에서 확인할 때는 이 기본값을 그대로 쓰면 됩니다. 실제 판매처 데이터와 실제 AI 판단이 필요할 때만 두 값을 각각 `web_search`, `real`로 바꾸고 `OPENAI_API_KEY`를 채웁니다.

### 브랜드 공식몰 도메인 발견 (`web_search` 모드 전용)

네 판매처 중 올리브영·무신사 뷰티·쿠팡은 도메인이 코드에 고정되어 있지만(`FIXED_SELLER_DOMAINS`), 브랜드 공식몰 도메인은 상품마다 다릅니다. 이전에는 `brand_id`로 조회하는 사람이 관리하는 레지스트리를 썼지만, 지금은 식별된 브랜드명으로부터 도메인 후보를 발견(discovery)한 뒤 코드가 검증합니다. 이 동작은 런타임 비용과 신뢰 경계를 함께 바꾸므로 아래 네 가지를 알고 써야 합니다.

**요청당 비용.** `PRODUCT_DATA_MODE=web_search`이고 `anchor_product.brand`가 있으며 그 브랜드가 캐시에 없으면, 검색 호출 **이전에** OpenAI `responses.parse` 호출이 1회 추가됩니다. 즉 캐시 미스는 검색 1건당 OpenAI 호출 2회, 캐시 히트는 1회입니다. 발견 호출은 `web_search` 도구를 붙이지 않고(모델이 이미 아는 지식만 사용) 출력도 `candidate_domain` 하나뿐이라 검색 호출보다 훨씬 작지만, 지연 시간은 왕복 1회만큼 늘어납니다. 모델과 클라이언트 설정은 검색 호출과 동일합니다(`OPENAI_SEARCH_MODEL` → 없으면 `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, `maxRetries: 0`, `store: false`).

**캐시 키와 수명.** 프로세스 메모리 안의 `Map` 하나입니다(`ProductSearchService.brandOfficialDomainCache`).

- 키: 브랜드명을 NFKC 정규화 → 공백 제거 → 소문자화한 값
- 값: 게이트를 통과한 도메인 문자열
- 게이트를 통과한 도메인만 캐시합니다. 후보 없음, 게이트 거부, API 실패는 캐시하지 않으므로 그 브랜드는 다음 요청에서 발견을 다시 시도합니다(= 실패한 브랜드는 매 요청 1회씩 호출 비용이 계속 듭니다).
- **TTL 1시간, 최대 200개**(`BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS`, `BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES`). 만료된 항목은 조회 시 버려지고, 200개를 넘으면 가장 오래 전에 넣은 항목부터 밀어냅니다. 잘못 발견된 도메인이 프로세스가 죽을 때까지 재사용되는 것을 막기 위한 상한입니다. 캐시는 비용 절감 장치일 뿐이므로, 항목이 밀려나도 발견 호출 1회를 더 쓸 뿐 정확성에는 영향이 없습니다.
- 그 밖에는 영속 저장이 없습니다. 재시작하면 비워지고, 인스턴스를 여러 개 띄우면 캐시도 인스턴스마다 따로입니다.
- 브랜드명이 100자를 넘으면 발견 자체를 건너뜁니다. 브랜드명은 상품 페이지에서 AI가 뽑아낸 값이라 신뢰 경계 밖에서 오고, 그 문자열이 곧 캐시 키이기 때문입니다.

**게이트.** 모델은 후보를 제안만 하고, 신뢰 여부는 규칙 기반 코드(`gateBrandOfficialDomainCandidate`)가 정합니다.

- HTTPS 호스트명으로 정규화되지 않으면 거부
- **퓨니코드(IDN) 도메인은 거부.** `new URL()`을 거치면 한글·키릴 등 비ASCII 호스트명은 `xn--`로 인코딩되므로, 이 한 가지 검사로 원본 유니코드 입력과 이미 인코딩된 입력이 모두 걸립니다. 진짜 도메인과 눈으로 구별되지 않는 호모그래프 주소를 막기 위한 것이며, 국내 화장품 브랜드가 IDN 호스트로 판매하는 경우는 없으므로 통째로 거부합니다.
- 마켓플레이스·백화점몰·홈쇼핑·쇼핑몰 빌더 기본 호스트와 그 서브도메인은 거부. 한 도메인 아래 여러 브랜드가 입점하는 곳은 브랜드 자체 사이트가 아니기 때문입니다. 목록은 `BRAND_OFFICIAL_DOMAIN_BLOCKLIST`(`src/ai-contracts/seller-domain.policy.ts`)에 세 묶음(오픈마켓·가격비교 / 백화점·홈쇼핑 / 쇼핑몰 빌더)으로 정리해 두었습니다. 빌더 기본 호스트(`*.cafe24.com`, `*.myshopify.com` 등)를 막으면 실제로 거기서 공식몰을 운영하는 브랜드를 가끔 놓치지만, 그 경우 `BRAND_OFFICIAL`이 `UNKNOWN`으로 남을 뿐이라 안전한 쪽으로 실패합니다.
- 고정 판매처 세 도메인과 그 서브도메인은 거부
- `.kr`로 끝나지 않는 도메인은 거부하지 **않고** 경고만 붙입니다(해외 스토어프론트 가능성).

통과한 도메인만 `web_search`의 `allowed_domains`에 추가되고 `BRAND_OFFICIAL` 결과의 URL 검증 기준이 됩니다. 발견이 실패해도 검색 자체는 실패하지 않습니다. 고정 세 도메인만으로 진행하고 `BRAND_OFFICIAL`은 `UNKNOWN`으로 남습니다.

**발견된 도메인을 쓰면 항상 경고가 붙습니다.** 새로 발견했든 캐시에서 꺼냈든, 응답 `warnings`에 다음 경고가 무조건 들어갑니다(`buildBrandOfficialDomainWarnings`).

```txt
BRAND_OFFICIAL domain <도메인> was proposed by the model for brand "<브랜드>" and passed rule-based checks only; it is not verified to be operated by the brand.
```

게이트 통과는 "알아볼 수 있는 잘못된 부류가 아니었다"는 뜻일 뿐, 그 도메인이 실제로 브랜드의 것이라는 확인이 아니기 때문입니다. Core는 이 경고가 붙은 `BRAND_OFFICIAL` 오퍼를 검증된 사실과 동급으로 다루면 안 됩니다.

여기에 조건부 경고 두 개가 더 붙을 수 있습니다. `.kr`이 아닐 때(해외 스토어프론트 가능성), 그리고 브랜드명의 라틴 토큰이 도메인에 전혀 없을 때(`brandNameMismatchWarning`)입니다. 뒤엣것은 모델이 무관한 도메인을 지어낸 경우를 잡을 뿐, `innisfree-kr.com` 같은 타이포스쿼트는 잡지 못합니다. 브랜드명을 그대로 품고 있기 때문이며, 이를 가리려면 실제 도메인을 아는 외부 근거가 필요합니다.

**sample 모드.** 발견을 아예 실행하지 않습니다. OpenAI 호출이 없으므로 `OPENAI_API_KEY` 없이 동작하고, `BRAND_OFFICIAL`은 항상 `UNKNOWN`으로 보고하며 응답 `warnings`에 다음 문구가 들어갑니다.

```txt
Brand-official domain discovery does not run in sample mode (PRODUCT_DATA_MODE=sample); BRAND_OFFICIAL is always reported as UNKNOWN.
```

이 게이트를 통과해도 남는 위험은 `docs/ai-prompt-design-and-risk-report.md`의 "잔여 위험: 브랜드 공식몰 도메인 발견"에 정리했습니다.

### `INTERNAL_API_TOKEN` 설정

`INTERNAL_API_TOKEN`은 Core, Backend, Agent 세 서비스가 내부 호출을 인증하는 데 같이 쓰는 공유 비밀값이며, 세 서비스 `.env`에 **동일한 값**으로 설정해야 합니다. `agent/.env.example`은 이 값을 비워 둡니다(Backend의 `.env.example`도 동일) — 인증 비밀값에 예시 파일 안에 그럴듯한 기본값을 넣지 않기 위해서이며, `InternalApiGuard`는 값이 비어 있으면 요청을 즉시 거부(fail closed)하도록 설계되어 있습니다. 로컬에서 값을 생성하려면:

```sh
openssl rand -hex 32
```

이 값을 Core, Backend, Agent 세 곳의 `.env`에 동일하게 넣은 뒤 실행합니다.

## 브랜치

```txt
work/backend      \
work/frontend/a    -> dev -> main
work/frontend/b   /
```

- `main`: 안정 버전
- `dev`: 통합 개발 브랜치
- `work/backend`: 백엔드 작업
- `work/frontend/a`: 프론트엔드 1 작업
- `work/frontend/b`: 프론트엔드 2 작업

각 작업 브랜치에서 개발하고 `dev`로 합친 뒤, 안정화되면 `main`으로 올립니다.
