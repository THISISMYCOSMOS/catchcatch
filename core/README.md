# CatchCatch Core

Core는 공개 프론트엔드와 내부 Backend·Agent 사이의 오케스트레이션 계층입니다.

- 프론트엔드는 Core만 호출합니다.
- Core는 사용자 인증 토큰을 Backend로 전달합니다.
- Backend는 인증, 권한, DB, 결정적 계산과 저장을 담당합니다.
- Agent는 상품 식별, 판매처 검색, 판단 설명만 담당합니다.
- Core와 내부 서비스 사이 요청은 `x-internal-api-token`으로 인증합니다.

## 공개 분석 API

모든 경로는 `Authorization: Bearer <access token>`이 필요합니다.

- `POST /api/v1/analyses`
- `GET /api/v1/analyses/recent?limit=1`
- `GET /api/v1/analyses/{analysisId}`
- `DELETE /api/v1/analyses/{analysisId}`

새 사용자 검색은 새 요청 ID를 사용하므로 기존 분석을 수정하지 않습니다. 같은 요청의
네트워크 재시도만 동일한 `idempotencyKey`를 재사용합니다.

## 분석 흐름

1. Agent가 입력 URL의 기준 상품을 식별합니다.
2. Backend가 식별 결과를 상품 레코드로 해석하거나 생성합니다.
3. Agent가 동일 상품 판매처 후보를 검색합니다.
4. Backend가 검증 가능한 판매처 데이터를 저장하고 결정적 계산을 실행합니다.
5. Backend가 사실 기반 판단 입력을 만들고 Agent가 설명을 생성합니다.
6. Backend가 판단 결과를 저장한 뒤 Core가 최종 응답을 반환합니다.

최종 저장이 실패하거나 Backend가 `COMPLETED` 상태를 확인해 주지 않으면 Core는 완료
응답을 반환하지 않습니다. Backend·Agent 주소와 `x-internal-api-token`은 Core의 서버
환경에만 두며 Frontend 환경 변수나 응답에 포함하지 않습니다.

Backend 내부 계약은 `src/contracts.ts`의 `BackendClient` 호출 형태를 기준으로 구현합니다.

## 실행과 로컬 환경

`npm start`는 `core/.env`가 있으면 자동으로 읽고, 파일이 없으면 배포 환경에서 주입된 변수를 사용합니다. 로컬에서는 `.env.example`을 기준으로 실제 비밀값을 별도 설정하세요. 기본 상품 도메인에는 `zigzag.kr`가 포함됩니다.

저장소 루트의 `npm run verify:local-integration`은 유료 API나 원격 DB 없이 Core의 전체 HTTP 계약을 재현합니다.
