import { ConfigService } from '@nestjs/config';
import { CoupangPartnersService } from './coupang-partners.service';

describe('CoupangPartnersService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stays disabled without making a network request', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const service = new CoupangPartnersService(new ConfigService({
      COUPANG_PARTNERS_ENABLED: 'false',
    }));

    await expect(service.convert('https://www.coupang.com/vp/products/1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a validated deeplink and keeps credentials out of the body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      rCode: '0',
      data: [{ shortenUrl: 'https://link.coupang.com/a/AbCd' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;
    const service = new CoupangPartnersService(new ConfigService({
      COUPANG_PARTNERS_ENABLED: 'true',
      COUPANG_PARTNERS_ACCESS_KEY: 'access-key',
      COUPANG_PARTNERS_SECRET_KEY: 'secret-key',
    }));

    await expect(service.convert('https://www.coupang.com/vp/products/1')).resolves
      .toBe('https://link.coupang.com/a/AbCd');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.body).toBe(JSON.stringify({ coupangUrls: ['https://www.coupang.com/vp/products/1'] }));
    expect(String(init.headers && (init.headers as Record<string, string>).authorization))
      .toContain('CEA algorithm=HmacSHA256');
    expect(String(init.body)).not.toContain('secret-key');
  });

  it('fails closed to the original-link fallback on an unsafe response URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      rCode: '0',
      data: [{ shortenUrl: 'https://attacker.example/redirect' }],
    }), { status: 200 })) as typeof fetch;
    const service = new CoupangPartnersService(new ConfigService({
      COUPANG_PARTNERS_ENABLED: 'true',
      COUPANG_PARTNERS_ACCESS_KEY: 'access-key',
      COUPANG_PARTNERS_SECRET_KEY: 'secret-key',
    }));

    await expect(service.convert('https://www.coupang.com/vp/products/1')).resolves.toBeNull();
  });
});
