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

### 분석당 OpenAI 비용 예산

기본 운영 예산은 `OPENAI_ANALYSIS_COST_BUDGET_USD=0.056`입니다. 환율 1달러
1,600원과 부가세 10%를 보수적으로 적용하면 약 99원입니다. Agent는 Responses
API가 반환한 비캐시 입력, 캐시 입력, 출력 토큰과 `web_search_call` 수를 모델별
단가로 계산해 `OPENAI_COST` 로그에 남깁니다.

비용 배분 기본값은 상품 식별 $0.012, 공식몰 발견 $0.012, 필수 판매처 검색
$0.027, AI 판단 $0.005입니다. 식별·공식몰 발견·필수 판매처 검색·판단은 기본적으로
`gpt-5.6-luna`를 사용합니다. 공식몰 발견을
실행하면 필수 검색 예약분을 침범하는 경우 발견을 생략하고
`BRAND_OFFICIAL=UNKNOWN`으로 남깁니다. 필수 검색 자체의 예약분이 없으면
`ANALYSIS_COST_BUDGET_EXCEEDED`로 fail closed합니다.

Core가 식별과 검색에 공통 분석 ID를 전달하지 않으므로, Agent는 동일한
`product_url`의 식별·검색 호출을 5분 TTL FIFO 세션으로 연결합니다. 동시 동일 URL
요청은 별도 세션으로 분리하지만 프로세스 재시작 시 원장은 사라집니다. 이를 보완하기
위해 모델 라우팅 외에도 식별 1회, 공식몰 발견 1회, 필수 검색 2회의 도구 호출 상한,
단계별 출력 토큰 상한, 재시도 0회(판단 기본 시도 1회)를 함께 적용합니다. 검색
콘텐츠 토큰은 호출이 끝난 뒤에만 확정되므로 단일 진행 중 호출이 예약액을 넘는 경우까지
정확히 차단하는 결제 수준의 절대 상한은 아닙니다. `OPENAI_COST_BUDGET_EXCEEDED`와
`stage_reserve_exceeded` 로그를 운영 경보로 수집해야 합니다.

### 단일 상품 링크 실검색 점검

`OPENAI_API_KEY`가 설정된 환경에서 아래 명령은 Backend 저장 없이 Agent의 상품 식별과
판매처 검색만 순서대로 실행합니다. 출력에는 전체 검색 결과와 무신사 결과를 따로 뽑은
`targetSeller`가 포함되며 API 키나 내부 토큰은 출력하지 않습니다.

```sh
npm run test:search:live -- "https://www.musinsa.com/..."
```

판정 시에는 `availability`만 보지 말고 `source.source_url`, `verification_status`,
`matchEvidence`, 상품 옵션·구성 및 가격 필드를 함께 확인합니다.

### 다른 용량·구성 검색

`POST /internal/v1/product-search/configurations`는 검증된 기준 상품과 같은 제품의
다른 용량·수량·세트 구성뿐 아니라 같은 핵심 제품 라인의 다른 버전도 검색합니다.
기본값은 링크를 받은 판매처를 제외한 등록 판매처 전체, 판매처당 후보 2개이며
`target_sellers`와 `max_candidates_per_seller`로 후속 검색 범위를 지정할 수 있습니다.
명시적인 `target_sellers`에도 입력 판매처가 들어 있으면 이미 확보한 링크를 다시
검색하지 않고 제외합니다. 각 판매처는 별도 `web_search`로 동시에 조회하므로 한
판매처의 지연이나 실패는 해당 판매처만 `UNKNOWN`으로 남깁니다. 환산가는 AI가
아니라 서비스 코드가 같은 제품의 `MAIN`과 이름이 일치하는 `REFILL`/`MINI`/`TRAVEL`
용량 및 공개 표시가를 사용해 계산합니다. 다른 화장품 사은품은 합산하지 않습니다. 동일 제품 구성은
`SAME_PRODUCT_CONFIGURATION`, 같은 라인의 다른 버전은 `SAME_LINE_VARIANT`이며,
다른 버전의 환산가는 `equivalent_price_scope=REFERENCE_ONLY`로 표시됩니다. 기본
검색 제한시간은 25초입니다.

```sh
npm run test:configurations:live -- "https://www.coupang.com/vp/products/..."
```

네 판매처를 후보 1개씩 조회하면서 실제 토큰 사용량을 확인하려면 다음처럼 실행합니다.
각 OpenAI 응답은 `OPENAI_USAGE` 로그에 토큰과 웹 검색 호출 수를 남기며 공개 API
응답에는 이 진단값을 포함하지 않습니다.

```sh
npm run test:configurations:live -- "https://www.coupang.com/vp/products/..." --sellers=COUPANG,OLIVE_YOUNG,MUSINSA_BEAUTY,BRAND_OFFICIAL --max-candidates=1
```

이미 저장한 기준 상품 JSON이 있으면 식별 호출 없이 재사용할 수 있습니다. 공식몰
도메인도 Backend에서 검증·저장한 값을 전달하면 발견 호출을 건너뜁니다. 두 값 모두
Agent에서 스키마와 도메인 게이트를 다시 통과해야 합니다.

```sh
npm run test:configurations:live -- "https://www.coupang.com/vp/products/..." --anchor-file=anchor.json --brand-domain=roundlab.com --max-candidates=1
```

구성 검색은 기본적으로 `OPENAI_CONFIGURATION_SEARCH_MODEL=gpt-5.6-luna`,
`OPENAI_WEB_SEARCH_CONTEXT_SIZE=low`, `OPENAI_CONFIGURATION_REASONING_EFFORT=low`,
`OPENAI_CONFIGURATION_MAX_OUTPUT_TOKENS=4000`을 사용합니다. 최종 AI 판정 모델
`OPENAI_JUDGMENT_MODEL`과 분리되어 있어 가격·구성 추출만 저비용 모델로 운영할 수 있습니다.
구성 검색의 고비용 자동 재시도는 기본적으로 비활성화됩니다. 품질 우선 운영이 필요한
경우에만 `OPENAI_CONFIGURATION_FALLBACK_MODEL=gpt-5.6-sol`을 명시하면 Luna가
타임아웃·API 오류·구조화 출력 오류로 실패한 판매처를 Sol로 한 번 재시도합니다.
정상적인 `UNKNOWN`에는 재시도하지 않습니다. 기본 시간 예산은 Luna 18초, 명시적으로
활성화한 Sol 폴백 10초입니다.
동적 가격 추출이 까다로운 무신사만
`OPENAI_WEB_SEARCH_CONTEXT_SIZE_MUSINSA_BEAUTY=medium`을 사용하고 나머지는 `low`를
유지합니다.

무신사 구성 검색은 이보다 먼저 무신사 검색 페이지와 상품 상세 메타데이터를 직접
조회합니다. 직접 검색이 성공하면 OpenAI 호출 없이 현재 판매가·정상가·재고·상품명을
읽어 `DIRECT_HTTP`/`CONTENT_VERIFIED` 출처로 반환합니다. 직접 검색 페이지 형식이
바뀌거나 네트워크 오류가 나면 그때만 위 Luna 웹 검색 경로로 폴백합니다. 현재
올리브영 검색 페이지는 접속 확인 화면, 쿠팡 검색 페이지는 서버 접근 거부가 있어
두 판매처는 Luna 웹 검색 경로를 유지합니다.

### 브랜드 공식몰 도메인 발견 (`web_search` 모드 전용)

네 판매처 중 올리브영·무신사 뷰티·쿠팡은 도메인이 코드에 고정되어 있지만(`FIXED_SELLER_DOMAINS`), 브랜드 공식몰 도메인은 상품마다 다릅니다. 이전에는 `brand_id`로 조회하는 사람이 관리하는 레지스트리를 썼지만, 지금은 식별된 브랜드명으로부터 도메인 후보를 발견(discovery)한 뒤 코드가 검증합니다. 이 동작은 런타임 비용과 신뢰 경계를 함께 바꾸므로 아래 네 가지를 알고 써야 합니다.

**요청당 비용.** `PRODUCT_DATA_MODE=web_search`이고 `anchor_product.brand`가 있으며 그 브랜드가 캐시에 없으면, 상품 검색 **이전에** 공식몰 발견용 `web_search`가 1회 추가됩니다. 다만 앞선 동적 발견 결과를 `registered_brand_official_domain`으로 재사용하면 발견 호출을 생략합니다. 발견 출력은 `candidate_domain`과 검색 근거 URL만 포함합니다. 일반 검색에서는 `OPENAI_BRAND_OFFICIAL_MODEL`(기본 Luna), 구성 검색에서 새로 발견할 때는 `OPENAI_CONFIGURATION_SEARCH_MODEL`을 사용합니다.

**캐시 키와 수명.** 프로세스 메모리 안의 `Map` 하나입니다(`ProductSearchService.brandOfficialDomainCache`).

- 키: 브랜드명을 NFKC 정규화 → 공백 제거 → 소문자화한 값
- 값: 게이트를 통과한 도메인 문자열
- 게이트를 통과한 도메인만 캐시합니다. 후보 없음, 게이트 거부, API 실패는 캐시하지 않으므로 그 브랜드는 다음 요청에서 발견을 다시 시도합니다(= 실패한 브랜드는 매 요청 1회씩 호출 비용이 계속 듭니다).
- **TTL 1시간, 최대 200개**(`BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS`, `BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES`). 만료된 항목은 조회 시 버려지고, 200개를 넘으면 가장 오래 전에 넣은 항목부터 밀어냅니다. 잘못 발견된 도메인이 프로세스가 죽을 때까지 재사용되는 것을 막기 위한 상한입니다. 캐시는 비용 절감 장치일 뿐이므로, 항목이 밀려나도 발견 호출 1회를 더 쓸 뿐 정확성에는 영향이 없습니다.
- 그 밖에는 영속 저장이 없습니다. 재시작하면 비워지고, 인스턴스를 여러 개 띄우면 캐시도 인스턴스마다 따로입니다.
- 브랜드명이 100자를 넘으면 발견 자체를 건너뜁니다. 브랜드명은 상품 페이지에서 AI가 뽑아낸 값이라 신뢰 경계 밖에서 오고, 그 문자열이 곧 캐시 키이기 때문입니다.

**검색 근거와 게이트.** 모델은 실제 `web_search` 출처 URL과 후보 도메인을 함께 반환해야 합니다. 서비스는 근거 URL이 제공자 반환 출처 목록에 실제로 존재하고 후보 도메인과 일치하는지 먼저 확인한 뒤, 규칙 기반 코드(`gateBrandOfficialDomainCandidate`)를 적용합니다.

- HTTPS 호스트명으로 정규화되지 않으면 거부
- **퓨니코드(IDN) 도메인은 거부.** `new URL()`을 거치면 한글·키릴 등 비ASCII 호스트명은 `xn--`로 인코딩되므로, 이 한 가지 검사로 원본 유니코드 입력과 이미 인코딩된 입력이 모두 걸립니다. 진짜 도메인과 눈으로 구별되지 않는 호모그래프 주소를 막기 위한 것이며, 국내 화장품 브랜드가 IDN 호스트로 판매하는 경우는 없으므로 통째로 거부합니다.
- 마켓플레이스·백화점몰·홈쇼핑·쇼핑몰 빌더 기본 호스트와 그 서브도메인은 거부. 한 도메인 아래 여러 브랜드가 입점하는 곳은 브랜드 자체 사이트가 아니기 때문입니다. 목록은 `BRAND_OFFICIAL_DOMAIN_BLOCKLIST`(`src/ai-contracts/seller-domain.policy.ts`)에 세 묶음(오픈마켓·가격비교 / 백화점·홈쇼핑 / 쇼핑몰 빌더)으로 정리해 두었습니다. 빌더 기본 호스트(`*.cafe24.com`, `*.myshopify.com` 등)를 막으면 실제로 거기서 공식몰을 운영하는 브랜드를 가끔 놓치지만, 그 경우 `BRAND_OFFICIAL`이 `UNKNOWN`으로 남을 뿐이라 안전한 쪽으로 실패합니다.
- 고정 판매처 세 도메인과 그 서브도메인은 거부
- `.kr`로 끝나지 않는 도메인은 거부하지 **않고** 경고만 붙입니다(해외 스토어프론트 가능성).

검색 근거 대조와 게이트를 모두 통과한 도메인만 후속 상품 `web_search`의 `allowed_domains`에 추가되고 `BRAND_OFFICIAL` 결과의 URL 검증 기준이 됩니다. 발견이 실패해도 고정 세 판매처 검색은 계속하고 `BRAND_OFFICIAL`은 `UNKNOWN`으로 남습니다.

**발견된 도메인을 쓰면 항상 경고가 붙습니다.** 새로 발견했든 캐시에서 꺼냈든, 응답 `warnings`에 다음 경고가 무조건 들어갑니다(`buildBrandOfficialDomainWarnings`).

```txt
BRAND_OFFICIAL domain <도메인> was discovered by web_search for brand "<브랜드>", matched a returned source URL, and passed rule-based checks; it is not verified at seller-page content level and requires separate verification.
```

검색 근거가 있다는 사실은 모델 기억만으로 지어낸 후보를 차단하지만, 도메인 소유자나 운영 주체까지 증명하지는 않습니다. 또한 공식몰 발견 근거는 가격 근거가 아니므로 후속 상품 페이지가 별도로 검증돼야 합니다.

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
