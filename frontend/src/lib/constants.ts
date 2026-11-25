import type { RateBasis } from '../api/types';

// Category names as they appear in the YAML records and API payload.
export const CATEGORY = {
  realEstate: 'Immobles',
  stocks: 'Accions',
  cash: 'Efectiu i bons CT',
  liability: 'Liability',
} as const;

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const RATE_BASIS_OPTIONS: readonly Option<RateBasis>[] = [
  { value: 'last_year', label: 'Last 12 months average' },
  { value: 'overall', label: 'All-time average' },
];
