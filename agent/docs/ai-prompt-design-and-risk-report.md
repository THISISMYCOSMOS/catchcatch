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

- 검증된 기준 상품을 바탕으로 네 판매처 검색
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

### 유사상품 검색

- 사용자가 유사상품 보기를 선택한 경우에만 실행
- 기준 상품과 다른 제품 중 같은 유형·용도에서 비교할 후보 검색
- 유사 이유와 의미 있는 차이점을 함께 반환
- 기준 상품 자체나 동일상품의 다른 판매처 오퍼는 제외

파일:

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

- 테스트 스위트: 9개 통과(모든 테스트 파일을 직접 경로로 열거)
- 테스트: 64개 통과
- TypeScript/Nest 빌드: 통과
- mock API 확인 스크립트: 통과
- 실제 OpenAI 또는 NAVER API 호출: 수행하지 않음
- 실제 OpenAI 또는 NAVER API 호출: 수행하지 않음

## 7. 스트레스 테스트에서 발견된 보강 항목

### 해결: 공식몰 도메인 주입

외부 입력에서 공식몰 도메인을 제거했다. `brand_id`만 입력받고 백엔드의 `BRAND_OFFICIAL_DOMAINS_JSON` 또는 향후 브랜드 저장소에서 도메인을 조회한다.

상태: 코드와 테스트 반영 완료

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

### P1: 입력 크기 제한 부재

브랜드명에 100,000자를 넣어도 입력 스키마를 통과했다.

보강:

- 브랜드·상품명·옵션 문자열 최대 길이
- 구성품·fact·경고·URL 배열 최대 개수
- 전체 직렬화 입력 바이트 제한
- 요청당 최대 토큰·실행 시간 제한

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
