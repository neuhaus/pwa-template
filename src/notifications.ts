export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
}

export type NotificationPrivacyMode = 'full' | 'sender' | 'generic';

export const PREF_CACHE_NAME = 'pwa-template-prefs';
export const PRIVACY_PREF_KEY = '/__notification-privacy-mode';
export const LAST_LAUNCH_KEY = '/__last-notification-launch';

export function formatNotificationForPrivacy(
  payload: PushPayload,
  mode: NotificationPrivacyMode,
): { title: string; body: string } {
  if (mode === 'generic') {
    return { title: 'PWA Template', body: 'You have a new notification.' };
  }
  if (mode === 'sender') {
    return { title: payload.title, body: 'New message (preview hidden).' };
  }
  return { title: payload.title, body: payload.body };
}

export function buildNotificationLaunchUrl(
  targetUrl: string,
  origin: string,
  meta?: { title?: string; body?: string },
): string {
  const url = new URL(targetUrl, origin);
  const hashParams = new URLSearchParams();
  hashParams.set('from', 'notification');
  if (meta?.title) hashParams.set('ntitle', meta.title);
  if (meta?.body) hashParams.set('nbody', meta.body);
  return `${url.pathname}${url.search}#${hashParams.toString()}`;
}

export function parsePushPayload(
  rawText: string | null | undefined,
  basePath = '/',
): PushPayload {
  const defaults: PushPayload = {
    title: 'PWA Template',
    body: 'You have a new notification.',
    url: basePath,
    icon: `${basePath}icons/icon-192.png`,
  };

  if (!rawText) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(rawText) as Partial<PushPayload>;
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : defaults.title,
      body: typeof parsed.body === 'string' ? parsed.body : defaults.body,
      url: typeof parsed.url === 'string' && parsed.url ? parsed.url : defaults.url,
      icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : defaults.icon,
    };
  } catch {
    return { ...defaults, body: rawText };
  }
}
