# Backend Integration Follow-ups

## Structured seller benefit evidence

Current Agent product-search payloads provide seller offer discount conditions as raw text evidence through `discount_conditions`. The Backend does not infer membership, shopping-grade, or card eligibility from natural language because that would create user-specific pricing without a verified structured condition.

Needed contract extension:
- Structured benefit type: `MEMBERSHIP`, `SHOPPING_GRADE`, or `CARD`
- Provider or issuer
- Required membership type, grade, or card product code when applicable
- Discount amount
- Exclusive group when discounts cannot stack
- Source fact or evidence reference

Backend impact:
- Persist verified structured entries into `seller_offer_benefits`
- Apply them through existing user membership, shopping grade, and card repositories
- Keep raw `discount_conditions` as evidence, not as executable eligibility rules

## Pre-identification search quota enforcement

Current Core orchestration calls the Agent product identification step before the first Backend internal write call, `POST /internal/v1/products/resolve`. Backend quota enforcement therefore happens at product resolve time, after identification but before seller search data is persisted or used for analysis.

Needed contract extension:
- Core calls a Backend quota consume endpoint before Agent product identification, or
- Core moves product identification behind a Backend-owned orchestration boundary.

Backend impact:
- Keep Backend and PostgreSQL as the quota source of truth.
- Reuse the same idempotency key semantics so Core retries do not double-charge quota.
