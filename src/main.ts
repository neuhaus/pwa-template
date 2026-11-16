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
  const serverPushBtn = document.getElementById('server-push-btn') as HTMLButtonElement | null;
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

  // Fetch VAPID public key immediately so it doesn't wait on Service Worker activation.
  let hasBackend = false;
  const vapidPromise = (async () => {
    if (!vapidInput || vapidInput.value.trim()) return;
    try {
      const res = await fetch('/api/vapid-public-key');
      if (res.ok) {
        const data = (await res.json()) as { publicKey?: string };
        if (data.publicKey) {
          vapidInput.value = data.publicKey;
          hasBackend = true;
        }
      }
    } catch {
      // Backend is optional; fall back to manual VAPID key entry.
    }
  })();

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

    if (registration.active) {
      if (swStatus) swStatus.textContent = 'Active — app shell is cached for offline use.';
    } else {
      void navigator.serviceWorker.ready.then(() => {
        if (swStatus) swStatus.textContent = 'Active — app shell is cached for offline use.';
      });
    }
  } catch (err) {
    if (swStatus) {
      swStatus.textContent = `Registration failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    return;
  }

  await vapidPromise;

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

  const syncSubscriptionUi = async (statusOverride?: string) => {
    const existing = await registration.pushManager.getSubscription();
    if (pushStatus) {
      pushStatus.textContent =
        statusOverride ??
        (existing
          ? 'Subscribed to Web Push.'
          : `Ready (permission: ${Notification.permission}).`);
    }
    if (subscribeBtn) subscribeBtn.hidden = Boolean(existing);
    if (unsubscribeBtn) unsubscribeBtn.hidden = !existing;
    if (serverPushBtn) serverPushBtn.hidden = !(existing && hasBackend);
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
      const sub = await subscribeToPush(registration, vapidKey);
      let registeredOnServer = false;
      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
        registeredOnServer = res.ok;
        if (res.ok) hasBackend = true;
      } catch {
        // Static-only mode without backend
      }
      await syncSubscriptionUi(
        registeredOnServer
          ? 'Subscribed and registered with push server.'
          : 'Subscribed in browser (no push server reachable).',
      );
    } catch (err) {
      if (pushStatus) {
        pushStatus.textContent = `Subscribe failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  });

  unsubscribeBtn?.addEventListener('click', async () => {
    const existing = await registration.pushManager.getSubscription();
    await unsubscribeFromPush(registration);
    if (existing) {
      try {
        await fetch('/api/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
      } catch {
        // Ignore if backend is offline
      }
    }
    await syncSubscriptionUi();
  });

  serverPushBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'PWA Template',
          body: 'Server push test succeeded!',
          url: '/',
        }),
      });
      if (pushStatus) {
        pushStatus.textContent = res.ok
          ? 'Server push sent.'
          : `Server push failed (${res.status}).`;
      }
    } catch (err) {
      if (pushStatus) {
        pushStatus.textContent = `Server push failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
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
