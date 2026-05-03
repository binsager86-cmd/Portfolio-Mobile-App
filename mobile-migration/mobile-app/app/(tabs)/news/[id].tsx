import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Route compatibility for notification deep links to /(tabs)/news/:id.
 * The current app keeps news details inside the feed screen, so this
 * route forwards users to the main news tab.
 */
export default function NewsDetailRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/(tabs)/news",
      params: params.id ? { newsId: String(params.id) } : undefined,
    } as never);
  }, [params.id, router]);

  return null;
}
