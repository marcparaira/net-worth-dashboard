import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '/api';

/** Fetches `${API}${path}`, refetching (and cancelling the previous request) when `path` changes. */
export function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`${API}${path}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Could not load ${path}`);
        return response.json();
      })
      .then(setData)
      .catch(err => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path]);

  return { data, loading, error };
}
