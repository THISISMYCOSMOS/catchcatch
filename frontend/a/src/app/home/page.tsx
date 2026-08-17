"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeScreen } from "@/components/home/home-screen";
import { getMockAuthenticatedRoute, getMockAuthenticatedUsername } from "@/lib/mock/session";
import { getFrontendMockWeeklyAnalysisUsage, type WeeklyAnalysisUsageViewModel } from "@/lib/mock/weekly-analysis-usage";

type HomeSession = {
  username: string;
  weeklyAnalysisUsage: WeeklyAnalysisUsageViewModel;
};

export default function HomePage() {
  const router = useRouter();
  const [homeSession, setHomeSession] = useState<HomeSession | null>(null);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }
      const username = getMockAuthenticatedUsername();
      if (!username) {
        router.replace("/login");
        return;
      }
      setHomeSession({
        username,
        weeklyAnalysisUsage: getFrontendMockWeeklyAnalysisUsage(username),
      });
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  return homeSession ? (
    <HomeScreen
      username={homeSession.username}
      initialWeeklyAnalysisUsage={homeSession.weeklyAnalysisUsage}
    />
  ) : null;
}
