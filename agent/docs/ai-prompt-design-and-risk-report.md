# CatchCatch AI 프롬프트 설계·검색 리스크 검토 보고서

기준일: 2026-07-19
작업 브랜치: `ai`

## 1. 결론

CatchCatch의 AI 기능은 다음 네 단계로 분리한다.

1. 조건부 기준 상품 식별
2. 동일상품 판매처 검색
3. 최종 구매 판단과 AI 판단 신뢰도
4. 사용자 요청 시 유사상품 검색

조건부 상품 식별은 등록 상품 DB와 결정적 페이지 메타데이터만으로 식별하지 못한 경우에만 사용한다.

## 2. 프롬프트 책임

### 조건부 상품 식별

- 입력 URL에서 브랜드, 상품명, 유형, 옵션, 버전, 구성 식별
- 상품 미리보기용 판매처·표시 가격·이미지 후보 추출
- 다른 판매처 검색, 가격 비교, 구매 판단은 수행하지 않음

파일:

- `src/product-identification/product-identification.prompt.ts`
- `src/product-identification/product-identification.schema.ts`

### 동일상품 판매처 검색

- 검증된 기준 상품을 바탕으로 다섯 판매처 검색
- 판매처별 `AVAILABLE`, `NOT_AVAILABLE`, `UNKNOWN` 반환
- 동일 옵션 여부가 불명확하면 `UNKNOWN`
- 유사상품을 동일상품 오퍼로 포함하지 않음
- 가격 계산, 최저가 계산, 구매 판단은 수행하지 않음

파일:

- `src/product-search/product-search.prompt.ts`
- `src/product-search/product-search.schema.ts`
- `src/product-search/product-search.service.ts`

### 최종 판단

- 백엔드가 검증·계산한 사실만 사용
- 근거 충분성을 먼저 확인하고, 충분하면 허용 결론 중 하나 선택
- 핵심 근거가 부족하거나 충돌하면 `INSUFFICIENT_EVIDENCE`로 판단 유보
- 선택 기준 세 개의 설명 생성
- AI가 `HIGH`, `MEDIUM`, `LOW` 판단 신뢰도와 이유 선택
- 허용 판매처 후보 안에서 추천처 선택
- 입력에 없는 숫자, 가격, 혜택, 제조원가 표현 금지

파일:

- `src/ai-judgment/ai-judgment.prompt.ts`
- `src/ai-judgment/ai-judgment.schema.ts`
- `src/ai-judgment/ai-judgment.service.ts`

### 유사상품 검색 (설계 이력 — 삭제됨)

서비스·컨트롤러·`app.module.ts` 등록이 없는 미연결 코드였으므로 `src/similar-product-search/`를 삭제했다. 아래는 재설계를 위한 설계 이력이다.

- 사용자가 유사상품 보기를 선택한 경우에만 실행
- 기준 상품과 다른 제품 중 같은 유형·용도에서 비교할 후보 검색
- 유사 이유와 의미 있는 차이점을 함께 반환
- 기준 상품 자체나 동일상품의 다른 판매처 오퍼는 제외

(삭제된) 파일:

- `src/similar-product-search/similar-product-search.prompt.ts`
- `src/similar-product-search/similar-product-search.schema.ts`

## 3. 검색 공급자 결정

### 네이버 쇼핑 검색 API

네이버 개발자센터의 쇼핑 검색 API는 2026-07-31 종료 예정이며 NAVER API HUB의 별도 대체 쇼핑 검색 API는 제공되지 않는다. 따라서 신규 구현의 검색 기반으로 사용하지 않는다.

공식 공지:

- https://developers.naver.com/notice/article/32564

### 현재 주 공급자

OpenAI Responses API의 `web_search`를 사용한다.

- 등록된 판매처 도메인으로 제한
- 실제 `web_search` 출처에 포함된 URL만 허용
- 검색 실패를 샘플 데이터로 대체하지 않음

### 보조 후보 발견 공급자

NAVER API HUB의 웹문서 검색 API는 사용할 수 있다.

- API: `GET /search/v1/webkr`
- 응답: 제목, URL, 웹문서 요약
- 용도: 판매처 페이지 후보 URL 발견
- 금지: 제목·요약을 가격·쿠폰·배송·구성의 최종 사실로 저장

공식 문서:

- https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr
- https://api.ncloud-docs.com/docs/naver-api-hub-overview

권장 처리 흐름:

```text
OpenAI web_search
→ 실패 시 NAVER 웹문서 검색으로 후보 URL 발견
→ 백엔드가 등록 도메인 검증
→ 실제 판매 페이지 내용 재확인
→ 검증된 경우에만 오퍼로 승격
```

OpenAI API 전체가 접근 불가능하면 NAVER가 후보 URL을 찾아도 AI 추출과 최종 판단은 수행할 수 없다. 결정적 판매처 파서가 없다면 성공으로 처리하지 않는다.

## 4. 검색 공급자 실패 계약

```text
SEARCH_CREDENTIALS_MISSING
SEARCH_ACCESS_DENIED
SEARCH_TOOL_UNAVAILABLE
SEARCH_RATE_LIMITED
SEARCH_NETWORK_ERROR
SEARCH_PROVIDER_ERROR
```

공급자 호출 자체가 실패하면 `PRODUCT_SEARCH_PROVIDER_UNAVAILABLE`을 반환한다.

부분 결과만 있으면 확인된 판매처만 사용하고 나머지는 `UNKNOWN`으로 둔다. 공급자 장애나 검색 실패를 `NOT_AVAILABLE`로 표현하지 않는다.

## 5. 검색 결과 저장과 AI 비학습 원칙

검증된 검색 결과의 영속 저장 주체는 백엔드뿐이다.

- AI는 검색 결과를 자체 기억, 대화 이력, 벡터 저장소, fine-tuning 데이터에 누적하지 않음
- 과거 검색 결과를 다음 사용자나 다음 분석 프롬프트에 자동 첨부하지 않음
- 최종 판단에는 현재 분석에 필요한 최소 검증 사실만 전달
- 원본 AI 응답 전체보다 정규화·검증된 상품, 오퍼, 출처를 저장
- 내부 사고 과정은 요청하거나 저장하지 않음
- OpenAI Responses API 요청에 `store: false` 명시
- OpenAI 조직·프로젝트의 데이터 공유 opt-in을 활성화하지 않음

OpenAI API 입력·출력은 기본적으로 모델 학습에 사용되지 않지만, abuse monitoring과 API 보관 정책은 별도다. 외부 시스템의 일시적 보관까지 허용하지 않고 문자 그대로 백엔드에만 남겨야 한다면 승인된 Zero Data Retention 프로젝트가 필요하다.

공식 문서:

- https://platform.openai.com/docs/models/default-usage-policies-by-endpoint
- https://openai.com/business-data/

세부 정책:

- `docs/search-provider-and-data-policy.md`

## 6. 현재 검증 결과

기준: 2026-08-15, `work/agent-cleanup`.

- 테스트 스위트: 13개 통과(모든 테스트 파일을 직접 경로로 열거)
- 테스트: 148개 통과
- TypeScript/Nest 빌드: 통과
- sample 모드 실행 확인: `OPENAI_API_KEY` 없이 서버 기동 후 `/internal/v1/*` 세 엔드포인트 모두 201, 토큰 없는 요청은 401
- 실제 OpenAI 또는 NAVER API 호출: 수행하지 않음(발견·검색 경로는 모킹한 클라이언트로 검증)

## 7. 스트레스 테스트에서 발견된 보강 항목

### 해결: 공식몰 도메인 주입

외부 입력에서 공식몰 도메인을 제거했다. 사람이 큐레이션하는 `brand_id` 레지스트리(`BRAND_OFFICIAL_DOMAINS_JSON`)는 확장성이 없어 폐기했고, 대신 식별된 브랜드명으로 공식몰을 별도 `web_search`한다. 후보 도메인과 일치하는 근거 URL이 제공자 반환 출처 목록에 실제로 존재하고 규칙 기반 게이트(마켓플레이스·고정 판매처 도메인 차단, `.kr` 아닌 도메인은 차단 대신 경고)를 통과해야 후속 상품 검색에 사용한다. `brand_id`는 입력에는 남지만 이 조회에 쓰이지 않는다.

상태: 코드와 테스트 반영 완료. 모델 기억만으로 제안한 도메인은 허용하지 않지만, 검색 출처 대조만으로 도메인 소유자나 운영 주체까지 증명되지는 않는다. 남는 위험은 아래 "잔여 위험: 브랜드 공식몰 도메인 발견"에 정리한다.

### 잔여 위험: 브랜드 공식몰 도메인 발견

발견 단계는 **실제 web_search 출처 URL과 후보 도메인을 교차검증**하고, 게이트(`gateBrandOfficialDomainCandidate`)가 문자열 형태상 명백히 틀린 부류를 거부한다. 다음은 여전히 확인하지 **않는** 것이다.

- 현재 페이지가 직접 HTTP 검증 가능한지
- 도메인 소유자가 누구인지
- 그 도메인이 해당 브랜드와 실제로 어떤 관계인지
- 그 도메인에 문제의 상품이 실제로 있는지

따라서 통과했다는 사실은 "공식몰 검색 결과에 이 도메인의 출처가 실제로 있었고, 명백한 마켓플레이스·고정 판매처·위험 호스트는 아니다"라는 뜻이다. 아래는 그럼에도 `BRAND_OFFICIAL` 후보가 잘못될 수 있는 경우다. 후속 상품 페이지 가격은 별도의 `CONTENT_VERIFIED` 검증 전까지 계산에 사용하면 안 된다.

**1. 브랜드명 유사·타이포스쿼트 도메인** (일부 완화)

호모그래프 쪽은 막았다. 게이트가 퓨니코드(IDN) 도메인을 통째로 거부하므로, 유니코드로 만든 시각적 동일 도메인은 원본 형태로 오든 `xn--` 인코딩 형태로 오든 통과하지 못한다.

브랜드명과 무관한 도메인에는 경고를 붙인다(`brandNameMismatchWarning`). 브랜드명에서 라틴 문자·숫자 토큰을 뽑아 도메인 문자열에 남아 있는지 보고, 하나도 없으면 경고한다. 모델이 아무 관계 없는 도메인을 지어내는 경우를 잡는다. 한글만으로 된 브랜드명은 비교할 라틴 토큰이 없으므로 판별 불가로 보고 건너뛴다(T7의 null `product_type` 처리와 같은 선택).

남는 것은 **순수 ASCII 타이포스쿼트**다. `innisfree-kr.com`처럼 브랜드명을 그대로 품은 도메인은 위 경고에도 걸리지 않는다. 스쿼팅 도메인은 원래 브랜드명을 포함하기 때문이고, 진짜와 가짜를 가르려면 그 브랜드의 실제 도메인이 무엇인지 아는 외부 근거가 있어야 하는데 이 서비스에는 없다. 이 한계는 테스트로 명시해 두었다(`does not catch a typosquat that embeds the brand name`) — 막았다고 착각하지 않기 위해서다.

**2. 해외·타지역 스토어프론트**

`.kr`이 아닌 도메인은 차단이 아니라 경고 대상이다(`foreignStorefrontWarning`). 한국 브랜드가 `.com` 공식몰을 쓰는 경우가 흔해 차단할 수 없기 때문인데, 그 대가로 해외 스토어프론트도 같이 통과한다. 통화, 가격 정책, 배송비, 배송 가능 지역, 반품 조건, 구성/용량이 국내와 다른 페이지가 국내 판매처와 나란히 비교될 수 있다.

발견된 도메인을 쓰는 모든 요청에는 "web_search 출처 대조와 규칙 검사를 통과했지만 판매 페이지 콘텐츠는 별도 검증이 필요하다"는 경고가 붙는다(`buildBrandOfficialDomainWarnings`, 캐시 히트에도 동일). 가격 오퍼는 후속 `CONTENT_VERIFIED` 경계를 통과해야 계산에 들어간다.

**3. 라이선시·총판·수입사·리셀러 사이트**

브랜드가 직접 운영하는 커머스가 아니라 정식 유통사·수입사·라이선시가 운영하는 사이트는 도메인 문자열만으로 구분할 방법이 없다. 이런 사이트는 "가짜"는 아니지만 가격, 재고, 프로모션, 사은품이 브랜드 공식몰과 다르고, 사용자가 `BRAND_OFFICIAL`이라는 라벨에서 기대하는 것과도 다르다. 프롬프트가 "브랜드 자체가 운영하는 도메인만"이라고 지시하지만 그 판단은 모델에게 맡겨져 있고 코드로는 검증하지 않는다.

**4. 블록리스트에 없는 마켓플레이스·쇼핑몰 호스트** (일부 완화)

목록을 오픈마켓·가격비교, 백화점·홈쇼핑, 쇼핑몰 빌더 세 묶음으로 넓혔다. 특히 빌더 기본 호스트(`*.cafe24.com`, `*.myshopify.com`, `*.imweb.me`, `*.sixshop.com`, `*.wixsite.com`)를 막은 것은 트레이드오프를 선택한 결과다. 브랜드가 실제로 Cafe24나 Shopify로 공식몰을 운영하는 경우가 있어 진짜 공식몰을 가끔 놓치지만, 그때는 `BRAND_OFFICIAL`이 `UNKNOWN`으로 남을 뿐이므로 아무나 받을 수 있는 공용 호스트를 신뢰하는 쪽보다 안전하다.

그래도 이 목록은 **손으로 관리되며 자동 갱신이 없다.** 아직 아무도 추가하지 않은 호스트는 여전히 승격 가능하다. 신규·소규모·해외 마켓플레이스, 소셜커머스, 라이브커머스, 목록에 오른 사업자가 새로 만든 별도 도메인이 여기 해당한다. 목록을 늘리는 것으로 이 구멍이 닫히지는 않는다.

**5. 캐시 오염** (일부 완화)

캐시에 TTL 1시간과 최대 200개 상한을 넣었다(`BrandOfficialDomainCache`). 잘못 승격된 도메인이 프로세스가 죽을 때까지 영구히 재사용되는 상태는 사라졌고, 브랜드명 문자열을 계속 흘려 넣어 Map을 무한히 키우는 메모리 경로도 막혔다. 브랜드명이 100자를 넘으면 발견 자체를 건너뛴다.

남는 것:

- **TTL 창(최대 1시간) 안에서는** 잘못된 도메인이 같은 키의 모든 요청에 재검증 없이 재사용된다. 상한은 피해 지속 시간을 줄일 뿐 오염 자체를 막지 못한다.
- 캐시 키는 여전히 NFKC 정규화 + 공백 제거 + 소문자화한 브랜드명 문자열이다. 공백·대소문자·전각/반각 차이는 흡수되므로, 앞단 식별이 뽑아낸 브랜드명을 조작해 기존 항목과 같은 키로 충돌시키면 그 창 안에서 도메인이 재사용된다.
- 동명이인 격의 서로 다른 브랜드(같은 이름, 다른 회사)는 캐시가 구분하지 못한다.
- 브랜드명 자체가 상품 페이지에서 AI가 추출한 값, 즉 신뢰 경계 밖에서 온 문자열이라는 점은 그대로다. 다만 발견 결과는 실제 `web_search` 출처와 일치해야 하므로 모델 기억만으로 만든 후보는 통과하지 않는다.

**여전히 유효한 방어선**

위 위험은 "임의의 URL이 통과한다"는 뜻은 아니다. 승격된 도메인 밖의 URL은 `allowed_domains` 제한과 `assertAllowedSellerUrl`로 막히고, 모델이 지어낸 URL은 실제 `web_search` 출처 목록 대조로 걸러지며, 판매처 코드와 도메인이 어긋나면 해당 항목만 `UNKNOWN`으로 강등된다(T6). 남는 위험은 전부 "잘못 승격된 그 도메인 안에서" 발생한다.

**적용된 완화**

| 항목 | 내용 |
|---|---|
| 퓨니코드(IDN) 거부 | `gateBrandOfficialDomainCandidate`가 `xn--` 호스트를 거부. 호모그래프 부류를 닫음 |
| 블록리스트 확장 | 오픈마켓·가격비교, 백화점·홈쇼핑, 쇼핑몰 빌더 기본 호스트 추가 |
| 캐시 상한 | TTL 1시간, 최대 200개, 오래된 항목부터 축출(`BrandOfficialDomainCache`) |
| 입력 길이 제한 | 브랜드명 100자 초과 시 발견 자체를 건너뜀 |
| 검색 출처 교차검증 | 후보 도메인과 같은 호스트의 근거 URL이 제공자 반환 출처에 실제로 있어야 승격 |
| 무조건 경고 | 발견 도메인을 쓰면 판매 페이지 콘텐츠 별도 검증 경고를 응답에 첨부(캐시 히트 포함) |
| 브랜드 무관 도메인 경고 | 브랜드명의 라틴 토큰이 도메인에 전혀 없으면 경고(`brandNameMismatchWarning`) |

각 항목에 테스트가 있다(`seller-domain.policy.spec.ts`, `brand-official-domain.cache.spec.ts`, `brand-official-domain.discovery.spec.ts`, `product-search.service.spec.ts`). 발견 단계 자체는 OpenAI 클라이언트를 모킹해 호출 횟수, 캐시 재사용, 게이트 거부, 실패 시 degradation까지 검증한다.

**미구현 완화 후보**

- 승격 전 도메인–브랜드 운영 주체 확인 단계(상호·사업자 정보 확인 등). ASCII 타이포스쿼트와 총판 사이트를 더 강하게 구분하려면 이것이 필요하다
- 승격 이력 감사 로그, 수동 차단·허용 목록
- 경고를 문자열이 아니라 데이터 품질 저하 신호로 판단 파이프라인에 전달 (Core 범위)
- `BRAND_OFFICIAL` 오퍼에 신뢰도 상한을 두거나 추천 판매처에서 제외 (Core 범위)

상태: 부분 완화. 코드로 판별 가능한 부류(마켓플레이스·빌더 입점 호스트, 고정 판매처 도메인, IDN 호모그래프, 잘못된 형식, 무한 캐시)는 닫았다. 남은 위험(ASCII 타이포스쿼트, 해외·라이선시 스토어프론트, 목록 밖 호스트, TTL 창 안의 캐시 재사용)은 도메인 문자열만 보고는 판별할 수 없으며, 실제 확인 단계나 Core 쪽 신뢰도 처리가 필요하다.

### 해결: 비교 불가 오퍼 추천

`allowed_offer_ids`와 `cheapest_offer_id`는 `DIRECTLY_COMPARABLE` 또는 `UNIT_COMPARABLE` 오퍼만 허용한다.

상태: 스키마와 테스트 반영 완료. 판단 입력 이전 단계에서 실제 판매 가능 상태를 검증하는 저장 파이프라인은 백엔드 구현이 필요하다.

### 해결: 판매처 코드와 도메인 불일치

공통 판매처·도메인 정책을 상품 식별, 동일상품 검색, 유사상품 검증에 적용했다.

상태: 코드와 테스트 반영 완료. 동일상품 검색은 실제 OpenAI web search 출처 목록도 대조한다.

### 해결: 추적 쿼리 URL 우회

다음 URL이 다른 후보로 취급될 수 있다.

```text
/product/123
/product/123?utm_source=test
```

fragment, trailing slash, `utm_*`, `ref`, `tracking`, `fbclid`, `gclid`를 공통 정규화한다. 판매처 상품 ID 우선 비교는 저장 파이프라인에서 추가해야 한다.

### 해결: 입력 크기 제한 부재

브랜드명에 100,000자를 넣어도 입력 스키마를 통과했다. 세 요청 스키마(`productSearchInputSchema`, `productIdentificationInputSchema`, `judgmentInputSchema`)에 상한을 넣었다(`src/ai-contracts/input-limits.ts`).

- 식별 문자열(브랜드·상품명·유형·옵션·색상/향·버전) 200자
- 구성품 20개, 허용 도메인 20개, 오퍼 20개, fact 50개, fact당 출처 URL 20개, 경고 50개
- fact 설명·경고 문자열 1,000자, URL 2,048자
- 전체 직렬화 입력 64KB (개별 필드는 다 통과해도 총량이 비정상인 경우를 잡는 backstop)

상한은 **입력 스키마에만** 적용했다. AI 결과 스키마는 `zodTextFormat`으로 JSON Schema 변환을 거치는데 그 변환이 지원하는 키워드 집합이 제한적이라, 거기에 제약을 걸면 실제 API 호출이 요청 생성 단계에서 깨질 수 있다.

함께 고친 것: 입력 검증 실패가 **400**을 반환한다(`parseRequestInput`). 이전에는 스키마 `.parse()`가 던진 `ZodError`가 Nest 기본 처리로 500이 되어, 잘못된 요청을 서비스 장애처럼 알렸다. 응답 본문에는 문제 위치(`path`)와 사유만 담고 제출된 값은 되돌려주지 않는다. AI 출력 검증 실패는 종전대로 각 서비스의 try/catch에서 503으로 매핑된다.

```json
{"code":"INVALID_REQUEST_INPUT","issues":[{"path":"anchor_product.brand","message":"Must be 200 characters or fewer"}]}
```

상태: 코드와 테스트 반영 완료(`input-limits.spec.ts`, `request-input.spec.ts`). 남은 항목은 요청당 최대 토큰 제한이다. 실행 시간은 `OPENAI_TIMEOUT_MS`로 이미 제한된다.

### P1: NAVER 웹문서 fallback 미구현

정책과 설계만 존재하며 실제 어댑터는 구현하지 않았다.

구현 전 확인:

- API 키와 권한
- 판매처별 후보 URL 발견률
- `site:` 검색 방식의 실제 동작
- 429와 월 호출량 관리
- 네이버 결과 URL과 실제 판매 페이지 일치율
- 네이버에 노출되지 않은 상품 처리
- 검색 쿼리에 사용자 식별 정보가 포함되지 않는지

## 8. 다음 작업 순서

1. 공식몰 도메인 외부 입력 제거
2. 비교 불가 오퍼 추천 차단
3. 공통 판매처·출처 검증기 구축
4. 상품 URL 정규화 강화
5. 입력 크기 제한
6. 신뢰도 근거 fact와 데이터 경고 ID 통합
7. 프론트 추천 목록 계약 확정
8. NAVER 웹문서 후보 발견 어댑터 검증
9. Zero Data Retention과 데이터 공유 설정 운영 점검

프롬프트·스키마 단계의 P0 항목은 보강했다. 다만 실제 판매 페이지 콘텐츠 검증기, 저장 파이프라인, 조건부 상품 식별·유사상품 실행 서비스, NAVER 웹문서 후보 발견 어댑터와 라이브 AI 평가는 남아 있으므로 실서비스 검색 기능 전체가 완료된 상태는 아니다.
