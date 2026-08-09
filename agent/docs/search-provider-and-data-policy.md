# CatchCatch 검색 공급자·데이터 보관 정책

기준일: 2026-07-19

## 1. 검색 공급자 결정

네이버 개발자센터의 쇼핑 검색 API는 신규 CatchCatch 구현의 검색 공급자로 사용하지 않는다.

- 네이버는 해당 API를 2026-07-31에 종료한다고 공지했다.
- 쇼핑 검색 API는 NAVER API HUB 이관 대상에서 제외되며 별도 대체 API도 제공되지 않는다.
- 기존 응답의 상품 링크도 판매처의 정확한 상품 페이지가 아니라 네이버 쇼핑 카탈로그 또는 스마트스토어 URL일 수 있다.
- 따라서 올리브영·무신사 뷰티·쿠팡·브랜드 공식몰의 정확한 판매 페이지를 검증해야 하는 CatchCatch 계약을 네이버 쇼핑 검색 API만으로 충족할 수 없다.

공식 근거:

- https://developers.naver.com/notice/article/32564
- https://developers.naver.com/notice/article/15924

현재 `web_search` 모드의 주 검색 공급자는 OpenAI Responses API의 `web_search`다.

보조 후보 발견 공급자로 NAVER API HUB의 **웹문서 검색 API**를 사용할 수 있다. 이는 종료되는 쇼핑 검색 API와 다른 API다.

- 요청: `GET /search/v1/webkr`
- 응답: 웹문서 제목, URL, 요약
- 인증: NAVER API HUB Client ID와 Client Secret
- 용도: `site:판매처도메인 브랜드 상품명 옵션` 검색으로 판매처 페이지 후보 URL 발견
- 제한: 가격·쿠폰·배송·구성의 구조화된 쇼핑 정보를 제공하지 않음

따라서 NAVER 웹문서 검색 결과의 제목·요약·URL은 `DISCOVERY_CANDIDATE`일 뿐 `SELLER_PAGE` 원천 사실이 아니다. 후보 URL이 등록 판매처 도메인인지 확인하고 실제 판매처 페이지 내용을 다시 검증한 뒤에만 오퍼 데이터로 승격한다.

공식 근거:

- https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr
- https://api.ncloud-docs.com/docs/naver-api-hub-overview

향후 판매처별 공식 API나 계약된 데이터 공급자가 생기면 백엔드 검색 공급자 어댑터로 추가할 수 있지만, 프롬프트가 임의 공급자를 선택해서는 안 된다.

권장 공급자 순서는 다음과 같다.

1. OpenAI `web_search`로 허용 도메인 검색과 정확한 판매처 페이지 확인
2. OpenAI 웹 검색 도구만 사용할 수 없고 NAVER API HUB 접근이 가능하면 NAVER 웹문서 검색으로 후보 URL 발견
3. 백엔드가 후보 URL의 판매처 도메인과 실제 페이지 내용을 검증
4. 검증할 수 없는 판매처는 `UNKNOWN`

OpenAI API 전체가 접근 불가능하면 NAVER가 후보 URL을 찾아도 AI 구조화 추출과 판단을 수행할 수 없다. 이 경우 별도 결정적 판매처 파서가 없는 한 성공으로 처리하지 않는다.

## 2. 검색 공급자 접근 실패

검색 API 키 누락, 권한 거부, 도구 미지원, 호출량 제한, 네트워크 장애, 공급자 장애를 서로 구분한다.

```text
SEARCH_CREDENTIALS_MISSING
SEARCH_ACCESS_DENIED
SEARCH_TOOL_UNAVAILABLE
SEARCH_RATE_LIMITED
SEARCH_NETWORK_ERROR
SEARCH_PROVIDER_ERROR
```

공급자 호출 자체가 실패한 경우 AI에게 검색 결과 생성을 요청하지 않는다. 백엔드는 `PRODUCT_SEARCH_PROVIDER_UNAVAILABLE`과 원인 코드를 반환한다.

일부 판매처만 확인된 경우에는 확인된 판매처만 사실로 사용하고 나머지는 `UNKNOWN`으로 반환한다. 공급자 장애 또는 검색 실패는 상품이 없다는 뜻이 아니므로 `NOT_AVAILABLE`로 바꾸지 않는다.

다음 fallback은 금지한다.

- `web_search` 실패를 샘플 데이터로 채우기
- 이전 사용자의 검색 결과를 현재 검색 결과처럼 재사용하기
- 종료 예정인 네이버 쇼핑 검색 API로 자동 전환하기
- NAVER 웹문서 검색의 제목·요약을 판매처 페이지의 가격 사실로 저장하기
- 가짜 오퍼, 가격, URL을 생성하기

## 3. 검색 결과의 저장과 AI 사용

검증된 검색 결과의 영속 저장 주체는 백엔드뿐이다.

- AI는 검색 결과를 자체 메모리, 대화 이력, 벡터 저장소, fine-tuning 데이터셋에 누적하지 않는다.
- 이전 검색 결과를 다음 분석 프롬프트에 자동 첨부하지 않는다.
- 최종 판단 AI에는 현재 분석에 필요한 최소한의 검증된 사실만 전달한다.
- 원본 AI 응답 전체보다 정규화·검증된 상품, 오퍼, 출처와 프롬프트·모델 버전을 저장한다.
- 내부 사고 과정은 요청하거나 저장하지 않는다.
- OpenAI Responses API 요청에는 `store: false`를 명시한다.
- OpenAI API 조직 또는 프로젝트의 데이터 공유 opt-in을 활성화하지 않는다.

OpenAI API 입력과 출력은 기본적으로 모델 학습에 사용되지 않지만, 기본 abuse monitoring 로그와 Responses API 보관 정책은 별도다. 애플리케이션 수준에서 `store: false`를 사용해도 제3자 시스템의 일시적 처리가 완전히 없어지는 것은 아니다.

검색 결과가 외부 공급자에도 보관되지 않고 문자 그대로 백엔드에만 남아야 한다면, 운영 조직은 OpenAI의 승인을 받은 Zero Data Retention 프로젝트를 사용해야 한다. 그 조건을 충족하지 못하면 "백엔드만 영속 저장"으로 표현하고 "외부에 전혀 보관되지 않음"이라고 보장하지 않는다.

공식 근거:

- https://platform.openai.com/docs/models/default-usage-policies-by-endpoint
- https://openai.com/business-data/

## 4. 프롬프트 입력 원칙

검색 프롬프트에는 현재 요청의 기준 상품과 백엔드가 허용한 도메인만 전달한다. 과거 검색 기록, 다른 사용자 데이터, 전체 가격 이력 저장소를 검색 편의를 위해 첨부하지 않는다.

NAVER 웹문서 검색 쿼리에는 사용자 ID, 회원 혜택, 선택 기준과 같은 개인정보를 넣지 않고 공개 상품 식별 정보와 판매처 도메인만 넣는다.

판단 프롬프트에는 현재 분석 스냅샷의 검증 사실만 전달한다. 백엔드에 저장된 과거 관측값이 현재 분석에 필요하면 백엔드가 계산 또는 선별한 fact로 제공하고, 원본 검색 응답 묶음을 그대로 전달하지 않는다.
