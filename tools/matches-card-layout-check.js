#!/usr/bin/env node
// ============================================================================
// EVERY BUTTON IN THE MATCHES CARD IS THE SAME WIDTH, AND INSIDE IT (2026-10-09)
//
// Manny, on an iPhone: "Final Results & Receipt" is wider than the card and
// sticks out past the right edge. The other three buttons in that card do not.
//
// WHY ONLY THAT ONE, and it is worth saying rather than guessing: the three
// above it are <button> and that one is an <a>. .btn-primary sets width:100%
// and padding:12px with NO box-sizing, and a button gets border-box from the
// UA stylesheet while an anchor does not - so the anchor alone computes to
// 100% PLUS 24px of padding. That is the measurement this check takes; it is
// not asserted from reading the CSS.
//
// mini-dom cannot see any of this: getBoundingClientRect there is a hard-coded
// all-zero rect, which is exactly why CLAUDE.md says to measure geometry in
// Chrome and never teach the harness a fake one.
//
// 390 AND 320, because the brief names both: an iPhone 14/15/16 and the
// narrowest phone still in service (iPhone SE 1st gen / a 320px viewport).
//
// EXIT: 0 when every button in the card shares one width and sits inside the
// card's padding at both widths; 2 otherwise.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..');
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

const CODE = 'LAY01';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = ['Manny', 'Reese', 'Tim', 'Rocco'].map((n, i) => ({ id: 101 + i, name: n, hcp: '10' }));

// Every control the card actually renders, with its real box. Label-based, and
// innerText - never textContent, which on these pages is mostly JavaScript.
const MEASURE = String.raw`(function () {
  var card = document.getElementById('sidematches-card');
  if (!card) return JSON.stringify({ missing: 'sidematches-card' });
  var cs = getComputedStyle(card);
  var cr = card.getBoundingClientRect();
  var inner = { left: cr.left + parseFloat(cs.paddingLeft || 0),
                right: cr.right - parseFloat(cs.paddingRight || 0) };
  var out = [];
  card.querySelectorAll('button, a').forEach(function (el) {
    if (el.offsetParent === null) return;
    if (!/btn-primary/.test(String(el.className || ''))) return;
    var r = el.getBoundingClientRect();
    out.push({ label: String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 34),
               tag: el.tagName, left: Math.round(r.left * 10) / 10,
               right: Math.round(r.right * 10) / 10, width: Math.round(r.width * 10) / 10,
               boxSizing: getComputedStyle(el).boxSizing });
  });
  return JSON.stringify({ viewport: window.innerWidth,
    card: { left: Math.round(cr.left * 10) / 10, right: Math.round(cr.right * 10) / 10,
            width: Math.round(cr.width * 10) / 10 },
    innerLeft: Math.round(inner.left * 10) / 10, innerRight: Math.round(inner.right * 10) / 10,
    bodyScrollWidth: document.body.scrollWidth, buttons: out });
})()`;

// THE GO TO ROUND BUTTON, read in a real browser. matches_go_to_round_test.js
// has to supply its own localStorage because mini-dom's accepts a write and
// then answers null; here it is the genuine article, so the organizer's "Score
// for" pick is proved rather than simulated.
const GOBTN = String.raw`(function () {
  var a = document.getElementById('sm-go-round');
  if (!a) return JSON.stringify({ goButton: 'MISSING' });
  var card = document.getElementById('sidematches-card');
  var kids = card ? Array.prototype.filter.call(card.children, function (el) {
      return /btn-primary/.test(String(el.className || '')) && el.offsetParent !== null; }) : [];
  return JSON.stringify({ goButton: {
    label: String(a.innerText || '').trim(),
    href: String(a.getAttribute('href') || ''),
    isLast: kids.length ? (kids[kids.length - 1].id === 'sm-go-round') : null,
    onScreen: (function () { var r = a.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 2000 && r.height > 0; })()
  } });
})()`;

async function at(served, width, opts) {
    opts = opts || {};
    const scores = {};
    if (opts.holesPlayed) {
        PLAYERS.forEach(p => { for (let h = 1; h <= opts.holesPlayed; h++) scores['p' + p.id + '_h' + h] = 4; });
    }
    const pre = opts.stored
        ? "try{localStorage.setItem('golfapp_org_group_" + CODE + "','" + opts.stored + "');}catch(e){}"
        : '';
    const r = await arriveCold({
        url: 'http://127.0.0.1:' + served.port + '/sidematches.html?game=' + CODE
            + (opts.group ? '&group=' + opts.group : ''),
        db: { events: { [CODE]: { eventName: 'Live Round', gameFormat: 'stroke', courseName: 'Caledonia',
                                  players: PLAYERS, courseData: CD, scores: scores } },
              trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'anon-1', isAnonymous: true }, preScript: pre,
        viewport: { width: width, height: 844 }, settleMs: 3200,
        steps: [{ sleep: 1400 }, { expression: MEASURE }, { expression: GOBTN }]
    });
    if (!r.ok) return { width, error: r.reason };
    const vals = (r.value || []).map(String).filter(v => v.charAt(0) === '{');
    if (!vals.length) return { width, error: 'nothing measured' };
    const merged = { width: width, name: opts.name || (width + 'px') };
    vals.forEach(v => Object.assign(merged, JSON.parse(v)));
    return merged;
}

(async () => {
    const out = { what: 'every button in the Matches card is one width, inside the card', runs: [], faults: [] };
    const served = await serveRepo(REPO);
    try {
        out.runs.push(await at(served, 390, { name: '390px, no scores yet' }));
        await new Promise(r => setTimeout(r, 1500));
        out.runs.push(await at(served, 320, { name: '320px, no scores yet' }));
        await new Promise(r => setTimeout(r, 1500));
        out.runs.push(await at(served, 390, { name: '390px, three holes played', holesPlayed: 3 }));
        await new Promise(r => setTimeout(r, 1500));
        out.runs.push(await at(served, 390, { name: '390px, a group link', group: 3 }));
        await new Promise(r => setTimeout(r, 1500));
        out.runs.push(await at(served, 390, { name: '390px, the organizer’s own pick', stored: 2 }));
    } catch (e) {
        out.faults.push('check error: ' + String(e && e.message || e));
    } finally {
        try { served.server.close(); } catch (e) {}
    }

    out.runs.forEach((run) => {
        const tag = '[' + (run.name || run.width) + '] ';
        // THE BUTTON ITSELF, in a real browser.
        const g = run.goButton;
        if (g === 'MISSING' || !g) {
            out.faults.push(tag + 'there is no Go to Round button on the card');
        } else {
            const started = /three holes/.test(run.name || '');
            if (started && !/Go to Round/.test(g.label)) {
                out.faults.push(tag + 'a round in progress offers "' + g.label + '"');
            }
            if (!started && !/Start Round/.test(g.label)) {
                out.faults.push(tag + 'a round nobody has started offers "' + g.label + '"');
            }
            if (!/^index\.html\?game=/.test(g.href)) {
                out.faults.push(tag + 'the button does not open the scorecard: ' + g.href);
            }
            if (/a group link/.test(run.name || '') && !/[?&]group=3\b/.test(g.href)) {
                out.faults.push(tag + 'the group was dropped: ' + g.href);
            }
            if (/organizer/.test(run.name || '') && !/[?&]group=2\b/.test(g.href)) {
                out.faults.push(tag + 'the organizer’s stored pick was dropped: ' + g.href);
            }
            if (g.isLast === false) {
                out.faults.push(tag + 'the button is not the last control in the card');
            }
        }
        if (run.error) { out.faults.push(tag + 'arrival failed: ' + run.error); return; }
        if (run.missing) { out.faults.push(tag + 'no ' + run.missing + ' on the page'); return; }
        const b = run.buttons || [];
        // ANTI-VACUITY FIRST: a card with no buttons satisfies every width rule.
        if (b.length < 4) {
            out.faults.push(tag + 'only ' + b.length + ' primary buttons found in the card, so this '
                + 'measurement proves nothing: ' + JSON.stringify(b.map(x => x.label)));
            return;
        }
        // 1. NOTHING STICKS OUT OF THE CARD.
        b.forEach((x) => {
            if (x.right > run.innerRight + 0.5) {
                out.faults.push(tag + '"' + x.label + '" (' + x.tag + ') ends at ' + x.right
                    + ', past the card\'s inner edge at ' + run.innerRight + ' - over by '
                    + Math.round((x.right - run.innerRight) * 10) / 10 + 'px');
            }
            if (x.left < run.innerLeft - 0.5) {
                out.faults.push(tag + '"' + x.label + '" starts at ' + x.left
                    + ', left of the card\'s inner edge at ' + run.innerLeft);
            }
        });
        // 2. AND THEY ARE ALL THE SAME WIDTH.
        const widths = b.map(x => x.width);
        const min = Math.min.apply(null, widths), max = Math.max.apply(null, widths);
        if (max - min > 0.5) {
            out.faults.push(tag + 'the buttons are ' + widths.join(' / ') + ' wide - a '
                + Math.round((max - min) * 10) / 10 + 'px spread between "'
                + b[widths.indexOf(min)].label + '" and "' + b[widths.indexOf(max)].label + '"');
        }
        // 3. AND THE PAGE DOES NOT SCROLL SIDEWAYS, which is what a golfer sees.
        if (run.bodyScrollWidth > run.width + 1) {
            out.faults.push(tag + 'the page scrolls sideways: body is ' + run.bodyScrollWidth
                + ' wide in a ' + run.width + 'px viewport');
        }
    });
    out.ok = out.faults.length === 0;
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.ok ? 0 : 2);
})();
