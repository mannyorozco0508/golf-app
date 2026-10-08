#!/usr/bin/env node
// ============================================================================
// EVERY QR CODE DECODES TO THE LINK IT CLAIMS TO BE (2026-10-07, Wave 1)
//
// Manny's guard, in his words: "each QR decodes to the exact group/watch URL;
// no organizer link ever in a QR."
//
// WHY THIS CANNOT BE A UNIT TEST. A QR is a picture, and the suite's DOM has
// no layout and no pixels. More importantly, reading our own encoder back with
// our own decoder would prove only that the two agree with each other. So the
// codes are rendered by the real page in Chrome, PHOTOGRAPHED, and decoded by
// APPLE'S VISION FRAMEWORK (tools/qr-decode.swift) - the same class of decoder
// an iPhone camera uses, written by somebody else entirely.
//
// IT CALLS NOTHING THE PAGE DEFINES. It opens the scorecard URL a golfer
// opens, taps the Round Menu handle, taps "Show QR code", and taps the next
// arrow between codes. Every tap is a real Input event at the element's
// centre. openRoundQrSheet() is never invoked by name - if the button is not
// wired, this check finds no sheet, which is the point.
//
// AND IT MEASURES THE WORD "READ-ONLY" RATHER THAN REPEATING IT. This app has
// shipped "read-only link" about a link that was fully writable - 76 of 76
// score inputs editable. So the DECODED Watch URL is opened and its score
// inputs counted, and a DECODED group URL is opened and its editable inputs
// counted. Watch must have none; a group link must have some, or it is not a
// scorekeeper link.
//
// BASELINE, against the pre-wave index.html (sha 3059d296329cd7e5) and
// admin.html (a7436357008253a5): 9 faults - no button, so no sheet, no code
// reached and nothing for Apple's decoder to find. After: 0 faults, with
//
//   Group 1  -> .../index.html?game=QR7K2M&group=1
//   Group 2  -> .../index.html?game=QR7K2M&group=2   76 of 76 inputs editable,
//               and the four it shows are Eve, Fay, Gus, Hal - group 2's own
//   Watch    -> .../leaderboard.html?game=QR7K2M     0 score inputs at all
//
// all three decoded by Vision, the token absent from the markup, and the sheet
// not widening the page at 390px.
//
// EXIT: 0 every code decodes to its exact URL and both roles measure right;
//       2 anything else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const CODE = 'QR7K2M';
const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
// EIGHT GOLFERS, so there are two groups and therefore something to swipe
// between - a one-group round would pass a carousel test with no carousel.
const PLAYERS = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta',
                 'Eve Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i), playingForMoney: true }));
const ROUND = {
    eventName: 'Myrtle Day 3', courseName: 'Pine Lakes', players: PLAYERS,
    gameFormat: 'stroke', courseData: CD, scores: {},
    // A TOKEN IS DELIBERATELY ON THIS ROUND. The claim "no organizer link ever
    // in a QR" is worthless on a round that has no organizer link to leak.
    organizerToken: 'tok-must-never-appear', ownerUid: 'me-uid'
};
const DB = { events: { [CODE]: ROUND }, trips: {}, global_courses: {}, tournaments: {} };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// Apple's decoder. Exit 3 means the image held no QR at all, which is a
// different failure from a wrong payload and is reported as such.
function decode(png) {
    try {
        const out = execFileSync('swift', [path.join(__dirname, 'qr-decode.swift'), png],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return String(out).split('\n').map(s => s.trim()).filter(Boolean);
    } catch (e) {
        return [];
    }
}

// What the codes OUGHT to say, from the shared builder - not hand-typed here,
// so the expectation and the app cannot drift apart silently.
function expectedTargets(base) {
    const { loadJsFile } = require('../helpers/load-script.js');
    const sb = loadJsFile('qr-codes.js', ['grouping.js', 'qr-encode.js']);
    sb.OPTS = { code: CODE, players: PLAYERS, groupSizeOverrides: {}, baseUrl: base };
    return JSON.parse(vm.runInContext('JSON.stringify(qrRoundTargets(OPTS))', sb));
}

// String.raw: a template literal eats a single backslash, which has already
// turned /\s+/ into /s+/ and /\$/ into an end-anchor in this repo's checks.
const COUNT_INPUTS = String.raw`(function () {
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.score-input'));
  var editable = boxes.filter(function (b) { return !b.disabled && !b.readOnly; });
  return JSON.stringify({
    shown: boxes.length, editable: editable.length,
    head: String(document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120)
  });
})()`;

const SHEET_STATE = String.raw`(function () {
  var sheet = document.getElementById('qr-sheet');
  if (!sheet) return JSON.stringify({ sheet: false });
  var slides = Array.prototype.slice.call(sheet.querySelectorAll('.qr-slide'));
  var onScreen = slides.filter(function (s) {
    var r = s.getBoundingClientRect();
    return r.left > -50 && r.left < 50;
  });
  return JSON.stringify({
    sheet: sheet.classList.contains('open'),
    slides: slides.length,
    svgs: sheet.querySelectorAll('.qr-art svg').length,
    showing: onScreen.length === 1 ? onScreen[0].getAttribute('data-qr-key') : null,
    roundName: String((sheet.querySelector('.qr-round-name') || {}).innerText || '').trim(),
    label: onScreen.length === 1 ? String(onScreen[0].querySelector('.qr-slide-label').innerText || '').trim() : null,
    // THE TOKEN MUST NOT BE ANYWHERE IN THE SHEET - not in a code, not in an
    // attribute, not in a stray data- field.
    tokenInMarkup: sheet.innerHTML.indexOf('tok-must-never-appear') !== -1,
    pageScrollW: document.documentElement.scrollWidth,
    pageClientW: document.documentElement.clientWidth
  });
})()`;

// A finger on the glass: Input.dispatchTouchEvent, the same raw dispatch the
// round-menu suite uses. touchEnd carries no points, which is what Chrome wants.
const touch = (type, x, y) => ({ cdp: { method: 'Input.dispatchTouchEvent',
    params: { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y }] } } });
function swipeUp(x, y0, y1, n) {
    const out = [touch('touchStart', x, y0)];
    for (let i = 1; i <= n; i++) out.push(touch('touchMove', x, Math.round(y0 + (y1 - y0) * i / n)));
    out.push(touch('touchEnd', 0, 0), { sleep: 450 });
    return out;
}

(async () => {
    const out = { what: 'every QR decodes to the link it claims to be' };
    const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'qrshots-'));
    const served = await serveRepo(REPO);
    const base = 'http://127.0.0.1:' + served.port + '/';
    try {
        const want = expectedTargets(base);
        out.expected = want.map(t => ({ key: t.key, url: t.url }));

        // ---- ARM 1: open the Round Menu with a finger, then tap the button ---
        //
        // A TOUCH GESTURE, NOT A MOUSE CLICK, to open the menu. Measured on the
        // UNMODIFIED page first: a synthetic mouse click on #round-sheet-handle
        // leaves the sheet closed, so a check built on one would have reported
        // this feature broken when it was the harness. The pill's swipe-up is
        // what a phone does and what round_menu_swipe_test.js already drives.
        const steps = [{ sleep: 1200 }]
            .concat(swipeUp(195, 815, 500, 10))
            .concat([{ sleep: 400 },
                     { tap: '.qr-open-btn' }, { sleep: 800 },
                     { expression: SHEET_STATE }]);
        for (let i = 0; i < want.length; i++) {
            steps.push({ shot: path.join(shots, 'slide' + i + '.png') });
            steps.push({ expression: SHEET_STATE });
            if (i < want.length - 1) steps.push({ tap: '.qr-next' }, { sleep: 450 });
        }
        // &group=1, NOT THE BARE LINK. Measured: a bare link on a round with more
        // than one group opens the "How are you joining this round?" picker, which
        // is a modal overlay and swallows every gesture - so the first version of
        // this check reported the sheet as never opening when what it had actually
        // hit was a dialog. A group link is what a scorekeeper is on anyway.
        const r = await arriveCold({
            url: base + 'index.html?game=' + CODE + '&group=1', db: DB, auth: { uid: 'me-uid' },
            viewport: { width: 390, height: 844 }, settleMs: 3600, steps
        });
        if (!r.ok) throw new Error('arrival: ' + r.reason);
        out.taps = (r.value || []).filter(v => typeof v === 'string' && /^tapped|^no element/.test(v));
        const states = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{')
            .map(v => JSON.parse(v));
        out.openedSheet = states[0] || null;
        out.slidesSeen = states.slice(1).map(s => ({ showing: s.showing, label: s.label }));
        out.tokenInMarkup = states.some(s => s.tokenInMarkup === true);

        // ---- DECODE, with Apple's decoder ------------------------------------
        out.decoded = [];
        for (let i = 0; i < want.length; i++) {
            const png = path.join(shots, 'slide' + i + '.png');
            const payloads = fs.existsSync(png) ? decode(png) : [];
            out.decoded.push({ i, key: want[i].key, want: want[i].url, got: payloads,
                               bytes: fs.existsSync(png) ? fs.statSync(png).size : 0 });
        }

        // ---- ARM 2: open the DECODED urls and measure what they permit -------
        const watch = out.decoded.find(d => d.key === 'watch');
        const group = out.decoded.find(d => d.key === 'group-2');
        const openDecoded = async (url) => {
            if (!url) return null;
            const a = await arriveCold({
                url, db: DB, auth: { uid: 'me-uid' },
                viewport: { width: 390, height: 844 }, settleMs: 3200,
                steps: [{ sleep: 900 }, { expression: COUNT_INPUTS }]
            });
            if (!a.ok) return { error: a.reason };
            const raw = (a.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop();
            return raw ? JSON.parse(raw) : { error: 'nothing measured' };
        };
        out.watchOpened = await openDecoded(watch && watch.got[0]);
        out.groupOpened = await openDecoded(group && group.got[0]);
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
        try { fs.rmSync(shots, { recursive: true, force: true }); } catch (e) {}
    }

    const faults = [];
    if (out.error) faults.push('error: ' + out.error);
    const st = out.openedSheet;
    if (!st || !st.sheet) faults.push('the sheet never opened from a real tap: ' + JSON.stringify(out.taps));
    else {
        if (st.slides !== (out.expected || []).length) faults.push('the sheet drew ' + st.slides + ' slides, expected ' + (out.expected || []).length);
        if (st.svgs !== st.slides) faults.push('only ' + st.svgs + ' of ' + st.slides + ' slides actually drew a code');
        if (!/Myrtle Day 3/.test(String(st.roundName || ''))) faults.push('the sheet does not name the round: "' + st.roundName + '"');
        if (st.pageScrollW > st.pageClientW) faults.push('the sheet scrolls the page sideways at 390px (' + st.pageScrollW + ' > ' + st.pageClientW + ')');
    }
    if (out.tokenInMarkup) faults.push('THE ORGANIZER TOKEN IS IN THE SHEET MARKUP');
    // THE SWIPE/ARROW ACTUALLY MOVED: every code must have been on screen once.
    const seen = (out.slidesSeen || []).map(s => s.showing).filter(Boolean);
    (out.expected || []).forEach((t) => {
        if (seen.indexOf(t.key) === -1) faults.push('never reached the ' + t.key + ' code (saw: ' + seen.join(', ') + ')');
    });
    // AND THE DECODE, which is the whole check.
    (out.decoded || []).forEach((d) => {
        if (d.got.length === 0) faults.push(d.key + ': Apple\'s decoder found no QR in the screenshot (' + d.bytes + ' bytes)');
        else if (d.got.length > 1) faults.push(d.key + ': more than one code was on screen at once: ' + JSON.stringify(d.got));
        else if (d.got[0] !== d.want) faults.push(d.key + ': decoded "' + d.got[0] + '" but the link is "' + d.want + '"');
        d.got.forEach((p) => {
            if (/organizer|tok-must-never-appear/i.test(p)) faults.push(d.key + ': THE DECODED CODE CARRIES AN ORGANIZER LINK: ' + p);
        });
    });
    // THE TWO ROLES, MEASURED on the decoded URLs rather than described.
    const w = out.watchOpened || {}, g = out.groupOpened || {};
    if (w.error) faults.push('could not open the decoded Watch URL: ' + w.error);
    else if (w.editable !== 0) faults.push('the Watch code opens a page with ' + w.editable + ' editable score inputs - it is not read-only');
    if (g.error) faults.push('could not open the decoded group URL: ' + g.error);
    else if (!(g.editable > 0)) faults.push('the Group 2 code opens a page with nothing to type in (' + g.shown + ' shown) - it is not a scorekeeper link');

    out.faults = faults;
    out.ok = faults.length === 0;
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
