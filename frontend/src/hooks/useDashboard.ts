import type { DashboardPayload, RateBasis } from '../api/types';
import { useApi } from './useApi';

/** Dashboard payload for the selected historical-growth `basis`. */
export const useDashboard = (basis: RateBasis) => useApi<DashboardPayload>(`/dashboard?rate_basis=${basis}`);
