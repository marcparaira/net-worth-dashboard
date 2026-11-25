import { useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export interface ApiState<T> {
  /** Latest data received; kept while a new `path` loads, so the page does not flash empty. */
  data: T | null;
  loading: boolean;
  error: string;
}

interface Result<T> {
  path: string;
  data: T | null;
  error: string;
}

/** Fetches `${API}${path}`, refetching (and cancelling the previous request) when `path` changes. */
export function useApi<T>(path: string): ApiState<T> {
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}${path}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${path}`);
        return response.json() as Promise<T>;
      })
      .then((data) => setResult({ path, data, error: '' }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ path, data: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [path]);

  const current = result?.path === path;
  return {
    data: result?.data ?? null,
    loading: !current,
    error: current ? result.error : '',
  };
}
