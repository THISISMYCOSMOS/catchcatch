-- P0: legacy component_type is intentionally retained while the three
-- independent composition dimensions move to explicit, fail-closed values.
alter table public.seller_offer_components
  add column physical_type text not null default 'UNKNOWN',
  add column commercial_inclusion text not null default 'UNKNOWN',
  add column product_identity text not null default 'UNKNOWN',
  add column verification_status text not null default 'UNKNOWN';

alter table public.seller_offer_components
  add constraint seller_offer_components_physical_type_chk
    check (physical_type in ('COSMETIC', 'NON_COSMETIC', 'UNKNOWN')),
  add constraint seller_offer_components_commercial_inclusion_chk
    check (commercial_inclusion in ('PAID', 'BONUS', 'UNKNOWN')),
  add constraint seller_offer_components_product_identity_chk
    check (product_identity in ('SAME_PRODUCT', 'DIFFERENT_PRODUCT', 'NOT_APPLICABLE', 'UNKNOWN')),
  add constraint seller_offer_components_verification_status_chk
    check (verification_status in ('VERIFIED', 'UNKNOWN'));

-- Product identity components travel through the same Core contract. They
-- retain the dimensions so a future verified anchor is not collapsed back to
-- the legacy type-only representation.
alter table public.product_components
  add column physical_type text not null default 'UNKNOWN',
  add column commercial_inclusion text not null default 'UNKNOWN',
  add column product_identity text not null default 'UNKNOWN',
  add column verification_status text not null default 'UNKNOWN';

alter table public.product_components
  add constraint product_components_physical_type_chk check (physical_type in ('COSMETIC', 'NON_COSMETIC', 'UNKNOWN')),
  add constraint product_components_commercial_inclusion_chk check (commercial_inclusion in ('PAID', 'BONUS', 'UNKNOWN')),
  add constraint product_components_product_identity_chk check (product_identity in ('SAME_PRODUCT', 'DIFFERENT_PRODUCT', 'NOT_APPLICABLE', 'UNKNOWN')),
  add constraint product_components_verification_status_chk check (verification_status in ('VERIFIED', 'UNKNOWN'));

-- The legacy index did not distinguish commercial/identity dimensions, so it
-- rejected a paid component and an otherwise identical same-product bonus.
drop index if exists public.seller_offer_components_identity_unique;
create unique index seller_offer_components_identity_unique
  on public.seller_offer_components (
    seller_offer_id,
    component_type,
    coalesce(name, ''),
    coalesce(capacity_value, -1),
    coalesce(capacity_unit, ''),
    coalesce(quantity, -1),
    physical_type,
    commercial_inclusion,
    product_identity,
    verification_status
  );

-- A content-verified page alone is not enough.  Option binding and paid
-- configuration evidence are separate proofs and all legacy rows remain
-- UNKNOWN rather than being promoted by inference.
alter table public.seller_offers
  add column source_verification_status text not null default 'UNKNOWN',
  add column selected_option_verification_status text not null default 'UNKNOWN',
  add column paid_configuration_verification_status text not null default 'UNKNOWN',
  add column verification_reason_codes text[] not null default array[]::text[];

alter table public.seller_offers
  add constraint seller_offers_source_verification_status_chk
    check (source_verification_status in ('VERIFIED', 'UNKNOWN')),
  add constraint seller_offers_selected_option_verification_status_chk
    check (selected_option_verification_status in ('VERIFIED', 'UNKNOWN')),
  add constraint seller_offers_paid_configuration_verification_status_chk
    check (paid_configuration_verification_status in ('VERIFIED', 'UNKNOWN'));

-- Existing analysis snapshots can look complete but have no independent
-- proof/dimension data. Mark the snapshot envelope so readers fail closed.
update public.analysis_offers
set offer_snapshot = coalesce(offer_snapshot, '{}'::jsonb) || jsonb_build_object(
  'compositionVerificationStatus', 'UNKNOWN',
  'sourceVerificationStatus', 'UNKNOWN',
  'selectedOptionVerificationStatus', 'UNKNOWN',
  'paidConfigurationVerificationStatus', 'UNKNOWN'
)
where coalesce(offer_snapshot, '{}'::jsonb)->>'compositionVerificationStatus' is null;
