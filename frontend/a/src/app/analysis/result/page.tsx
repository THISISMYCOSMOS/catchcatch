import { LiveAnalysisResultScreen } from "@/components/analysis/live-analysis-result-screen";

type AnalysisResultPageProps = {
  searchParams: Promise<{
    url?: string | string[];
    analysisId?: string | string[];
    platform?: string | string[];
  }>;
};

export default async function AnalysisResultPage({ searchParams }: AnalysisResultPageProps) {
  const query = await searchParams;
  const requestedUrl = Array.isArray(query.url) ? query.url[0] : query.url;
  const analysisId = Array.isArray(query.analysisId) ? query.analysisId[0] : query.analysisId;

  if (!analysisId) {
    return <LiveAnalysisResultScreen analysisId="missing" fallbackSourceUrl={requestedUrl ?? null} />;
  }
  return <LiveAnalysisResultScreen analysisId={analysisId} fallbackSourceUrl={requestedUrl ?? null} />;
}
