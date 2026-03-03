import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const iconsDir = path.join(projectRoot, "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(size, pixelFn) {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel;
  const raw = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const i = rowOffset + 1 + x * bytesPerPixel;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

function iconPixel(x, y, size) {
  const nx = x / (size - 1);
  const ny = y / (size - 1);

  let r = Math.round(18 + 18 * (1 - ny));
  let g = Math.round(115 + 45 * (1 - ny));
  let b = Math.round(75 + 22 * (1 - ny));

  const margin = Math.max(1, Math.floor(size * 0.08));
  if (x < margin || y < margin || x >= size - margin || y >= size - margin) {
    r = Math.min(255, r + 22);
    g = Math.min(255, g + 22);
    b = Math.min(255, b + 22);
  }

  const cx = size * 0.5;
  const cy = size * 0.48;
  const radius = size * 0.3;
  const dx = x - cx;
  const dy = y - cy;
  const distSq = dx * dx + dy * dy;

  const head = distSq < (size * 0.115) ** 2 && y < size * 0.42;
  const neck = x > size * 0.39 && x < size * 0.62 && y >= size * 0.33 && y < size * 0.57;
  const body = x > size * 0.28 && x < size * 0.72 && y >= size * 0.57 && y < size * 0.78;
  const foot = x > size * 0.23 && x < size * 0.77 && y >= size * 0.78 && y < size * 0.86;
  const cut = x > size * 0.57 && y > size * 0.5 && y < size * 0.78;

  if ((head || neck || body || foot) && !cut && distSq < radius * radius) {
    return [250, 252, 251, 255];
  }

  return [r, g, b, 255];
}

for (const size of [16, 32, 48, 128]) {
  const png = createPng(size, iconPixel);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
}

console.log("Generated icons in icons/.");
