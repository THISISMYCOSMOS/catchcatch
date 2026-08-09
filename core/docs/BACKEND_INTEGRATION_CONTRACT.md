# Core - Backend internal contract v1

Backend는 Agent를 직접 호출하지 않습니다. 아래 API는 Core만 호출하며 모든 요청에 두 헤더가 필요합니다.

- `Authorization: Bearer <user access token>`
- `x-internal-api-token: <shared internal token>`

내부 토큰과 사용자 소유권을 모두 검증하고, 정의하지 않은 요청 필드는 거부합니다.

## 1. 식별 상품 저장

`POST /internal/v1/products/resolve`

```json
{
  "schemaVersion": "product-identification.v1",
  "sourceUrl": "https://...",
  "identification": {},
  "idempotencyKey": "request-id"
}
```

```json
{
  "productId": "uuid",
  "brandId": "registered-brand-id-or-null"
}
```

- 동일 `idempotencyKey` 재호출은 같은 상품을 반환합니다.
- Agent가 반환한 내부 상품 ID를 신뢰하지 않고 Backend가 상품 키와 ID를 결정합니다.
- 상태가 `IDENTIFIED`가 아니면 저장하지 않습니다.

## 2. 판매처 가격 저장

`PUT /internal/v1/products/{productId}/offers`

```json
{
  "schemaVersion": "product-search.v1",
  "search": {},
  "idempotencyKey": "request-id"
}
```

- 상품 소유권·접근 권한과 상품 일치 여부를 검증합니다.
- `URL_VERIFIED`는 가격 내용이 검증됐다는 뜻이 아닙니다.
- Backend가 실제 페이지 내용과 일치함을 확인한 항목만 `CONTENT_VERIFIED`로 승격합니다.
- 검증하지 못한 가격은 계산과 AI 판단에서 제외합니다.
- 동일 요청 재시도 시 판매처 가격을 중복 생성하지 않습니다.

## 3. AI 판단 입력 조회

`GET /internal/v1/analyses/{analysisId}/judgment-context`

```json
{
  "judgmentInput": {}
}
```

- `judgmentInput`은 Agent의 `judgmentInputSchema`를 통과해야 합니다.
- 숫자·결론 후보·사용자 기준은 Backend의 결정적 계산 결과만 사용합니다.
- `CONTENT_VERIFIED` 출처가 없는 사실은 포함하지 않습니다.

## 4. AI 판단 결과 저장

`PUT /internal/v1/analyses/{analysisId}/judgment`

```json
{
  "schemaVersion": "ai-judgment.v1",
  "judgment": {}
}
```

- `judgment`는 Agent의 `aiJudgmentSchema`를 다시 검증합니다.
- 요청 사용자가 소유한 분석에만 저장합니다.
- Backend가 허용한 결론·판매처·사실 ID 밖의 값은 거부합니다.
- 응답은 기존 `AnalysisResponse` 형식을 사용합니다.

## 5. 인증 보완

- `POST /auth/refresh`: HttpOnly 쿠키의 refresh token으로 access token 갱신
- `POST /auth/logout`: Supabase 세션 폐기 및 refresh cookie 만료
- Refresh token은 JSON 응답이나 브라우저 저장소에 노출하지 않습니다.
