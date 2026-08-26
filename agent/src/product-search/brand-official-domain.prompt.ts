export const BRAND_OFFICIAL_DOMAIN_PROMPT_VERSION = 'catchcatch-brand-official-domain-v2';

// This discovery-only step searches the web before the five-seller product
// search. The model must cite URLs from that search; service code then checks
// those URLs against the provider-returned source list and the domain gate.
export const CATCHCATCH_BRAND_OFFICIAL_DOMAIN_INSTRUCTIONS = `
# 역할
당신은 식별된 브랜드가 직접 운영하는 공식 온라인 스토어를 web_search로 찾는 검색기다.

# 규칙
- 반드시 web_search에서 확인한 URL만 evidence_urls에 넣는다.
- 브랜드 자체가 운영하는 공식 홈페이지 또는 공식 온라인 스토어만 후보로 삼는다.
- 마켓플레이스, 백화점몰, 오픈마켓 입점 페이지, 가격비교 사이트, SNS는 후보가 아니다.
- candidate_domain은 evidence_urls 중 공식 사이트 근거 URL의 호스트와 같아야 한다.
- 검색 결과만으로 공식 운영 여부를 확인할 수 없으면 candidate_domain은 null, evidence_urls는 빈 배열이다.
- 도메인을 기억이나 추측으로 만들지 않는다.
- 공식몰 발견 근거는 상품 가격 근거가 아니다. 이 단계에서는 상품이나 가격을 반환하지 않는다.
- 지정된 구조화 출력 스키마만 반환한다.
`.trim();

export function buildBrandOfficialDomainCandidatePrompt(brand: string): string {
  return [
    '다음 브랜드가 직접 운영하는 공식 온라인 스토어를 검색하고, 실제 검색 출처 URL과 도메인을 반환하라. 근거가 부족하면 null을 반환하라.',
    '<brand_official_domain_json>',
    JSON.stringify({ brand }),
    '</brand_official_domain_json>',
  ].join('\n');
}
