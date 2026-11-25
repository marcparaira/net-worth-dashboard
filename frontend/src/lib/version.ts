/** Release version, set at build time by the release workflow (VITE_APP_VERSION=1.2.3); "dev" otherwise. */
export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';

export const versionLabel = (version: string): string => (version === 'dev' ? 'development build' : `v${version}`);
