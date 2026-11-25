import { useEffect, useState } from 'react';

/** The URL hash as path segments: "#snapshots/new" gives ["snapshots", "new"]. */
const read = (): string[] => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

/** Current route, kept in the URL hash so reloads and back/forward keep it. */
export function useHashRoute(): string[] {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
