import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../api/client';

export interface ApiState<T> {
  /** Latest data received; kept while a new `path` loads, so the page does not flash empty. */
  data: T | null;
  loading: boolean;
  error: string;
  /** HTTP status of the error, if the server answered (404 means "nothing yet"). */
  status: number | null;
  /** Fetches again, for example after a change. */
  reload: () => void;
}

interface Result<T> {
  key: string;
  data: T | null;
  error: string;
  status: number | null;
}

/** Fetches `path` from the API, refetching (and cancelling the previous request) when it changes. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${path}#${version}`;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    apiRequest<T>('GET', path, undefined, controller.signal)
      .then((data) => setResult({ key, data, error: '', status: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          data: null,
          error: err instanceof Error ? err.message : String(err),
          status: err instanceof ApiError ? err.status : null,
        });
      });
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = result?.key === key;
  return {
    data: result?.data ?? null,
    loading: path !== null && !current,
    error: current ? result.error : '',
    status: current ? result.status : null,
    reload,
  };
}
