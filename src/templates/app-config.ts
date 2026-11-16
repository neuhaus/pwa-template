export interface AppTemplateConfig {
  appName: string;
  shortName: string;
  description: string;
  themeColor: string;
  themeColorLight: string;
  statusBarStyle: 'default' | 'black' | 'black-translucent';
  isProd?: boolean;
}

export const appConfig: AppTemplateConfig = {
  appName: 'PWA Template',
  shortName: 'PWA',
  description: 'Minimal offline-first TypeScript PWA with Web Push and Mobile Safari support.',
  themeColor: '#0f172a',
  themeColorLight: '#f8fafc',
  statusBarStyle: 'black-translucent',
};
