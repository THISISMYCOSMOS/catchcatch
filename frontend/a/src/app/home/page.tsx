"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeScreen } from "@/components/home/home-screen";
import { getMockAuthenticatedRoute } from "@/lib/mock/session";

export default function HomePage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  return isAuthorized ? <HomeScreen /> : null;
}
