import { useEffect, useState, useCallback } from 'react';

export type Router = ReturnType<typeof useRouter>;
type RouteState = { path: string; query: URLSearchParams };

function parse(): RouteState {
  const url = new URL(window.location.href);
  return { path: url.pathname, query: url.searchParams };
}

export function useRouter() {
  const [state, setState] = useState<RouteState>(parse);

  useEffect(() => {
    const onPop = () => setState(parse());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setState(parse());
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  return { path: state.path, query: state.query, navigate };
}

export function matchRoute(path: string, pattern: string): Record<string, string> | null {
  const pParts = pattern.split('/').filter(Boolean);
  const aParts = path.split('/').filter(Boolean);
  if (pParts.length !== aParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith('[') && pParts[i].endsWith(']')) {
      const key = pParts[i].slice(1, -1);
      params[key] = decodeURIComponent(aParts[i]);
    } else if (pParts[i] !== aParts[i]) {
      return null;
    }
  }
  return params;
}
