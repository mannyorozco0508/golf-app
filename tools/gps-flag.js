// ============================================================================
// GPS_ENABLED - ONE BUILD-TIME FLAG, TWO PRODUCTS (gps-v1, 2026-10-06)
//
//   HardPan  (GPS + Bets)  GPS_ENABLED=1
//   Consumer (Bets only)   GPS_ENABLED=0, or unset - THE DEFAULT
//
// The flag is read by the two scripts that PRODUCE an app from this tree:
//   sync-mobile-web.js   the iOS / Android web bundle (www/app)
//   build-shell.js       the deployable web outputs (dist/)
//
// HOW GPS IS MARKED IN SOURCE. Every GPS line in a shared file sits between
// two marker lines:
//
//     <!-- GPS:BEGIN -->   ...   <!-- GPS:END -->        (HTML, plist)
//     // GPS:BEGIN         ...   // GPS:END              (JS)
//     /* GPS:BEGIN */      ...   /* GPS:END */           (CSS)
//
// A block may carry an OFF branch, for the rare line that must DIFFER rather
// than disappear:
//
//     // GPS:BEGIN
//     <the HardPan line>
//     // GPS:ELSE
//     // <the Consumer line, commented out in source>
//     // GPS:END
//
// In source (flag ON) the ELSE lines are comments. Flag OFF emits them with
// their leading "// " removed, so the Consumer file gets its original line
// back, byte for byte.
//
// Flag OFF removes each block WHOLE - the marker lines and everything between
// them - and leaves every other byte alone. That is why the Consumer
// index.html is byte-identical to the pre-GPS one (gps_flag_test.js pins
// the sha). Flag ON leaves the file exactly as it is in source: the markers
// are comments.
//
// GPS-ONLY FILES (GPS_SHELL in sync-mobile-web.js) are simply not copied when
// the flag is off: no GPS code, no Leaflet, no course geometry, no tile key.
//
// The repo root ITSELF - what Cloudflare Pages serves with no build step -
// is the source, i.e. flag ON. See docs/gps-builds.md.
// ============================================================================
'use strict';

const BEGIN = /GPS:BEGIN/;
const END = /GPS:END/;
const ELSE = /GPS:ELSE/;

// '1', 'true', 'on', 'yes' -> on. Anything else, including unset -> OFF.
// Off by default, so an existing build command keeps producing exactly the
// app it produced before this flag existed.
function isEnabled(env) {
    const v = String(((env || process.env).GPS_ENABLED) || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

// Remove every GPS block (marker lines included) when `enabled` is false.
// Throws on an unbalanced marker rather than guessing which half to keep.
function applyFlag(text, enabled, name) {
    if (enabled) return text;
    if (!BEGIN.test(text) && !END.test(text) && !ELSE.test(text)) return text;
    const lines = text.split('\n');
    const out = [];
    let depth = 0;
    let inElse = false;
    lines.forEach((line, i) => {
        if (BEGIN.test(line)) {
            if (depth) throw new Error((name || 'file') + ':' + (i + 1) + ' nested GPS:BEGIN');
            depth = 1;
            inElse = false;
            return;
        }
        if (ELSE.test(line)) {
            if (!depth) throw new Error((name || 'file') + ':' + (i + 1) + ' GPS:ELSE outside a block');
            inElse = true;
            return;
        }
        if (END.test(line)) {
            if (!depth) throw new Error((name || 'file') + ':' + (i + 1) + ' GPS:END without BEGIN');
            depth = 0;
            inElse = false;
            return;
        }
        if (!depth) { out.push(line); return; }
        if (inElse) {
            const m = /^(\s*)\/\/ ?(.*)$/.exec(line);
            if (!m) throw new Error((name || 'file') + ':' + (i + 1) + ' a GPS:ELSE line must be a // comment');
            out.push(m[1] + m[2]);
        }
    });
    if (depth) throw new Error((name || 'file') + ': GPS:BEGIN never closed');
    return out.join('\n');
}

// Which copied files are text the flag may need to rewrite.
function isText(file) { return /\.(html|js|css|json|plist|txt|md|webmanifest)$/i.test(file); }

// The iOS location permission. The native app is Consumer only (decision
// 2026-10-07: HardPan is web-only), so Info.plist must never carry it. This can
// only REMOVE the key; there is deliberately no code anywhere that adds it.
const PLIST_KEY = 'NSLocationWhenInUseUsageDescription';
function plistFor(text, enabled) {
    if (enabled) throw new Error('refused: the native app is Consumer only - no location permission (docs/gps-builds.md)');
    const re = new RegExp('\\n?[ \\t]*<key>' + PLIST_KEY + '</key>\\s*<string>[^<]*</string>', 'g');
    return text.replace(re, '');
}

module.exports = { isEnabled, applyFlag, isText, plistFor, PLIST_KEY };
