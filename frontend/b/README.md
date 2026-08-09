# CatchCatch Frontend B

캐치캐치의 모바일 상품 분석 결과 화면입니다. 분석 결과, 가격 변화, 판매처 비교, 유사상품 팝업을 한 화면에서 전환합니다.

## 실행

```bash
npm install
npm run dev
```

검증은 `npm run lint`와 `npm test`로 실행합니다.

## 데이터 출처

- 현재 화면 데이터: `frontend_mock`
- 쿠팡·무신사·올리브영: 제공된 CSV 기반
- 브랜드 공식몰: 사용자가 추가를 승인한 임시 목업
- 실제 연동 시 `app/data/analysis.mock.ts`를 백엔드 API 응답 어댑터로 교체

프론트엔드는 최저가·추천·구매 가치를 새로 계산하지 않고 백엔드 결과를 표시하는 역할만 담당합니다.
