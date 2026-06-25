const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function generatePixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const r = size / 2 - (size / 32 * 1.5);
      if (dist < r) {
        pixels[i] = 88;
        pixels[i+1] = 101;
        pixels[i+2] = 242;
        pixels[i+3] = 255;
      } else if (dist < r + (size / 32 * 0.5)) {
        pixels[i] = 88;
        pixels[i+1] = 101;
        pixels[i+2] = 242;
        pixels[i+3] = Math.max(0, Math.round(255 * (r + (size / 32 * 0.5) - dist) * 2));
      }
    }
  }
  return pixels;
}

function createPNG(width, height, pixelData) {
  const rawData = Buffer.alloc(pixelData.length);
  for (let y = 0; y < height; y++) {
    const srcOffset = y * width * 4;
    const dstOffset = (height - 1 - y) * (width * 4 + 1) + 1;
    rawData[dstOffset - 1] = 0;
    for (let x = 0; x < width; x++) {
      const si = srcOffset + x * 4;
      const di = dstOffset + x * 4;
      rawData[di] = pixelData[si + 2];
      rawData[di + 1] = pixelData[si + 1];
      rawData[di + 2] = pixelData[si];
      rawData[di + 3] = pixelData[si + 3];
    }
  }
  const deflated = zlib.deflateSync(rawData);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crc = crc32(crcData);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeB, data, crcB]);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) >>> 0 : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createICO(pngDataBySize) {
  const sizes = Object.keys(pngDataBySize).map(Number).sort((a, b) => b - a);
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);

  let dirOffset = 6 + count * 16;
  const parts = [header];
  const images = [];
  for (const s of sizes) {
    const png = pngDataBySize[s];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s >= 256 ? 0 : s, 0);
    entry.writeUInt8(s >= 256 ? 0 : s, 1);
    entry.writeUInt8(0, 2); entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dirOffset, 12);
    parts.push(entry);
    images.push(png);
    dirOffset += png.length;
  }
  return Buffer.concat([...parts, ...images]);
}

const sizes = [256, 128, 64, 48, 32, 16];
const pngBySize = {};
for (const s of sizes) {
  pngBySize[s] = createPNG(s, s, generatePixels(s));
}
const ico = createICO(pngBySize);
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
console.log('Generated icon.ico with sizes:', sizes.join(', '));
