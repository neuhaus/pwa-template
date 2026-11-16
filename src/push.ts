export type PushSupportState = 'supported' | 'ios-needs-install' | 'unsupported';

/**
 * Convert a Base64URL-encoded VAPID public key into a Uint8Array
 * suitable for `PushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const trimmed = base64String.trim();
  if (!trimmed) {
    throw new Error('VAPID public key must not be empty.');
  }
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * Detect iOS / iPadOS devices (including iPadOS Safari reporting as MacIntel).
 */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return true;
  }
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Detect whether the PWA is currently running in installed standalone mode.
 */
export function isStandaloneMode(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return true;
  }
  return typeof win.matchMedia === 'function'
    ? win.matchMedia('(display-mode: standalone)').matches
    : false;
}

/**
 * Determine Web Push support, accounting for Mobile Safari's Home Screen requirement.
 */
export function getPushSupportState(win: Window = window): PushSupportState {
  const hasSw = 'serviceWorker' in win.navigator;
  const hasPush = 'PushManager' in win && 'Notification' in win;
  if (hasSw && hasPush) {
    return 'supported';
  }
  if (isIosDevice(win.navigator.userAgent, win.navigator.maxTouchPoints) && !isStandaloneMode(win)) {
    return 'ios-needs-install';
  }
  return 'unsupported';
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission was ${permission}.`);
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }
  return subscription.unsubscribe();
}
