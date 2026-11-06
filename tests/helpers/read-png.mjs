import { inflateSync } from 'node:zlib';

// Browser screenshots use non-interlaced 8-bit RGB or RGBA PNGs
export function readPNG(bytes) {
  const input = Buffer.from(bytes);
  if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG signature');
  let width, height, channels;
  const compressed = [];
  let ended = false;
  for (let offset = 8; offset + 12 <= input.length;) {
    const length = input.readUInt32BE(offset);
    if (offset + length + 12 > input.length) throw new Error('Truncated PNG chunk');
    const name = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (name === 'IHDR') {
      if (length !== 13 || data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] || data[11] || data[12]) throw new Error('Unsupported screenshot PNG format');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 6 ? 4 : 3;
    } else if (name === 'IDAT') compressed.push(data);
    else if (name === 'IEND') { ended = true; break; }
    offset += length + 12;
  }
  if (!ended || !width || !height || !channels || !compressed.length) throw new Error('Incomplete PNG');
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw new Error('Unexpected PNG pixel length');
  const decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Unsupported PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= channels ? decoded[i - channels] : 0;
      const above = y ? decoded[i - stride] : 0;
      const corner = y && x >= channels ? decoded[i - stride - channels] : 0;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, corner)][filter];
      decoded[i] = raw[y * (stride + 1) + 1 + x] + predictor;
    }
  }
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) decoded.copy(data, i * 4, i * channels, (i + 1) * channels);
  return { width, height, data };
}
