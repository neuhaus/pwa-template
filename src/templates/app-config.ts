export interface AppTemplateConfig {
  appName: string;
  shortName: string;
  description: string;
  themeColor: string;
  themeColorLight: string;
  statusBarStyle: 'default' | 'black' | 'black-translucent';
  basePath: string;
  isProd?: boolean;
}

export function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export const appConfig: AppTemplateConfig = {
  appName: 'PWA Template',
  shortName: 'PWA',
  description: 'Minimal offline-first TypeScript PWA with Web Push and Mobile Safari support.',
  themeColor: '#0f172a',
  themeColorLight: '#f8fafc',
  statusBarStyle: 'default',
  basePath: normalizeBasePath(
    (typeof process !== 'undefined' ? process.env.BASE_PATH : undefined) ?? '/',
  ),
};
