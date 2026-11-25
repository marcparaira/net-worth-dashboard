import { useEffect, useState } from 'react';
import type { Option } from '../lib/constants';

const read = <T extends string>(pages: readonly Option<T>[]): T => {
  const hash = window.location.hash.slice(1);
  return pages.find((page) => page.value === hash)?.value ?? pages[0].value;
};

/** Current page kept in the URL hash, so reloads and back/forward keep it. */
export function useHashPage<T extends string>(pages: readonly Option<T>[]): [T, (value: T) => void] {
  const [page, setPage] = useState(() => read(pages));

  useEffect(() => {
    const onChange = () => setPage(read(pages));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [pages]);

  return [
    page,
    (value) => {
      window.location.hash = value;
    },
  ];
}
