"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeScreen } from "@/components/home/home-screen";
import { restoreAuthenticatedUser } from "@/lib/api/auth";
import { getUserPreferences } from "@/lib/api/user-preferences";
import { getWeeklyAnalysisUsage, type WeeklyAnalysisUsageViewModel } from "@/lib/api/search-quota";
import { getRecentAnalyses, toRecentAnalysisItem, type RecentAnalysisItem } from "@/lib/api/analyses";

type HomeSession = {
  username: string;
  weeklyAnalysisUsage: WeeklyAnalysisUsageViewModel;
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
      const [weeklyAnalysisUsage, recentRecords] = await Promise.all([
        getWeeklyAnalysisUsage(),
        getRecentAnalyses(3),
      ]);
      if (cancelled) return;
      setHomeSession({
        username: user.phone ?? user.email ?? user.id,
        weeklyAnalysisUsage,
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
      initialWeeklyAnalysisUsage={homeSession.weeklyAnalysisUsage}
      recentAnalyses={homeSession.recentAnalyses}
    />
  ) : null;
}
