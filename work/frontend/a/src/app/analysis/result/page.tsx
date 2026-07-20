import { AnalysisResultScreen } from "@/components/analysis/analysis-result-screen";
import { DEFAULT_COUPANG_PRODUCT_URL, validateCoupangProductUrl } from "@/lib/analysis-url";

type AnalysisResultPageProps = {
  searchParams: Promise<{
    url?: string | string[];
    platform?: string | string[];
  }>;
};

export default async function AnalysisResultPage({ searchParams }: AnalysisResultPageProps) {
  const query = await searchParams;
  const requestedUrl = Array.isArray(query.url) ? query.url[0] : query.url;
  const validation = validateCoupangProductUrl(requestedUrl ?? DEFAULT_COUPANG_PRODUCT_URL);
  const productUrl = validation.ok ? validation.productUrl : DEFAULT_COUPANG_PRODUCT_URL;

  return <AnalysisResultScreen productUrl={productUrl} platform="쿠팡" />;
}

