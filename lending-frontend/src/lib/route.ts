import * as React from "react";
import type { DeskTab } from "./chain";

/**
 * Tiny History-API router.
 *
 * The app is small enough that a routing library would be more weight than it is
 * worth, but the address bar still has to mean something: a reload should land on
 * the same screen, the back button should work, and a page should be linkable.
 */

const TAB_TO_PATH: Record<DeskTab, string> = {
  dashboard: "/",
  borrow: "/borrow",
  lending: "/lend",
  swap: "/swap",
  farms: "/farms",
  stake: "/stake",
  education: "/learn",
  documentation: "/docs",
  suits: "/suits",
};

const PATH_TO_TAB = Object.entries(TAB_TO_PATH).reduce<Record<string, DeskTab>>((acc, [tab, path]) => {
  acc[path] = tab as DeskTab;
  return acc;
}, {});

export type Route = {
  tab: DeskTab;
  /** Selected pair on the farms page, e.g. "/farms/NVDA". */
  farm?: string;
};

export function routeToPath(route: Route): string {
  if (route.tab === "farms" && route.farm) return `/farms/${route.farm.toUpperCase()}`;
  return TAB_TO_PATH[route.tab] ?? "/";
}

export function parsePath(pathname: string): Route {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const farmMatch = clean.match(/^\/farms\/([A-Za-z0-9]+)$/);
  if (farmMatch) return { tab: "farms", farm: farmMatch[1].toUpperCase() };
  return { tab: PATH_TO_TAB[clean] ?? "dashboard" };
}

export function useRoute(): [Route, (next: Route, replace?: boolean) => void] {
  const [route, setRoute] = React.useState<Route>(() => parsePath(window.location.pathname));

  React.useEffect(() => {
    // Back/forward must move the app, not just the address bar.
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = React.useCallback((next: Route, replace = false) => {
    const path = routeToPath(next);
    if (path !== window.location.pathname) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    }
    setRoute(next);
    // A new screen should start at the top, the way a real page load would.
    window.scrollTo({ top: 0 });
  }, []);

  return [route, navigate];
}
