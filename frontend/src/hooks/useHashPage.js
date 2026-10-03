import { useEffect, useState } from 'react';

const read = (pages) => {
  const hash = window.location.hash.slice(1);
  return pages.some(page => page.value === hash) ? hash : pages[0].value;
};

/** Current page kept in the URL hash, so reloads and back/forward keep it. */
export function useHashPage(pages) {
  const [page, setPage] = useState(() => read(pages));

  useEffect(() => {
    const onChange = () => setPage(read(pages));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [pages]);

  return [page, (value) => { window.location.hash = value; }];
}
