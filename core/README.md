# CatchCatch Core

Core는 공개 프론트엔드와 내부 Backend·Agent 사이의 오케스트레이션 계층입니다.

- 프론트엔드는 Core만 호출합니다.
- Core는 사용자 인증 토큰을 Backend로 전달합니다.
- Backend는 인증, 권한, DB, 결정적 계산과 저장을 담당합니다.
- Agent는 상품 식별, 판매처 검색, 판단 설명만 담당합니다.
- Core와 내부 서비스 사이 요청은 `x-internal-api-token`으로 인증합니다.

## 분석 흐름

1. Agent가 입력 URL의 기준 상품을 식별합니다.
2. Backend가 식별 결과를 상품 레코드로 해석하거나 생성합니다.
3. Agent가 동일 상품 판매처 후보를 검색합니다.
4. Backend가 검증 가능한 판매처 데이터를 저장하고 결정적 계산을 실행합니다.
5. Backend가 사실 기반 판단 입력을 만들고 Agent가 설명을 생성합니다.
6. Backend가 판단 결과를 저장한 뒤 Core가 최종 응답을 반환합니다.

Backend 내부 계약은 `src/contracts.ts`의 `BackendClient` 호출 형태를 기준으로 구현합니다.
