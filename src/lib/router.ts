import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';

export type Router = ReturnType<typeof useRouter>;
type RouteState = {
  path: string;
  query: URLSearchParams;
  restoreScrollY?: number;
  navigationType?: 'push' | 'pop';
  fromPath?: string;
};

function parse(): RouteState {
  const url = new URL(window.location.href);
  return { path: url.pathname, query: url.searchParams };
}

export function scrollToInstantly(top: number, left = 0) {
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top, left, behavior: 'auto' });
  root.style.scrollBehavior = previousBehavior;
}

export function useRestoreScrollPosition(router: Router, ready = true) {
  useLayoutEffect(() => {
    const scrollY = router.restoreScrollY;
    if (!ready || scrollY === undefined) return undefined;
    scrollToInstantly(scrollY);
  }, [ready, router.restoreScrollY]);
}

export function useHistoryEntryState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const savedValue = window.history.state?.appPageState?.[key];
    return savedValue === undefined ? initialValue : savedValue as T;
  });

  useEffect(() => {
    const currentState = window.history.state ?? {};
    window.history.replaceState({
      ...currentState,
      appPageState: { ...currentState.appPageState, [key]: value },
    }, '');
  }, [key, value]);

  return [value, setValue];
}

export function useRouter() {
  const [state, setState] = useState<RouteState>(parse);
  const currentPathRef = useRef(state.path);

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const onPop = () => {
      const scrollY = window.history.state?.appScrollY;
      const fromPath = currentPathRef.current;
      const nextState = parse();
      currentPathRef.current = nextState.path;
      setState({
        ...nextState,
        navigationType: 'pop',
        fromPath,
        ...(typeof scrollY === 'number' ? { restoreScrollY: scrollY } : {}),
      });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.replaceState({ ...window.history.state, appScrollY: window.scrollY }, '');
    window.history.pushState({ appPreviousPath: state.path, appScrollY: 0 }, '', to);
    const nextState = parse();
    currentPathRef.current = nextState.path;
    setState({ ...nextState, navigationType: 'push', fromPath: state.path });
    scrollToInstantly(0);
  }, [state.path]);

  return {
    path: state.path,
    query: state.query,
    restoreScrollY: state.restoreScrollY,
    navigationType: state.navigationType,
    fromPath: state.fromPath,
    navigate,
  };
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
