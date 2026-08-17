do $$
begin
  if exists (
    select 1
    from (
      select product_id, seller_name, seller_url, count(*) as row_count
      from public.seller_offers
      group by product_id, seller_name, seller_url
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Cannot add seller_offers identity unique index while duplicate product/seller/url rows exist';
  end if;
end;
$$;

create unique index seller_offers_product_seller_url_unique
  on public.seller_offers(product_id, seller_name, seller_url);
