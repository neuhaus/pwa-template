import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encryptPushPayload,
  generateVapidKeys,
  isValidVapidPublicKey,
  signVapidJwt,
} from './webpush.ts';
import { createECDH } from 'node:crypto';

describe('server/webpush', () => {
  it('generates valid ECDSA P-256 VAPID keys', () => {
    const keys = generateVapidKeys();
    assert.equal(isValidVapidPublicKey(keys.publicKey), true);
    assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
    assert.equal(Buffer.from(keys.privateKey, 'base64url').length, 32);
  });

  it('signs a 3-part ES256 VAPID JWT with aud, exp, sub', () => {
    const keys = generateVapidKeys();
    const jwt = signVapidJwt(
      'https://web.push.apple.com/QSomeEndpoint',
      'mailto:push@example.com',
      keys,
    );
    const parts = jwt.split('.');
    assert.equal(parts.length, 3);

    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      aud: string;
      sub: string;
      exp: number;
    };
    assert.equal(claims.aud, 'https://web.push.apple.com');
    assert.equal(claims.sub, 'mailto:push@example.com');
    assert.ok(claims.exp > Math.floor(Date.now() / 1000));
    assert.equal(Buffer.from(parts[2]!, 'base64url').length, 64);
  });

  it('encrypts push payload with aes128gcm RFC 8291 header', () => {
    const client = createECDH('prime256v1');
    client.generateKeys();
    const clientPub = client.getPublicKey().toString('base64url');
    const auth = Buffer.alloc(16, 7).toString('base64url');

    const encrypted = encryptPushPayload('{"title":"Hi"}', clientPub, auth);
    // 16-byte salt + 4-byte rs + 1-byte idlen (65) + 65-byte server pubkey = 86-byte header
    assert.equal(encrypted[20], 65);
    assert.ok(encrypted.length > 86 + 16);
  });
});
