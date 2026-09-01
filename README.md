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
- `원가에 가까움`: 세일처럼 보이지만 평소 가격과 큰 차이가 없는 경우
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

## 분석 기록 보존 운영

사용자 분석 기록은 생성 시점부터 7일 뒤 만료됩니다. `013_user_analysis_retention.sql` 배포 후에는 운영 환경에서 인증된 service-role 작업이 `public.purge_expired_analyses()`를 정기 호출해야 실제 삭제가 완료됩니다. 스케줄러 설정과 DB 배포는 별도 운영 승인 대상이며, 이 저장소는 `pg_cron`을 설정하지 않습니다.

## 휴대폰 인증 및 재가입 제한 운영

로그인과 회원가입은 Supabase Phone Auth의 SMS OTP를 사용합니다. 공개 Auth 요청은 `SUPABASE_ANON_KEY`, DB 작업은 `SUPABASE_SERVICE_ROLE_KEY`로 분리합니다. Backend 환경에는 32자 이상의 안정적인 `PHONE_IDENTITY_HMAC_SECRET`이 필요하며, 이 값은 프론트엔드에 노출하거나 운영 중 임의로 교체하면 안 됩니다.

`014_phone_identity_quota.sql`은 인증된 휴대폰 번호의 HMAC만 별도 남용 방지 주체로 저장합니다. 회원이 탈퇴해 Auth `user_id`가 삭제되어도 같은 번호의 quota는 7일 동안 이어지며, 원문 휴대폰 번호는 이 테이블에 저장하지 않습니다. 만료된 탈퇴 주체의 실제 삭제를 위해 운영 환경의 service-role 작업이 `public.purge_expired_abuse_subjects()`를 정기 호출해야 합니다. SMS 제공자, CAPTCHA, Auth rate limit, DB migration, 정리 스케줄러의 원격 설정은 별도 운영 승인 대상입니다.

`015_terms_withdrawal.sql`은 약관 버전, 공개 문서의 SHA-256, 동의 시각과 탈퇴 시각을 저장하고 회원탈퇴를 단일 DB 트랜잭션으로 처리합니다. 약관 원문이 확정되기 전에는 `TERMS_VERSION`과 `TERMS_DOCUMENT_SHA256`을 설정하지 않으며 신규 가입도 허용되지 않습니다. 시범 운영 중에는 활성 계정의 동의 기록을 유지하고, 탈퇴 처리된 동의 기록은 탈퇴 시각부터 1개월 뒤 `public.purge_expired_terms_consents()`로 삭제합니다. 실제 삭제를 위해서는 운영 환경의 service-role 작업이 이 함수를 정기 호출해야 하며, 스케줄러와 DB 배포는 별도 운영 승인 대상입니다.

브라우저에는 access token이나 refresh token을 저장하지 않습니다. 두 토큰은 `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키로만 전달되며 Core가 access cookie를 Backend용 Bearer 헤더로 변환합니다. 운영 배포에서는 Frontend와 Core를 같은 site의 HTTPS 도메인으로 구성해야 합니다.
