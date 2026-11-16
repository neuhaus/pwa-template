import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Generate a solid-background PNG icon with a centered geometric badge. */
function createPng(size: number): Buffer {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = size * 0.3;
  const ringInner = size * 0.18;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type None
    const t = y / size;
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const isBadge = dist <= ringOuter && dist >= ringInner;

      // Smooth indigo-to-slate gradient background; crisp white ring in center.
      raw[idx] = isBadge ? 255 : Math.round(15 + t * 22);
      raw[idx + 1] = isBadge ? 255 : Math.round(23 + t * 40);
      raw[idx + 2] = isBadge ? 255 : Math.round(42 + t * 140);
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = resolve(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const targets: Array<[string, number]> = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

for (const [name, size] of targets) {
  const filePath = resolve(outDir, name);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, createPng(size));
  console.log(`Generated ${name} (${size}x${size})`);
}
