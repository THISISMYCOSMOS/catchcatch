# OpenAI API 연결 학습 노트

## 핵심 구조

API 키는 브라우저가 아니라 서버의 `.env`에만 둔다. `.env.example`에는 변수 이름만 기록하며 실제 키는 Git에 저장하지 않는다.

`AiJudgmentService`는 OpenAI SDK의 `responses.parse()`와 `zodTextFormat()`을 사용한다. 모델 응답이 Zod 스키마를 따르더라도 서버는 다음 도메인 규칙을 다시 검사한다.

- `DECIDED` 결론이 `allowed_conclusions`에 포함되는가
- 근거 부족 시 `INSUFFICIENT_EVIDENCE`, `conclusion: null`, 추천 없음이 함께 지켜지는가
- 추천 ID가 `allowed_offer_ids`에 포함되는가
- 근거 ID가 실제 입력 사실만 가리키는가

`mock` 모드는 API를 호출하지 않아 테스트가 빠르고 일정하다. `real` 모드의 호출 실패는 mock 성공으로 대체하지 않는다.

## 로컬 확인

```powershell
Copy-Item .env.example .env
```

키 없이 구조만 확인하려면 `.env`에서 `AI_JUDGMENT_MODE=mock`으로 설정하고 실행한다.

```powershell
npm run openai:check
```

실제 연결은 `AI_JUDGMENT_MODE=real`과 본인의 `OPENAI_API_KEY`를 설정한 뒤 같은 명령으로 확인한다.

## CatchCatch의 두 AI 호출

1. `PRODUCT_DATA_MODE=web_search`일 때 검색·추출 호출이 입력 링크의 상품을 먼저 식별하고, 같은 상품·옵션을 네 판매처에서 찾는다.
2. 백엔드가 상품 동일성, 비교 가능성, 가격과 선택 기준을 검증·계산한다.
3. 최종 판단 호출은 검증된 사실과 허용 목록만 받아 결론과 설명을 만든다.

검색 프롬프트와 판단 프롬프트는 서로 책임이 다르다. 검색 AI는 구매 결론이나 최저가를 만들 수 없고, 판단 AI는 웹 검색을 하거나 새 가격을 만들 수 없다. 데모 기본값은 `PRODUCT_DATA_MODE=sample`이며, `web_search` 결과와 샘플 결과를 한 분석에서 섞지 않는다.
