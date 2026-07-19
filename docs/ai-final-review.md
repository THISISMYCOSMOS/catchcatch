# CatchCatch AI 최종 검토

기준일: 2026-07-19
브랜치: `ai`

## 1. 최종 결론

CatchCatch AI의 프롬프트, 구조화 출력 스키마, 백엔드 검증 경계, 검색 장애 정책과 편향 평가 기반을 작성했다.

다중 AI 합의는 도입하지 않았다. 현재 규모에서는 같은 근거를 보는 여러 모델이 같은 오류를 반복할 수 있고 비용·지연·운영 복잡성이 증가한다. 대신 한 AI가 후보와 판단을 생성하되, 결정적인 사실·출처·계산·허용 범위는 백엔드가 검증하는 구조를 채택했다.

## 2. 최종 프롬프트

| 기능 | 버전 | 실행 원본 |
|---|---|---|
| 조건부 상품 식별 | `catchcatch-product-identification-v3` | `src/product-identification/product-identification.prompt.ts` |
| 동일상품 검색 | `catchcatch-product-search-v6` | `src/product-search/product-search.prompt.ts` |
| 최종 구매 판단 | `catchcatch-judgment-v7` | `src/ai-judgment/ai-judgment.prompt.ts` |
| 유사상품 검색 | `catchcatch-similar-product-search-v3` | `src/similar-product-search/similar-product-search.prompt.ts` |

사람이 읽는 전문은 `docs/ai-prompts.md`에 있다.

## 3. 실제 위험으로 판단해 반영한 항목

### 강제 결론

기존 계약은 정보가 부족해도 세 구매 결론 중 하나를 반환해야 했다.

반영:

- `DECIDED`와 `INSUFFICIENT_EVIDENCE` 분리
- 판단 유보 시 결론·추천처 `null`, 신뢰도 `LOW`
- 백엔드가 허용 결론을 제공해도 AI가 근거 부족 또는 충돌로 유보 가능

### 확증 편향

선택한 결론에 유리한 fact만 사용할 수 있었다.

반영:

- 결론 전에 `evidence_review` 생성
- 지지 fact, 반대 fact, 누락 근거를 분리
- 판단 유보에는 반대 fact 또는 누락 근거가 반드시 필요
- 결론 나열 순서를 우선순위로 해석하지 않도록 지시
- 순서 변경, 프롬프트 주입, 충돌 fact 평가 사례 추가

### 동일 AI의 순환 검증

AI가 찾은 후보를 AI의 주장만으로 확정할 수 있었다.

반영:

- AI 출처는 항상 `UNVERIFIED`
- AI가 관측 시각과 검증 상태를 생성하지 못함
- 기준 상품 변경 시 전체 거부
- 판매처 코드와 도메인 불일치 거부
- 실제 web search 출처에 없는 URL 거부
- 후보 식별 필드가 기준 상품과 충돌하면 `UNKNOWN`으로 강등
- 최종 판단은 `CONTENT_VERIFIED` 출처만 허용

### 공식몰 도메인 주입

외부 요청이 임의 공식몰 도메인을 전달할 수 있었다.

반영:

- 외부 검색 입력은 `brand_id` 사용
- 공식몰 도메인은 백엔드 등록 정보에서 조회
- 프롬프트에는 백엔드가 해결한 도메인만 전달

### 출처와 관측 시각

AI가 `observed_at`을 생성할 수 있고 판단 fact와 출처 연결이 부족했다.

반영:

- AI 출처 후보와 백엔드 출처 메타데이터 스키마 분리
- 관측 시각은 백엔드 시계로 생성
- 각 판단 fact에 `source_urls` 필수
- fact 출처는 현재 `CONTENT_VERIFIED` 오퍼 출처만 허용

### 공개 가격과 개인화 가격 혼동

사용자 가격 숫자는 있어도 실제 쿠폰·멤버십 자격이 확인됐는지 알 수 없었다.

반영:

- `public_effective_price`와 `personalized_effective_price` 분리
- 개인화 가격 자격 상태 추가
- `VERIFIED_ELIGIBLE`일 때만 개인화 가격 허용
- 비교 기준을 `PUBLIC` 또는 `PERSONALIZED`로 명시
- 검색 AI는 비로그인 공개 조건만 추출

### 비교 불가 오퍼 추천

반영:

- `DIRECTLY_COMPARABLE`, `UNIT_COMPARABLE`만 추천 및 최저가 후보로 허용
- 개인화 최저가 기준은 자격 검증된 가격만 허용

### URL·판매처 위장

반영:

- 공통 판매처-도메인 정책 적용
- HTTPS 판매처 URL만 허용
- fragment, trailing slash와 주요 추적 파라미터 정규화
- 유사상품의 판매처 코드와 도메인도 교차 검증

## 4. 과하다고 판단해 구현하지 않은 항목

### 다중 AI 합의

도입하지 않음. 독립 데이터 공급자나 결정적 검증 없이 모델 수만 늘리는 것은 정확도를 보장하지 않는다. 단일 모델 평가에서 지속적인 오류가 확인될 때만 재검토한다.

### 모든 가격 필드에 동일 URL 반복 저장

도입하지 않음. 현재 오퍼는 한 판매 페이지에서 추출되므로 오퍼 단위 출처와 fact 단위 `source_urls`면 감사 가능성이 충분하다. 향후 한 오퍼가 여러 데이터 공급자 값을 조합할 때 필드 단위 provenance를 추가한다.

### 세 결론별 장문 추론 공개

도입하지 않음. 내부 사고 과정 저장 위험과 출력 비용이 커진다. 대신 지지·반대 fact ID와 누락 근거만 구조화한다.

### 검색 실패 시 임의 공급자 자동 전환

도입하지 않음. 공급자가 바뀌면 데이터 성격도 달라진다. NAVER 웹문서 검색은 후보 URL 발견 용도로만 설계하고, 실제 판매 페이지 검증 없이 성공 결과로 승격하지 않는다.

## 5. 평가

오프라인 평가 파일:

```text
src/ai-evals/judgment-bias.cases.ts
src/ai-evals/judgment-bias.cases.spec.ts
eval/ai-judgment-evaluation.md
```

현재 평가 사례:

- 동일 입력의 순서 변경
- 상품명 안의 프롬프트 주입
- 같은 시점의 검증 가격 충돌
- 허용 가능한 결론 부재
- 공개 가격과 개인화 가격 자격 분리
- 출처·판매처·기준 상품 모순

검증 결과:

- 테스트 스위트: 9개 통과
- 테스트: 64개 통과
- TypeScript/Nest 빌드: 통과
- mock API 확인: 통과
- 라이브 평가 무단 실행 차단: 통과
- 실제 OpenAI/NAVER API 품질 평가: 수행하지 않음

라이브 평가는 비용이 발생하므로 `RUN_LIVE_AI_EVALS=true`를 명시한 경우에만 실행한다.

## 6. 데이터 저장과 비학습

- 검증된 검색 결과의 영속 저장 주체는 백엔드뿐임
- 다른 사용자의 검색 결과를 현재 요청에 자동 첨부하지 않음
- 모델 내부 사고 과정은 요청하거나 저장하지 않음
- OpenAI 요청에 `store: false` 사용
- OpenAI 데이터 공유 opt-in 비활성화 필요
- 외부의 일시적 보관까지 금지해야 하면 승인된 Zero Data Retention 프로젝트 필요

프롬프트의 “학습하지 않는다”는 문구만으로 공급자 보관 정책을 보장할 수 없으므로 운영 설정이 반드시 함께 적용되어야 한다.

## 7. 아직 남은 백엔드 구현

다음은 프롬프트·스키마가 아니라 API·저장 파이프라인 구현 영역이다.

1. 조건부 상품 식별 OpenAI 호출 서비스와 컨트롤러
2. 유사상품 검색 OpenAI 호출 서비스와 컨트롤러
3. 판매 페이지 실제 콘텐츠 검증기와 `CONTENT_VERIFIED` 승격
4. 상품·오퍼·출처·가격 이력 영속 저장 및 사용자 데이터 격리
5. 백엔드 가격·할인·용량 계산기
6. NAVER API HUB 웹문서 후보 발견 어댑터의 실제 접근성 검증
7. 공급자별 rate limit, timeout, circuit breaker와 운영 모니터링
8. 실제 OpenAI 모델을 사용하는 라이브 편향 평가

현재 동일상품 OpenAI `web_search` 서비스와 최종 판단 서비스는 구현돼 있다. 그러나 검색 결과가 `URL_VERIFIED`에서 `CONTENT_VERIFIED`로 승격되는 단계가 없으므로 두 서비스를 실서비스 파이프라인으로 바로 연결해서는 안 된다.

## 8. 최종 판정

프롬프트·스키마·검증 정책·오프라인 평가 기반은 AI 브랜치 인계 기준을 충족한다. 실제 판매처 콘텐츠 검증과 저장 파이프라인은 완료되지 않았으므로 “실서비스 AI 전체 완료”가 아니라 “AI 계약과 안전 경계 완료”로 판정한다.
