#!/usr/bin/env node
// ============================================================================
// THE READING PAGES, WITH NO SIGNAL AND SCORES STILL WAITING (2026-10-06)
//
// Requirement 5 is a LABEL, not arithmetic (Manny: "No new math"). What has to
// be proved is therefore two things, and the second is the one a unit test
// cannot reach:
//
//   1. the four pages COMPUTE from local data plus this phone's queue - the
//      leaderboard has rows, the bets page has bets, the receipt has money, the
//      card has a card, with the server saying nothing at all;
//   2. each one says "May change when others sync."
//
// HOW IT ARRIVES THERE. The scorecard is opened online once so the round is
// stored on the phone, then three scores are typed with the database offline so
// they sit in the queue, and then each reading page is opened on the SAME
// profile with the round ABSENT from the stand-in database - which is what no
// signal looks like from the page's side.
//
// EXIT: 0 all four compute and all four say it; 2 anything else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CODE = 'READ1';
const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const FOUR = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
// A round with money on it, so the receipt and the bets page have something to
// compute: skins and a birdie game, both priced.
const ROUND = {
    eventName: 'Offline Saturday', courseName: 'Dobson Ranch', players: FOUR,
    gameFormat: 'stroke', courseData: CD, scores: { p101_h1: 4, p102_h1: 5, p103_h1: 4, p104_h1: 6 },
    settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 }, ownerUid: 'me-uid',
    additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross',
                                skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } }
};
const FULL = { events: { [CODE]: ROUND }, trips: {}, global_courses: {}, tournaments: {} };
const EMPTY = { events: {}, trips: {}, global_courses: {}, tournaments: {} };

// innerText, never textContent: every one of these pages keeps its whole
// application in an inline script, so textContent would match words in SOURCE
// on a page that rendered nothing at all.
const READ = `(function () {
  var note = document.getElementById('sync-caveat');
  var body = String(document.body.innerText || '').replace(/\\s+/g, ' ');
  return JSON.stringify({
    caveat: note && getComputedStyle(note).display !== 'none' ? String(note.innerText || '').trim() : null,
    chars: body.length,
    bodyHead: body.slice(0, 220),
    // Does it have NUMBERS on it, or is it an empty shell? Each page gets the
    // thing only it can show.
    hasRows: document.querySelectorAll('tr, .lb-row, .board-row, .skin-row, .settle-row').length,
    names: ['Ann', 'Ben', 'Cal', 'Dee'].filter(function (n) { return body.indexOf(n) !== -1; }).length,
    connecting: /Connecting to game/.test(body),
    // DIAGNOSTIC: what the phone actually holds, and what the helper made of it.
    lsKeys: Object.keys(localStorage).filter(function (k) { return k.indexOf('golfapp') === 0; }),
    mode: (typeof currentMode !== 'undefined') ? String(currentMode) : 'undefined',
    lr: (function () {
      if (!window.OfflineQueue) return 'no module';
      try { var x = window.OfflineQueue.localRound(localStorage, (typeof currentMode !== 'undefined') ? currentMode : '', null);
            return { hasData: !!x.data, players: x.data && x.data.players ? x.data.players.length : 0,
                     fromLocal: x.fromLocal, waiting: x.waiting }; }
      catch (e) { return 'threw: ' + e.message; }
    })()
  });
})()`;

const PRETEND_OFFLINE = "try { Object.defineProperty(navigator, 'onLine', { get: function () { return false; }, configurable: true }); } catch (e) {}";
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
const typeInto = (nth, v) => ({ expression: `(function () {
    var b = document.querySelectorAll('.score-input')[${nth}];
    if (!b) return 'no box';
    b.focus(); b.value = '${v}';
    b.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('change', { bubbles: true })); b.blur();
    return 'typed';
})()` });

(async () => {
    const out = { what: 'the reading pages with no signal and scores waiting' };
    const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'readpages-'));
    const served = await serveRepo(path.join(__dirname, '..'));
    const base = 'http://127.0.0.1:' + served.port + '/';
    const clearLocks = () => ['DevToolsActivePort', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']
        .forEach(f => { try { fs.rmSync(path.join(PROFILE, f), { force: true, recursive: true }); } catch (e) {} });
    try {
        // 1. the scorecard, online, so the round lands on the phone; then three
        //    scores typed with the database offline.
        const seed = await arriveCold({
            url: base + 'index.html?game=' + CODE, db: FULL, auth: { uid: 'me-uid' },
            viewport: { width: 390, height: 844 }, settleMs: 3000, profileDir: PROFILE,
            steps: [{ expression: 'window.__coldSetOffline(true); "db offline"' },
                    typeInto(0, 7), typeInto(1, 3), typeInto(2, 6), { sleep: 1200 },
                    { expression: '(window.OfflineQueue ? String(window.OfflineQueue.count(localStorage)) : "no module")' },
                    // CHROME HAS TO WRITE IT TO DISK BEFORE IT IS KILLED.
                    // localStorage is backed by LevelDB and flushed
                    // asynchronously; arriveCold kills the browser in its
                    // finally, and ending 1.2s after the last write left the
                    // next arrival with an EMPTY store - measured, lsKeys [],
                    // which reads exactly like a queue that never persisted.
                    // The airplane check never hit it because its first arrival
                    // happens to run several seconds past its last write.
                    { sleep: 2500 }]
        });
        if (!seed.ok) throw new Error('seed arrival: ' + seed.reason);
        // The count, not the sleep that follows it: read the numeric value.
        out.queuedBeforeReading = seed.value.filter(v => /^[0-9]+$/.test(String(v))).pop();

        // 2. each reading page, same profile, the round ABSENT from the database.
        out.pages = {};
        for (const page of ['leaderboard.html', 'skins.html', 'settlement.html', 'stats.html']) {
            clearLocks();
            await new Promise(r => setTimeout(r, 400));
            const r = await arriveCold({
                url: base + page + '?game=' + CODE, db: EMPTY, auth: { uid: 'me-uid' },
                viewport: { width: 390, height: 844 }, settleMs: 3200, profileDir: PROFILE,
                preScript: PRETEND_OFFLINE, steps: [{ sleep: 1000 }, { expression: READ }]
            });
            out.pages[page] = r.ok
                ? JSON.parse(r.value.filter(v => typeof v === 'string' && v.charAt(0) === '{').pop())
                : { error: r.reason };
        }
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
        try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
    }
    const pages = out.pages || {};
    // WHAT EACH PAGE CAN HONESTLY BE ASKED FOR. "All four golfers by name" is
    // true of the leaderboard and the receipt and NOT of the other two - the
    // bets page lists bets and the final card lists holes - so each page is held
    // to the thing only it renders. Asserting names on all four would have been
    // a criterion invented to fit, and it failed on two pages that were working.
    const EVIDENCE = {
        'leaderboard.html': (p) => p.names === 4 && /Offline Saturday/.test(p.bodyHead),
        'skins.html': (p) => /group|Bets|Skins/i.test(p.bodyHead) && p.chars > 300,
        'settlement.html': (p) => p.names === 4 && /Settle/.test(p.bodyHead),
        'stats.html': (p) => /DOBSON RANCH/i.test(p.bodyHead) && /HOLE/.test(p.bodyHead)
    };
    out.ok = !out.error && out.queuedBeforeReading === '3'
        && Object.keys(pages).length === 4
        && Object.keys(pages).every((k) => {
            const p = pages[k];
            const okEvidence = p && !p.error && EVIDENCE[k] && EVIDENCE[k](p);
            if (p) p.computedFromLocal = !!okEvidence;
            return okEvidence && p.caveat === 'May change when others sync.'
                && p.connecting === false && p.lr && p.lr.fromLocal === true && p.lr.waiting === 3;
        });
    // WHICH CRITERION FAILED, named rather than left to be guessed at.
    out.why = Object.keys(pages).map((k) => {
        const p = pages[k];
        return k + ': evidence=' + (EVIDENCE[k] ? !!EVIDENCE[k](p) : 'no-rule')
            + ' caveat=' + (p.caveat === 'May change when others sync.')
            + ' connecting=' + (p.connecting === false)
            + ' fromLocal=' + (!!p.lr && p.lr.fromLocal === true)
            + ' waiting3=' + (!!p.lr && p.lr.waiting === 3);
    });
    out.whyQueued = JSON.stringify(out.queuedBeforeReading) + ' (want "3")';
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
