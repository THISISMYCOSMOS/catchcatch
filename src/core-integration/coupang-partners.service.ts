import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

type CoupangDeeplinkResponse = {
  rCode?: string;
  data?: Array<{
    originalUrl?: string;
    shortenUrl?: string;
    landingUrl?: string;
  }>;
};

@Injectable()
export class CoupangPartnersService {
  private readonly logger = new Logger(CoupangPartnersService.name);

  constructor(private readonly config: ConfigService) {}

  async convert(sourceUrl: string): Promise<string | null> {
    if (!this.isEnabled() || !isConvertibleCoupangUrl(sourceUrl)) {
      return null;
    }
    const accessKey = this.config.get<string>('COUPANG_PARTNERS_ACCESS_KEY')?.trim();
    const secretKey = this.config.get<string>('COUPANG_PARTNERS_SECRET_KEY')?.trim();
    if (!accessKey || !secretKey) {
      this.logger.warn('Coupang Partners deeplink is enabled but credentials are missing');
      return null;
    }

    const baseUrl = this.config.get<string>(
      'COUPANG_PARTNERS_API_BASE_URL',
      'https://api-gateway.coupang.com',
    );
    const endpoint = new URL(DEEPLINK_PATH, baseUrl);
    const signedDate = formatSignedDate(new Date());
    const signature = createHmac('sha256', secretKey)
      .update(`${signedDate}POST${endpoint.pathname}${endpoint.searchParams.toString()}`)
      .digest('hex');
    const authorization = [
      'CEA algorithm=HmacSHA256',
      `access-key=${accessKey}`,
      `signed-date=${signedDate}`,
      `signature=${signature}`,
    ].join(', ');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ coupangUrls: [sourceUrl] }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      if (!response.ok) {
        this.logger.warn(`Coupang Partners deeplink request failed with HTTP ${response.status}`);
        return null;
      }
      const payload = await response.json() as CoupangDeeplinkResponse;
      const candidate = payload.data?.[0]?.shortenUrl ?? payload.data?.[0]?.landingUrl;
      return isSafeCoupangPurchaseUrl(candidate) ? candidate : null;
    } catch (error) {
      this.logger.warn(
        `Coupang Partners deeplink request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private isEnabled(): boolean {
    return this.config.get<string>('COUPANG_PARTNERS_ENABLED', 'false').trim().toLowerCase() === 'true';
  }

  private timeoutMs(): number {
    const parsed = Number(this.config.get<string>('COUPANG_PARTNERS_TIMEOUT_MS', '3000'));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
  }
}
function formatSignedDate(date: Date): string {
  return date.toISOString().replace(/^\d{2}(\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).*$/, '$1$2$3T$4$5$6Z');
}

function isConvertibleCoupangUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (hostname === 'coupang.com' || hostname.endsWith('.coupang.com')) && hostname !== 'link.coupang.com';
  } catch {
    return false;
  }
}

function isSafeCoupangPurchaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      hostname === 'link.coupang.com' ||
      hostname === 'coupang.com' ||
      hostname.endsWith('.coupang.com')
    );
  } catch {
    return false;
  }
}
