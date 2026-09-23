#!/usr/bin/env node
// ============================================================================
// Generates the Android launcher icon set from icon-1024.png.
//
//     node tools/android-icons.js            writes into android/app/src/main/res
//     node tools/android-icons.js --measure  prints the mark's bounding box and stops
//
// WHY A SCRIPT AND NOT ANDROID STUDIO'S WIZARD. The wizard is a one-off; the
// numbers it chose live nowhere. This is repeatable, and android_release_test.js
// decodes what it wrote and measures it.
//
// THE ONE DECISION IN HERE is still "fit the mark inside the 66/108 safe
// circle and fill that circle". On 2026-09-11 the Stroke R reached 489px from
// the canvas centre, so the scale was 0.61. The HardPan ball's farthest mark
// pixel is 318px from the mark centre (safe radius 313px at 1024), so the
// same decision is now 0.92: reach after scale is about 0.93 of the safe
// circle. The art is not redrawn. The foreground is scaled about the mark's
// own centre.
//
// THE BACKGROUND LAYER IS THE ICON'S OWN FIELD (#0B0F0C, the mode of the
// border pixels), not manifest.json's page cream #F6F4EC. The foreground is
// an opaque field around the mark, so the two layers must be the same colour
// or a square of a different colour shows around the ball.
//
// Resampling is Lanczos-3 in this file (no sips, same bytes on Linux and
// macOS). Placement, the round mask, and the PNG bytes are helpers/png.js.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { readPng, writePng, canvasColour } = require('../helpers/png.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'icon-1024.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const PLAY = path.join(ROOT, 'android', 'app', 'src', 'main', 'ic_launcher-playstore.png');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FOREGROUND_SCALE = 0.92;     // ball: fills the 66/108 safe circle without clipping
const ROUND_RADIUS_FRACTION = 0.86; // legacy round icon: the mark's reach as a fraction of the circle
const THRESHOLD = 40;

function measure(img) {
    const bg = canvasColour(img).rgb;
    let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1, count = 0;
    const isMark = (x, y) => {
        const o = (y * img.width + x) * 4;
        return Math.max(Math.abs(img.data[o] - bg[0]), Math.abs(img.data[o + 1] - bg[1]), Math.abs(img.data[o + 2] - bg[2])) > THRESHOLD;
    };
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (isMark(x, y)) {
        count++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
    let farFromCanvas = 0, farFromMark = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isMark(x, y)) {
        farFromCanvas = Math.max(farFromCanvas, Math.hypot(x + 0.5 - img.width / 2, y + 0.5 - img.height / 2));
        farFromMark = Math.max(farFromMark, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
    return { bg, x0, y0, x1, y1, cx, cy, count, farFromCanvas, farFromMark,
             safeRadius: (66 / 108) * img.width / 2, visibleRadius: (72 / 108) * img.width / 2 };
}

function lanczos3(x) {
    x = Math.abs(x);
    if (x < 1e-8) return 1;
    if (x >= 3) return 0;
    const pi = Math.PI * x;
    return (3 * Math.sin(pi) * Math.sin(pi / 3)) / (pi * pi);
}

// Square Lanczos-3 downsample of an already-decoded icon. Edge samples repeat
// the border pixel. Weights are normalised, so an opaque source stays opaque.
function resizeTo(img, size) {
    const srcW = img.width, srcH = img.height, src = img.data;
    const scale = size / srcW;
    const norm = Math.min(scale, 1);
    const support = 3 / norm;
    function axis(dstN, srcN) {
        const rows = new Array(dstN);
        for (let d = 0; d < dstN; d++) {
            const srcPos = (d + 0.5) / scale - 0.5;
            const i0 = Math.ceil(srcPos - support);
            const i1 = Math.floor(srcPos + support);
            const idx = [], w = [];
            let sum = 0;
            for (let i = i0; i <= i1; i++) {
                const wt = lanczos3((srcPos - i) * norm);
                if (wt === 0) continue;
                idx.push(Math.max(0, Math.min(srcN - 1, i)));
                w.push(wt);
                sum += wt;
            }
            for (let k = 0; k < w.length; k++) w[k] /= sum;
            rows[d] = { idx, w };
        }
        return rows;
    }
    const xw = axis(size, srcW);
    const yw = axis(size, srcH);
    const tmp = new Float64Array(size * srcH * 4);
    for (let y = 0; y < srcH; y++) {
        for (let x = 0; x < size; x++) {
            const { idx, w } = xw[x];
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = 0; k < idx.length; k++) {
                const o = (y * srcW + idx[k]) * 4, wt = w[k];
                r += src[o] * wt; g += src[o + 1] * wt; b += src[o + 2] * wt; a += src[o + 3] * wt;
            }
            const o = (y * size + x) * 4;
            tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
        }
    }
    const data = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        const { idx, w } = yw[y];
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = 0; k < idx.length; k++) {
                const o = (idx[k] * size + x) * 4, wt = w[k];
                r += tmp[o] * wt; g += tmp[o + 1] * wt; b += tmp[o + 2] * wt; a += tmp[o + 3] * wt;
            }
            const o = (y * size + x) * 4;
            data[o] = Math.max(0, Math.min(255, Math.round(r)));
            data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
            data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
            data[o + 3] = Math.max(0, Math.min(255, Math.round(a)));
        }
    }
    return { width: size, height: size, data };
}

// A size x size field with `src` drawn so that source point (cx, cy)
// lands on the canvas centre.
function place(src, size, cx, cy, bg) {
    const out = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) { out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255; }
    const ox = Math.round(size / 2 - cx), oy = Math.round(size / 2 - cy);
    for (let y = 0; y < src.height; y++) {
        const ty = y + oy; if (ty < 0 || ty >= size) continue;
        for (let x = 0; x < src.width; x++) {
            const tx = x + ox; if (tx < 0 || tx >= size) continue;
            src.data.copy(out, (ty * size + tx) * 4, (y * src.width + x) * 4, (y * src.width + x) * 4 + 4);
        }
    }
    return out;
}

function circleMask(rgba, size) {
    const R = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const r = Math.hypot(x + 0.5 - R, y + 0.5 - R);
        const a = Math.max(0, Math.min(1, R - r + 0.5));
        rgba[(y * size + x) * 4 + 3] = Math.round(a * 255);
    }
    return rgba;
}

function hex(bg) { return '#' + bg.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }

function main() {
    const src = readPng(SRC);
    const m = measure(src);
    const report = {
        canvas: src.width + 'x' + src.height, background: hex(m.bg),
        bbox: { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 },
        bbox_fraction: { left: +(m.x0 / src.width).toFixed(3), right: +((m.x1 + 1) / src.width).toFixed(3),
                         top: +(m.y0 / src.height).toFixed(3), bottom: +((m.y1 + 1) / src.height).toFixed(3) },
        farthest_mark_px_from_canvas_centre: Math.round(m.farFromCanvas),
        safe_radius_px: Math.round(m.safeRadius), visible_radius_px: Math.round(m.visibleRadius),
        survives_circle_mask_as_is: m.farFromCanvas <= m.safeRadius,
        foreground_scale: FOREGROUND_SCALE,
        foreground_reach_after_scale_fraction_of_safe: +((m.farFromMark * FOREGROUND_SCALE) / m.safeRadius).toFixed(3),
    };
    console.log(JSON.stringify(report, null, 1));
    if (process.argv.includes('--measure')) return;
    if (m.farFromMark * FOREGROUND_SCALE > m.safeRadius) {
        console.error('FOREGROUND_SCALE ' + FOREGROUND_SCALE + ' does not fit the safe circle; not writing.');
        process.exit(1);
    }

    const written = [];
    Object.entries(DENSITIES).forEach(([d, k]) => {
        const dir = path.join(RES, 'mipmap-' + d);
        fs.mkdirSync(dir, { recursive: true });

        // Adaptive foreground: 108dp layer, canvas scaled by FOREGROUND_SCALE,
        // mark centre on the layer centre.
        const L = 108 * k;
        const f = FOREGROUND_SCALE * L / src.width;
        const scaled = resizeTo(src, Math.round(src.width * f));
        const ratio = scaled.width / src.width;
        writePng(path.join(dir, 'ic_launcher_foreground.png'), L, L, place(scaled, L, m.cx * ratio, m.cy * ratio, m.bg));
        written.push('mipmap-' + d + '/ic_launcher_foreground.png');

        // Legacy square: the whole canvas, as the iOS icon shows it.
        const S = 48 * k;
        const sq = resizeTo(src, S);
        writePng(path.join(dir, 'ic_launcher.png'), S, S, Buffer.from(sq.data));
        written.push('mipmap-' + d + '/ic_launcher.png');

        // Legacy round: mark scaled to sit inside the circle, then masked.
        const fr = (ROUND_RADIUS_FRACTION * S / 2) / m.farFromMark;
        const rs = resizeTo(src, Math.round(src.width * fr));
        const rratio = rs.width / src.width;
        writePng(path.join(dir, 'ic_launcher_round.png'), S, S, circleMask(place(rs, S, m.cx * rratio, m.cy * rratio, m.bg), S));
        written.push('mipmap-' + d + '/ic_launcher_round.png');
    });

    // Play Store listing icon: 512x512, the full canvas, NOT packaged (src/main,
    // outside res/).
    const play = resizeTo(src, 512);
    writePng(PLAY, 512, 512, Buffer.from(play.data));
    written.push('../ic_launcher-playstore.png');

    fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        + '    <!-- The icon\'s own canvas colour, read from icon-1024.png by tools/android-icons.js.\n'
        + '         The foreground layer is an opaque field around the mark, so this must match it. -->\n'
        + '    <color name="ic_launcher_background">' + hex(m.bg) + '</color>\n</resources>\n');
    written.push('values/ic_launcher_background.xml');
    console.log('wrote ' + written.length + ' files under ' + path.relative(ROOT, RES));
}

main();
