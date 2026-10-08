#!/usr/bin/env node
// ============================================================================
// THE FINISHED MATCH CARD, AT 390px, WITH NOTHING CUT OFF (2026-10-07)
//
// FOUND BY MANNY setting up screenshots on an iPhone 17 Pro Max simulator: on
// Hole View a finished match read "Manny/Tim 6&5 · FINAL ... +$20" and the
// matches box was WIDER THAN THE SCREEN - the amount on the right was cut off.
//
// WHY THIS IS A CHROME CHECK AND NOT A UNIT TEST. helpers/mini-dom.js has no
// layout at all: getBoundingClientRect() returns zeros, so "is this box wider
// than the screen" is a question it cannot be asked. CLAUDE.md is explicit that
// geometry gets measured in a real browser and that mini-dom must never be
// taught to return a fake rect.
//
// IT CALLS NOTHING THE PAGE DEFINES. It serves the repo, arrives at the
// scorecard URL a golfer opens with a finished round in the stand-in database,
// and measures what rendered. No render function is invoked by name.
//
// WHAT IT MEASURES, at 390x844:
//   1. the page does not scroll sideways      documentElement.scrollWidth
//   2. no match card overflows its own box    scrollWidth vs clientWidth
//   3. the money is ON SCREEN and INSIDE the card, by rect - the actual
//      complaint, which "no overflow" alone does not prove
//
// EXIT: 0 clean; 2 anything measured wrong or nothing rendered to measure.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CODE = 'OVFL18';
const ROUND = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'matches_tab_finished.fixture.json'), 'utf8'));
ROUND.ownerUid = 'me-uid';
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

// innerText, never textContent: this page keeps its whole application in an
// inline script, so textContent would match the source of code that drew nothing.
const MEASURE = `(function () {
  var doc = document.documentElement;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.match-card'));
  var mount = document.getElementById('action-center-mount');
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { scrollW: el.scrollWidth, clientW: el.clientWidth,
             left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
             over: el.scrollWidth - el.clientWidth };
  }
  // THE LIVE MATCH CARD, which is the box Manny measured. There are two in the
  // markup and one of them is in a collapsed widget, so the VISIBLE one is the
  // subject - picking querySelector's first gave a 0x0 element and a clean
  // reading of nothing at all.
  var lm = Array.prototype.slice.call(document.querySelectorAll('.lm-card'))
    .filter(function (c) { return c.getBoundingClientRect().width > 0; })[0] || null;
  function clipped(el) { return el.scrollWidth - el.clientWidth > 0; }
  var lmInfo = null;
  if (lm) {
    var lr = lm.getBoundingClientRect();
    var ls = getComputedStyle(lm);
    var innerR = lr.right - parseFloat(ls.paddingRight || 0);
    var moneys = Array.prototype.slice.call(lm.querySelectorAll('.lm-row-money, .lm-top-money'));
    var results = Array.prototype.slice.call(lm.querySelectorAll('.lm-seg-status, .lm-press-status, .lm-sides'));
    lmInfo = {
      box: box(lm),
      right: Math.round(lr.right),
      // \\s, NOT \s: this whole stub is a TEMPLATE LITERAL, so a single
      // backslash is eaten before the browser sees it and /\s+/ arrives as
      // /s+/ - which replaced every letter "s" on the card and turned "Nassau"
      // into "Na au" and the 6&5 control into a false failure.
      text: String(lm.innerText || '').replace(/\\s+/g, ' '),
      has65: /6&5/.test(String(lm.innerText || '')),
      hasFinal: /FINAL/.test(String(lm.innerText || '')),
      // EVERY AMOUNT ON THE CARD: inside the card and on the screen.
      amounts: moneys.map(function (m) {
        var r = m.getBoundingClientRect();
        return { t: String(m.innerText || '').trim(), right: Math.round(r.right),
                 inside: r.right <= innerR + 0.5, onScreen: r.right <= window.innerWidth + 0.5 };
      }),
      // EVERY RESULT ON THE CARD: not cut off. An ellipsised "Manny/Tim 6..."
      // is the result thrown away, which is the same defect one step on.
      results: results.map(function (el) {
        return { t: String(el.innerText || '').trim(), clipped: clipped(el) };
      })
    };
  }
  return JSON.stringify({
    lm: lmInfo,
    viewport: window.innerWidth,
    pageScrollW: doc.scrollWidth,
    pageClientW: doc.clientWidth,
    mount: box(mount),
    mountText: mount ? String(mount.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) : '',
    cards: cards.map(function (c) {
      var line2 = c.querySelector('.mc-line2');
      var money = c.querySelector('.mc-money');
      var status = c.querySelector('.mc-status');
      var thru = c.querySelector('.mc-thru');
      var cr = c.getBoundingClientRect();
      var cs = getComputedStyle(c);
      var inner = { l: cr.left + parseFloat(cs.paddingLeft || 0),
                    r: cr.right - parseFloat(cs.paddingRight || 0) };
      var mr = money ? money.getBoundingClientRect() : null;
      return {
        text: String(c.innerText || '').replace(/\\s+/g, ' ').trim(),
        card: box(c), line2: box(line2), status: box(status), thru: box(thru),
        moneyText: money ? String(money.innerText || '').trim() : null,
        // THE ACTUAL COMPLAINT: is the amount inside the card and on the screen?
        moneyRight: mr ? Math.round(mr.right) : null,
        moneyInsideCard: mr ? (mr.right <= inner.r + 0.5 && mr.left >= inner.l - 0.5) : null,
        moneyOnScreen: mr ? (mr.right <= window.innerWidth + 0.5 && mr.left >= -0.5) : null,
        statusWraps: status ? (status.getBoundingClientRect().height > parseFloat(getComputedStyle(status).lineHeight || 0) * 1.4) : null
      };
    })
  });
})()`;

// WHICH ELEMENT IS STICKING OUT. "The page scrolls sideways" is not actionable
// on its own; this names every element whose right edge is past the viewport.
const WIDEST = `(function () {
  var all = Array.prototype.slice.call(document.querySelectorAll('body *'));
  var w = window.innerWidth;
  var bad = [];
  all.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > w + 0.5 || el.scrollWidth - el.clientWidth > 0) {
      bad.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60),
                 right: Math.round(r.right), w: Math.round(r.width),
                 over: el.scrollWidth - el.clientWidth,
                 text: String(el.innerText || '').replace(/\s+/g, ' ').slice(0, 50) });
    }
  });
  return JSON.stringify({ widest: bad.slice(0, 25) });
})()`;

(async () => {
    const out = { what: 'the finished match card at 390px' };
    const served = await serveRepo(path.join(__dirname, '..'));
    try {
        const r = await arriveCold({
            url: 'http://127.0.0.1:' + served.port + '/index.html?game=' + CODE + '&group=1',
            db: DB, auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
            settleMs: 4000,
            // THE MATCHES BOX ARRIVES COLLAPSED ("My Round - 4 live - tap to
            // see"), so a real tap opens it. A tap is a user action; this check
            // still calls nothing the page defines.
            steps: [{ sleep: 1200 }, { tap: '.action-toggle' }, { sleep: 700 },
                    { expression: MEASURE }, { expression: WIDEST }]
        });
        if (!r.ok) throw new Error('arrival: ' + r.reason);
        const objs = r.value.filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
        if (!objs.length) throw new Error('nothing measured');
        objs.forEach(o => Object.assign(out, o));
        out.steps = r.value.filter(v => typeof v === 'string' && v.indexOf('tap') === 0);
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
    }
    const cards = out.cards || [];
    // POSITIVE CONTROL FIRST: three finished cards with money on them, or the
    // measurements below are true of an empty screen.
    out.rendered = cards.length;
    out.withMoney = cards.filter(c => c.moneyText).length;
    const faults = [];
    if (out.error) faults.push('error: ' + out.error);
    if (cards.length < 3) faults.push('only ' + cards.length + ' match cards rendered (want 3)');
    if (out.withMoney < 3) faults.push('only ' + out.withMoney + ' cards show money (want 3)');
    if (out.pageScrollW > out.pageClientW) {
        faults.push('the PAGE scrolls sideways: scrollWidth ' + out.pageScrollW
            + ' > clientWidth ' + out.pageClientW);
    }
    // THE LIVE MATCH CARD - the box in the complaint.
    const lm = out.lm;
    if (!lm) faults.push('no visible .lm-card rendered, so nothing was measured');
    else {
        // POSITIVE CONTROL: this really is the finished card with money on it.
        if (!lm.has65 || !lm.hasFinal) faults.push('the card does not show the finished 6&5 result, so this is not the screen in the complaint: ' + lm.text.slice(0, 120));
        if (!lm.amounts.length) faults.push('the card shows no amounts at all');
        if (lm.right > out.viewport + 0.5) faults.push('the matches box runs past the screen: right edge ' + lm.right + ' at ' + out.viewport + 'px');
        if (lm.box && lm.box.over > 0) faults.push('the matches box overflows its own column by ' + lm.box.over + 'px');
        lm.amounts.filter(a => !a.onScreen).forEach(a => faults.push('the amount "' + a.t + '" is off screen (right edge ' + a.right + ')'));
        lm.amounts.filter(a => a.onScreen && !a.inside).forEach(a => faults.push('the amount "' + a.t + '" sits outside the card (right edge ' + a.right + ')'));
        lm.results.filter(r => r.clipped).forEach(r => faults.push('the result "' + r.t + '" is cut off instead of wrapping'));
    }
    cards.forEach((c, i) => {
        const who = 'card ' + (i + 1) + ' "' + String(c.text || '').slice(0, 40) + '"';
        if (c.card && c.card.over > 0) faults.push(who + ': the card overflows its box by ' + c.card.over + 'px');
        if (c.line2 && c.line2.over > 0) faults.push(who + ': the status/money line overflows by ' + c.line2.over + 'px');
        if (c.moneyText && c.moneyInsideCard === false) faults.push(who + ': the amount "' + c.moneyText + '" sits outside the card (right edge ' + c.moneyRight + ')');
        if (c.moneyText && c.moneyOnScreen === false) faults.push(who + ': the amount "' + c.moneyText + '" is off screen at 390px (right edge ' + c.moneyRight + ')');
    });
    out.faults = faults;
    out.ok = faults.length === 0;
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
