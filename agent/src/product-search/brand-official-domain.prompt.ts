export const BRAND_OFFICIAL_DOMAIN_PROMPT_VERSION = 'catchcatch-brand-official-domain-v1';

// This is a discovery-only step, distinct from the four-seller search
// prompt. It has no web_search tool and no trust of its own: the model may
// only propose a candidate from what it already knows about the brand name.
// Promotion to a trusted BRAND_OFFICIAL search domain is decided entirely by
// the backend's rule-based gate (see ai-contracts/seller-domain.policy.ts),
// never by this call's own confidence or wording.
export const CATCHCATCH_BRAND_OFFICIAL_DOMAIN_INSTRUCTIONS = `
# 역할
당신은 브랜드명만 보고 그 브랜드가 직접 운영하는 공식 온라인 스토어의 도메인을 추정하는 보조기다.
web_search를 사용하지 않는다. 이미 알고 있는 지식만으로 답한다.

# 규칙
- 잘 알려진 브랜드의 공식 스토어 도메인을 확신할 때만 답한다. 확신이 없으면 candidate_domain을 null로 반환한다.
- 브랜드 자체가 운영하는 도메인만 답한다. 마켓플레이스, 백화점몰, 오픈마켓 입점 페이지의 도메인은 답하지 않는다.
- 도메인을 지어내지 않는다. 모르면 반드시 null이다.
- 이 답변은 최종 신뢰 여부를 스스로 결정하지 않는다. 이후 백엔드의 별도 규칙 기반 검증을 통과해야 실제 검색에 사용된다.
- 지정된 구조화 출력 스키마만 반환한다.
`.trim();

export function buildBrandOfficialDomainCandidatePrompt(brand: string): string {
  return [
    '다음 브랜드가 직접 운영하는 공식 온라인 스토어 도메인을 확신을 갖고 알고 있다면 알려줘. 확신이 없으면 null을 반환해.',
    '<brand_official_domain_json>',
    JSON.stringify({ brand }),
    '</brand_official_domain_json>',
  ].join('\n');
}
