"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeScreen } from "@/components/home/home-screen";
import { isMockAuthenticated } from "@/lib/mock/session";

export default function HomePage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      if (!isMockAuthenticated()) {
        router.replace("/login");
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  return isAuthorized ? <HomeScreen /> : null;
}
