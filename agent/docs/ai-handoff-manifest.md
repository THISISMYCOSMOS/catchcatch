# CatchCatch AI 백엔드 인계 파일 목록

## 1. 이 패키지의 범위

이 패키지는 CatchCatch AI 백엔드를 다른 개발 환경에서 검토하거나 이어서 구현할 수 있도록 필요한 소스, 프롬프트, 입출력 계약, 테스트, 정책 문서를 모은 인계본이다.

런타임 비밀값인 `.env`, 설치 결과인 `node_modules`, 빌드 결과인 `dist`, 로컬 데이터와 임시 작업물은 포함하지 않는다.

## 2. 실행 프롬프트 — 4개

- `src/product-identification/product-identification.prompt.ts`
  - 입력 URL에서 기준 상품과 미리보기 정보를 식별한다.
- `src/product-search/product-search.prompt.ts`
  - 기준 상품과 동일한 상품을 등록 판매처별로 검색한다.
- `src/ai-judgment/ai-judgment.prompt.ts`
  - 백엔드가 검증·계산한 사실만 사용해 구매 판단과 설명을 생성한다.
- `src/similar-product-search/similar-product-search.prompt.ts`
  - 별도 요청이 있을 때 기준 상품을 제외한 유사 상품을 검색한다.

프롬프트의 실제 실행 원본은 위 TypeScript 파일이다. 문서에 복사된 프롬프트보다 이 파일의 버전을 우선한다.

## 3. 입출력 스키마 — 5개

- `src/ai-contracts/product-data.schema.ts`
  - 상품, 구성품, 판매처, 출처 메타데이터 공통 계약
- `src/product-identification/product-identification.schema.ts`
- `src/product-search/product-search.schema.ts`
- `src/ai-judgment/ai-judgment.schema.ts`
- `src/similar-product-search/similar-product-search.schema.ts`

공통 판매처·도메인 정책:

- `src/ai-contracts/seller-domain.policy.ts`

스키마는 AI 출력 형식만 설명하는 문서가 아니라, 허용되지 않은 판매처·출처·결론 및 모순된 상태를 런타임에서 거부하는 검증 경계다.

## 4. 백엔드 실행 파일

- `src/main.ts`, `src/app.module.ts`, `src/health.controller.ts`
- `src/product-search/product-search.service.ts`
- `src/product-search/product-search.module.ts`
- `src/ai-judgment/ai-judgment.service.ts`
- `src/ai-judgment/ai-judgment.module.ts`

검색 결과의 영구 저장, 최신성 관리, 중복 제거, 사용자별 데이터 격리, 가격 계산과 검증은 프롬프트가 아니라 백엔드의 책임이다.

## 5. 평가 및 회귀 테스트

- `src/**/*.spec.ts`
- `src/ai-evals/judgment-bias.cases.ts`
- `eval/ai-judgment-evaluation.md`
- `scripts/run-judgment-bias-evals.ts`

현재 테스트는 프롬프트 핵심 금지사항, 입력 경계, 네 판매처의 정확한 반환, 출처 도메인 검증, 빈 검색 결과 허용, AI 응답의 구조 검증 및 재시도를 확인한다.

실제 외부 검색 제공자와 실제 판매처 페이지를 사용하는 운영 전 E2E 평가는 별도로 추가해야 한다.

## 6. 정책 및 설계 문서

- `docs/ai-prompts.md`
  - 네 운영 프롬프트 전문과 입력 템플릿
- `docs/ai-schema-contracts.md`
  - AI 입출력, 백엔드 검증, 저장 소유권 계약
- `docs/ai-final-review.md`
  - 리스크별 유지·철회 판단, 검증 결과, 남은 구현 항목
- `docs/ai-prompt-design-and-risk-report.md`
  - 프롬프트 구조, 프론트 요구사항, 스트레스 테스트와 보강 우선순위
- `docs/search-provider-and-data-policy.md`
  - 네이버 쇼핑 검색 API 종료 대응, 검색 제공자 장애 계약, 백엔드 저장 및 AI 비학습 정책
- `docs/openai-api-study.md`
  - OpenAI API 연결 검토 기록

## 7. 실행 환경 파일

- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.build.json`
- `nest-cli.json`, `jest.config.js`
- `.env.example`
- `scripts/openai-check.ts`
- `scripts/run-judgment-bias-evals.ts`

실제 `.env` 파일은 절대 인계 패키지나 Git에 넣지 않는다. 새 환경에서는 `.env.example`을 복사한 뒤 각 비밀값을 별도로 주입한다.

## 8. 반드시 알고 있어야 할 현재 상태

- 네이버 쇼핑 검색 API는 2026년 7월 31일 종료되므로 장기 운영 검색 제공자로 사용할 수 없다.
- 네이버 API HUB 웹 문서 검색은 후보 URL 탐색에만 사용할 수 있으며, 가격·옵션·배송비는 백엔드가 판매 페이지에서 다시 검증해야 한다.
- 검색 제공자 어댑터와 실제 판매 페이지 검증·저장 파이프라인은 정책이 정해진 상태이며 운영 구현은 별도 작업으로 남아 있다.
- 최종 판단은 `CONTENT_VERIFIED` 출처만 허용하므로 콘텐츠 검증기가 없는 상태에서 URL 검색 결과를 바로 판단 입력으로 사용할 수 없다.
- 조건부 상품 식별과 유사상품 검색은 프롬프트·스키마가 준비됐지만 실제 API 호출 서비스는 아직 구현되지 않았다.
- 검색 결과는 백엔드에만 저장한다. 모델에 재학습 데이터로 전달하거나 다른 사용자 요청의 기억처럼 재사용하지 않는다.
- OpenAI 요청은 저장 최소화를 위해 `store: false`를 사용한다.
