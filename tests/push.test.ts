import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPushSupportState,
  isIosDevice,
  isStandaloneMode,
  urlBase64ToUint8Array,
} from '../src/push.ts';

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url strings without padding into Uint8Array', () => {
    // "Hello!" in base64url is "SGVsbG8h" (no padding), "Hi" is "SGk"
    const bytes = urlBase64ToUint8Array('SGk');
    assert.deepEqual([...bytes], [72, 105]);
  });

  it('handles URL-safe - and _ characters', () => {
    // 0xfb, 0xff, 0xbf -> standard base64 "+/+/" -> base64url "-_-_"
    const bytes = urlBase64ToUint8Array('-_-_');
    assert.deepEqual([...bytes], [0xfb, 0xff, 0xbf]);
  });

  it('throws on empty input', () => {
    assert.throws(() => urlBase64ToUint8Array('   '), /must not be empty/);
  });
});

describe('isIosDevice', () => {
  it('detects iPhone and iPad user agents', () => {
    assert.equal(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true);
    assert.equal(isIosDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5), true);
  });

  it('detects iPadOS Safari reporting as Macintosh with touch points', () => {
    assert.equal(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), true);
  });

  it('returns false for desktop macOS and Android', () => {
    assert.equal(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false);
    assert.equal(isIosDevice('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5), false);
  });
});

describe('isStandaloneMode', () => {
  it('returns true when navigator.standalone is true', () => {
    const fakeWin = {
      navigator: { standalone: true },
    } as unknown as Window;
    assert.equal(isStandaloneMode(fakeWin), true);
  });

  it('returns true when display-mode: standalone matches', () => {
    const fakeWin = {
      navigator: {},
      matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' }),
    } as unknown as Window;
    assert.equal(isStandaloneMode(fakeWin), true);
  });

  it('returns false in regular browser tab', () => {
    const fakeWin = {
      navigator: {},
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    assert.equal(isStandaloneMode(fakeWin), false);
  });
});

describe('getPushSupportState', () => {
  it('returns ios-needs-install on Mobile Safari outside standalone mode', () => {
    const fakeWin = {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        maxTouchPoints: 5,
        serviceWorker: {},
      },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    assert.equal(getPushSupportState(fakeWin), 'ios-needs-install');
  });

  it('returns supported when ServiceWorker, PushManager, and Notification exist', () => {
    const fakeWin = {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        maxTouchPoints: 5,
        serviceWorker: {},
      },
      PushManager: function PushManager() {},
      Notification: function Notification() {},
    } as unknown as Window;
    assert.equal(getPushSupportState(fakeWin), 'supported');
  });

  it('returns unsupported when push APIs are missing on non-iOS', () => {
    const fakeWin = {
      navigator: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        maxTouchPoints: 0,
      },
    } as unknown as Window;
    assert.equal(getPushSupportState(fakeWin), 'unsupported');
  });
});
