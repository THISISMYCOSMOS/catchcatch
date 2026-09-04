"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeScreen } from "@/components/home/home-screen";
import { restoreAuthenticatedUser } from "@/lib/api/auth";
import { getUserPreferences } from "@/lib/api/user-preferences";
import { getAnalysisUsage, type AnalysisUsageViewModel } from "@/lib/api/search-quota";
import { getRecentAnalyses, toRecentAnalysisItem, type RecentAnalysisItem } from "@/lib/api/analyses";

type HomeSession = {
  username: string;
  analysisUsage: AnalysisUsageViewModel;
  recentAnalyses: RecentAnalysisItem[];
};

export default function HomePage() {
  const router = useRouter();
  const [homeSession, setHomeSession] = useState<HomeSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await restoreAuthenticatedUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const preferences = await getUserPreferences(user.id);
      if (!preferences) {
        router.replace("/priorities");
        return;
      }
      const [analysisUsage, recentRecords] = await Promise.all([
        getAnalysisUsage(),
        getRecentAnalyses(3),
      ]);
      if (cancelled) return;
      setHomeSession({
        username: user.phone ?? user.email ?? user.id,
        analysisUsage,
        recentAnalyses: recentRecords.map(toRecentAnalysisItem),
      });
    })().catch(() => {
      if (!cancelled) router.replace("/login");
    });
    return () => { cancelled = true; };
  }, [router]);

  return homeSession ? (
    <HomeScreen
      username={homeSession.username}
      initialAnalysisUsage={homeSession.analysisUsage}
      recentAnalyses={homeSession.recentAnalyses}
    />
  ) : null;
}
