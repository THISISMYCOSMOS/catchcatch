export const BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS = 60 * 60 * 1000;
export const BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES = 200;

type CacheEntry = { domain: string; expiresAt: number };

// Bounded in-process cache of brand-official domains that have already
// passed the rule-based gate. It exists to avoid re-running the discovery
// call for a brand already resolved in this process, and both bounds exist
// to limit the damage of a single wrong discovery:
//
// - TTL: without it, one bad domain is reused for every later request with
//   the same brand name until someone restarts the process. With it, the
//   entry expires on its own and the next request re-discovers.
// - Max entries: the key is a brand name taken from AI-extracted page data,
//   i.e. attacker-influenceable text, so an unbounded Map is a memory sink
//   that a stream of distinct brand names can grow without limit.
//
// Eviction is oldest-inserted-first (Map preserves insertion order, and a
// hit deliberately does not refresh position). This is a cost cache, not a
// correctness mechanism: evicting a good entry only costs one extra
// discovery call.
//
// The clock is injected so expiry is testable without fake timers, and it
// is a plain class rather than service state so it can be tested at all —
// exercising it through ProductSearchService would require an OpenAI call.
export class BrandOfficialDomainCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = BRAND_OFFICIAL_DOMAIN_CACHE_TTL_MS,
    private readonly maxEntries: number = BRAND_OFFICIAL_DOMAIN_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.domain;
  }

  set(key: string, domain: string): void {
    // Delete first so a re-set moves the key to the back of the insertion
    // order instead of keeping its original eviction position.
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { domain, expiresAt: this.now() + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}
