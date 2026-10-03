import { useApi } from './useApi';

/** Dashboard payload for the selected historical-growth `basis`. */
export const useDashboard = (basis) => useApi(`/dashboard?rate_basis=${basis}`);
