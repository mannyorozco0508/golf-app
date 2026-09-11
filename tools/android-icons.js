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
// THE ONE DECISION IN HERE, made by Manny on 2026-09-11 after measurement, not
// by this file: the mark in icon-1024.png reaches 489px from the canvas centre,
// and an adaptive icon's safe circle is 66/108 of its 108dp layer - 313px at
// 1024. So the ADAPTIVE FOREGROUND is the 1024 canvas scaled by FOREGROUND_SCALE
// about the mark's own centre, which puts every mark pixel inside the circle on
// every launcher shape. Nothing is redrawn; the art is the art.
//
// THE BACKGROUND LAYER IS THE ICON'S OWN CREAM (#FBF7EE, read from the corner
// of the source), not manifest.json's #F6F4EC. The foreground is opaque cream
// around the mark, so the two layers must be the same colour or a faintly
// lighter square shows around the R. Five levels apart, chosen deliberately.
//
// Resampling is macOS `sips` (Lanczos-quality, nothing to install); everything
// after that - placement, the round mask, the PNG bytes - is helpers/png.js.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readPng, writePng, canvasColour } = require('../helpers/png.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'icon-1024.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const PLAY = path.join(ROOT, 'android', 'app', 'src', 'main', 'ic_launcher-playstore.png');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FOREGROUND_SCALE = 0.61;     // approved: fits the 66/108 safe circle
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

function sipsResize(size) {
    const out = path.join(os.tmpdir(), 'rattle-icon-' + size + '-' + process.pid + '.png');
    execFileSync('sips', ['-z', String(size), String(size), SRC, '--out', out], { stdio: 'pipe' });
    const img = readPng(out);
    fs.unlinkSync(out);
    return img;
}

// A size x size cream canvas with `src` drawn so that source point (cx, cy)
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
        const scaled = sipsResize(Math.round(src.width * f));
        const ratio = scaled.width / src.width;
        writePng(path.join(dir, 'ic_launcher_foreground.png'), L, L, place(scaled, L, m.cx * ratio, m.cy * ratio, m.bg));
        written.push('mipmap-' + d + '/ic_launcher_foreground.png');

        // Legacy square: the whole canvas, as the iOS icon shows it.
        const S = 48 * k;
        const sq = sipsResize(S);
        writePng(path.join(dir, 'ic_launcher.png'), S, S, Buffer.from(sq.data));
        written.push('mipmap-' + d + '/ic_launcher.png');

        // Legacy round: mark scaled to sit inside the circle, then masked.
        const fr = (ROUND_RADIUS_FRACTION * S / 2) / m.farFromMark;
        const rs = sipsResize(Math.round(src.width * fr));
        const rratio = rs.width / src.width;
        writePng(path.join(dir, 'ic_launcher_round.png'), S, S, circleMask(place(rs, S, m.cx * rratio, m.cy * rratio, m.bg), S));
        written.push('mipmap-' + d + '/ic_launcher_round.png');
    });

    // Play Store listing icon: 512x512, the full canvas, NOT packaged (src/main,
    // outside res/).
    const play = sipsResize(512);
    writePng(PLAY, 512, 512, Buffer.from(play.data));
    written.push('../ic_launcher-playstore.png');

    fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        + '    <!-- The icon\'s own canvas colour, read from icon-1024.png by tools/android-icons.js.\n'
        + '         The foreground layer is opaque cream around the mark, so this must match it. -->\n'
        + '    <color name="ic_launcher_background">' + hex(m.bg) + '</color>\n</resources>\n');
    written.push('values/ic_launcher_background.xml');
    console.log('wrote ' + written.length + ' files under ' + path.relative(ROOT, RES));
}

main();
