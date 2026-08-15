import {
  BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES,
  BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS,
  BrandOfficialDomainCache,
} from './brand-official-domain.cache';

describe('BrandOfficialDomainCache', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('returns a stored domain before it expires', () => {
    const cache = new BrandOfficialDomainCache(1000, 10, clock);
    cache.set('brand', 'brand.co.kr');
    now += 999;
    expect(cache.get('brand')).toBe('brand.co.kr');
  });

  it('drops a stored domain once the TTL has passed, so a bad entry cannot persist', () => {
    const cache = new BrandOfficialDomainCache(1000, 10, clock);
    cache.set('brand', 'wrong-domain.example');
    now += 1000;
    expect(cache.get('brand')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('returns null for a key it never stored', () => {
    const cache = new BrandOfficialDomainCache(1000, 10, clock);
    expect(cache.get('brand')).toBeNull();
  });

  it('evicts the oldest entry instead of growing past maxEntries', () => {
    const cache = new BrandOfficialDomainCache(1000, 2, clock);
    cache.set('a', 'a.co.kr');
    cache.set('b', 'b.co.kr');
    cache.set('c', 'c.co.kr');
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe('b.co.kr');
    expect(cache.get('c')).toBe('c.co.kr');
  });

  it('refreshes both the value and the expiry when a key is set again', () => {
    const cache = new BrandOfficialDomainCache(1000, 10, clock);
    cache.set('brand', 'old.co.kr');
    now += 900;
    cache.set('brand', 'new.co.kr');
    now += 900;
    expect(cache.get('brand')).toBe('new.co.kr');
    expect(cache.size).toBe(1);
  });

  it('ships with bounds that are actually set', () => {
    expect(BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS).toBeGreaterThan(0);
    expect(BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    const cache = new BrandOfficialDomainCache();
    cache.set('brand', 'brand.co.kr');
    expect(cache.get('brand')).toBe('brand.co.kr');
  });
});
