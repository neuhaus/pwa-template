import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Generate a Base64URL-encoded ECDSA P-256 VAPID key pair. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string };
  const rawPublic = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  void publicKey;
  return {
    publicKey: rawPublic.toString('base64url'),
    privateKey: jwk.d,
  };
}

/** Create a signed VAPID JWT (RFC 8292) for the given push endpoint. */
export function signVapidJwt(
  endpoint: string,
  subject: string,
  keys: VapidKeys,
  ttlSeconds = 12 * 3600,
): string {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ aud, exp, sub: subject })).toString('base64url');
  const unsigned = `${header}.${payload}`;

  const pubBytes = Buffer.from(keys.publicKey, 'base64url');
  const privateKey = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: pubBytes.subarray(1, 33).toString('base64url'),
      y: pubBytes.subarray(33, 65).toString('base64url'),
      d: keys.privateKey,
    },
    format: 'jwk',
  });

  const signer = createSign('SHA256');
  signer.update(unsigned);
  const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${sig.toString('base64url')}`;
}

/** Encrypt a UTF-8 push payload using aes128gcm (RFC 8291). */
export function encryptPushPayload(
  payload: string,
  clientPublicKeyB64: string,
  authSecretB64: string,
): Buffer {
  const clientPublic = Buffer.from(clientPublicKeyB64, 'base64url');
  const authSecret = Buffer.from(authSecretB64, 'base64url');
  const salt = randomBytes(16);

  const serverEcdh = createECDH('prime256v1');
  serverEcdh.generateKeys();
  const serverPublic = serverEcdh.getPublicKey();
  const sharedSecret = serverEcdh.computeSecret(clientPublic);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    clientPublic,
    serverPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12),
  );

  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic]);
  return Buffer.concat([header, encrypted]);
}

/** Verify a VAPID public key is valid uncompressed P-256. */
export function isValidVapidPublicKey(publicKeyB64: string): boolean {
  try {
    const raw = Buffer.from(publicKeyB64, 'base64url');
    if (raw.length !== 65 || raw[0] !== 0x04) return false;
    createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: raw.subarray(1, 33).toString('base64url'),
        y: raw.subarray(33, 65).toString('base64url'),
      },
      format: 'jwk',
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: Record<string, unknown>,
  keys: VapidKeys,
  subject: string,
): Promise<Response> {
  const body = encryptPushPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth,
  );
  const jwt = signVapidJwt(subscription.endpoint, subject, keys);

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body: new Uint8Array(body),
  });
}
