import {
  getPushSupportState,
  isIosDevice,
  isStandaloneMode,
  subscribeToPush,
  unsubscribeFromPush,
} from './push.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function updateNetworkBadge(badge: HTMLElement): void {
  const online = navigator.onLine;
  badge.textContent = online ? 'Online' : 'Offline';
  badge.dataset.state = online ? 'online' : 'offline';
}

function showSubscription(output: HTMLElement, sub: PushSubscription | null): void {
  if (!sub) {
    output.hidden = true;
    output.textContent = '';
    return;
  }
  output.hidden = false;
  output.textContent = JSON.stringify(sub.toJSON(), null, 2);
}

async function init(): Promise<void> {
  const networkBadge = document.getElementById('network-status');
  const swStatus = document.getElementById('sw-status');
  const pushStatus = document.getElementById('push-status');
  const iosBanner = document.getElementById('ios-install-banner');
  const appInstallBanner = document.getElementById('app-install-banner');
  const appInstallBtn = document.getElementById('app-install-btn') as HTMLButtonElement | null;
  const swUpdateBanner = document.getElementById('sw-update-banner');
  const swReloadBtn = document.getElementById('sw-reload-btn') as HTMLButtonElement | null;
  const vapidInput = document.getElementById('vapid-key') as HTMLInputElement | null;
  const subscribeBtn = document.getElementById('push-subscribe-btn') as HTMLButtonElement | null;
  const unsubscribeBtn = document.getElementById('push-unsubscribe-btn') as HTMLButtonElement | null;
  const testNotifBtn = document.getElementById('test-notification-btn') as HTMLButtonElement | null;
  const subOutput = document.getElementById('push-subscription-output');

  if (networkBadge) {
    updateNetworkBadge(networkBadge);
    window.addEventListener('online', () => updateNetworkBadge(networkBadge));
    window.addEventListener('offline', () => updateNetworkBadge(networkBadge));
  }

  if (iosBanner && isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !isStandaloneMode()) {
    iosBanner.hidden = false;
  }

  let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    if (appInstallBanner) appInstallBanner.hidden = false;
  });

  appInstallBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (appInstallBanner) appInstallBanner.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (appInstallBanner) appInstallBanner.hidden = true;
  });

  if (!('serviceWorker' in navigator)) {
    if (swStatus) swStatus.textContent = 'Service Workers are not supported in this browser.';
    if (pushStatus) pushStatus.textContent = 'Push notifications require Service Worker support.';
    return;
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    const showUpdatePrompt = (waitingWorker: ServiceWorker | null) => {
      if (!waitingWorker || !swUpdateBanner || !swReloadBtn) return;
      swUpdateBanner.hidden = false;
      swReloadBtn.addEventListener(
        'click',
        () => {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        },
        { once: true },
      );
    };

    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdatePrompt(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdatePrompt(registration.waiting ?? installing);
        }
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    await navigator.serviceWorker.ready;
    if (swStatus) {
      swStatus.textContent = 'Active — app shell is cached for offline use.';
    }
  } catch (err) {
    if (swStatus) {
      swStatus.textContent = `Registration failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    return;
  }

  const support = getPushSupportState();
  if (support === 'ios-needs-install') {
    if (pushStatus) {
      pushStatus.textContent = 'Install this app to your iOS Home Screen to enable Web Push.';
    }
    if (subscribeBtn) subscribeBtn.disabled = true;
    if (testNotifBtn) testNotifBtn.disabled = true;
    return;
  }

  if (support === 'unsupported') {
    if (pushStatus) pushStatus.textContent = 'Push notifications are not supported in this browser.';
    if (subscribeBtn) subscribeBtn.disabled = true;
    if (testNotifBtn) testNotifBtn.disabled = true;
    return;
  }

  const syncSubscriptionUi = async () => {
    const existing = await registration.pushManager.getSubscription();
    if (pushStatus) {
      pushStatus.textContent = existing
        ? 'Subscribed to Web Push.'
        : `Ready (permission: ${Notification.permission}).`;
    }
    if (subscribeBtn) subscribeBtn.hidden = Boolean(existing);
    if (unsubscribeBtn) unsubscribeBtn.hidden = !existing;
    if (subOutput) showSubscription(subOutput, existing);
  };

  await syncSubscriptionUi();

  subscribeBtn?.addEventListener('click', async () => {
    const vapidKey = vapidInput?.value.trim() ?? '';
    if (!vapidKey) {
      if (pushStatus) pushStatus.textContent = 'Enter a VAPID public key first.';
      return;
    }
    try {
      await subscribeToPush(registration, vapidKey);
      await syncSubscriptionUi();
    } catch (err) {
      if (pushStatus) {
        pushStatus.textContent = `Subscribe failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  });

  unsubscribeBtn?.addEventListener('click', async () => {
    await unsubscribeFromPush(registration);
    await syncSubscriptionUi();
  });

  testNotifBtn?.addEventListener('click', async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (pushStatus) pushStatus.textContent = `Notification permission was ${permission}.`;
      return;
    }
    await registration.showNotification('PWA Template', {
      body: 'Local notification test succeeded.',
      icon: '/icons/icon-192.png',
      data: { url: '/' },
    });
  });
}

void init();
