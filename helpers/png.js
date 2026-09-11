// ============================================================================
// A PNG reader and writer on Node built-ins alone.
//
// This project keeps a zero-extra-test-dependency rule, and nothing in it could
// read a pixel. That mattered the moment an Android adaptive icon had to be
// PROVEN inside its 66/108 safe zone rather than eyeballed: a test that checks a
// file exists and is 432x432 is satisfied by a foreground whose flag tip the
// launcher's circle mask cuts off.
//
// Reads 8-bit, non-interlaced greyscale / RGB / RGBA / grey+alpha - which is
// every PNG in this repo and every one tools/android-icons.js writes. Anything
// else throws rather than returning wrong pixels. Writes 8-bit RGBA, filter 0.
// ============================================================================

const zlib = require('zlib');
const fs = require('fs');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function paeth(a, b, c) {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}

// -> { width, height, data } with data as RGBA, 4 bytes per pixel, row-major.
function decodePng(buf) {
    if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
    let pos = 8, width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos); const type = buf.toString('latin1', pos + 4, pos + 8);
        const body = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = body.readUInt32BE(0); height = body.readUInt32BE(4);
            depth = body[8]; colour = body[9]; interlace = body[12];
        } else if (type === 'IDAT') idat.push(body);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8) throw new Error('unsupported bit depth ' + depth);
    if (interlace !== 0) throw new Error('interlaced PNG not supported');
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
    if (!channels) throw new Error('unsupported colour type ' + colour);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 4);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
            if (f === 1) line[i] = (line[i] + a) & 255;
            else if (f === 2) line[i] = (line[i] + b) & 255;
            else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
            else if (f === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
            else if (f !== 0) throw new Error('bad filter ' + f + ' on row ' + y);
        }
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4, s = x * channels;
            if (channels === 1) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
            else if (channels === 2) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
            else if (channels === 3) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255; }
            else { line.copy(out, o, s, s + 4); }
        }
        prev = line;
    }
    return { width, height, data: out };
}

function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
    const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb), 0);
    return Buffer.concat([len, tb, crc]);
}

// RGBA in, PNG bytes out.
function encodePng(width, height, rgba) {
    if (rgba.length !== width * height * 4) throw new Error('rgba length does not match ' + width + 'x' + height);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const readPng = p => decodePng(fs.readFileSync(p));
const writePng = (p, width, height, rgba) => fs.writeFileSync(p, encodePng(width, height, rgba));

// Only the header - cheap, for size assertions across many files.
function pngSize(p) {
    const fd = fs.openSync(p, 'r'); const head = Buffer.alloc(24);
    fs.readSync(fd, head, 0, 24, 0); fs.closeSync(fd);
    if (!head.subarray(0, 8).equals(SIG)) throw new Error(p + ' is not a PNG');
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

// THE CANVAS COLOUR of an opaque icon: the most common colour along its four
// edges. Not pixel (0,0) - the very corner of icon-1024.png is one level off the
// rest of its cream, and a tool and a test that sampled different pixels
// disagreed about the same file.
function canvasColour(img) {
    const counts = new Map();
    const bump = (x, y) => {
        const o = (y * img.width + x) * 4;
        const k = img.data[o] + ',' + img.data[o + 1] + ',' + img.data[o + 2];
        counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (let x = 0; x < img.width; x++) { bump(x, 0); bump(x, img.height - 1); }
    for (let y = 0; y < img.height; y++) { bump(0, y); bump(img.width - 1, y); }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    return { rgb: best, hex: '#' + best.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() };
}

module.exports = { decodePng, encodePng, readPng, writePng, pngSize, crc32, canvasColour };
