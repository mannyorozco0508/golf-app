#!/usr/bin/env node
// ============================================================================
// AIRPLANE MODE, FOR REAL: TYPE SCORES, CLOSE THE APP, COME BACK (2026-10-06)
//
// The unit tests drive offline-queue.js directly and prove its decisions. They
// cannot prove the one thing this wave is about: that the bytes are still there
// after the page is gone. Only a browser can, and only against the page itself.
//
// WHAT THIS DOES, in the order a golfer does it:
//
//   1. opens the scorecard ONLINE (a stand-in database answers), so the round
//      lands and gets stored on the phone
//   2. goes OFFLINE - the real thing, Network.emulateNetworkConditions, which
//      also takes the websocket down
//   3. types seven scores into the real boxes, with real key events
//   4. RELOADS - the app closed and reopened, still offline. This is the case
//      that lost every score before this wave.
//   5. RESTARTS - a fresh browser context over the same profile, which is what
//      a phone restart is: new process, same disk
//   6. comes back ONLINE and watches the queue drain
//
// WHAT STANDS IN FOR THE SERVER. tools/lib/cold-arrival.js's stand-in database,
// which the whole repo uses, with one addition: it records every write and can
// be told to fail them. That is not a shortcut past the SDK - the question here
// is whether OUR queue survives a reload, and the SDK's own queue was already
// measured (tools/offline-durability-audit.js) and does not.
//
// EXIT: 0 every claim held; 2 anything else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const http = require('http');

// SERVED OVER http, NOT file://, AND THAT IS NOT A DETAIL. A file:// page gets
// an OPAQUE ORIGIN in Chrome: localStorage does not persist across processes, so
// a restart read back null and "nothing survived" would have been true of any
// page, queue or no queue. Measured - the first version of this check used
// fileUrl and reported a lost queue that was never stored. The real app runs on
// https (web) or capacitor://localhost (iOS), both real origins, which is what
// this reproduces.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise(function (resolve) {
        const server = http.createServer(function (req, res) {
            const u = req.url.split('?')[0];
            const f = require('path').join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !require('fs').existsSync(f) || require('fs').statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[require('path').extname(f)] || 'application/octet-stream' });
            res.end(require('fs').readFileSync(f));
        });
        server.listen(0, '127.0.0.1', function () { resolve({ server: server, port: server.address().port }); });
    });
}

const CODE = 'AIRPL1';
const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const FOUR = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
const ROUND = {
    eventName: 'Airplane Saturday', courseName: 'Dobson Ranch', players: FOUR,
    gameFormat: 'stroke', courseData: CD, scores: {}, settlementMode: 'whole-dollar',
    groupSizeOverrides: { 0: 4 }, ownerUid: 'me-uid'
};
const DB = { events: { [CODE]: ROUND }, trips: {}, global_courses: {}, tournaments: {} };

// THE QUEUE, AS THE PAGE SEES IT. Read out of localStorage by the module's own
// key, so a renamed key fails here rather than silently storing nothing.
// LABELLED, NOT POSITIONAL. The first version of this tool read its states by
// INDEX out of the step results, and adding one diagnostic step shifted every
// one of them - the same trap that made round_menu_swipe_test.js report a false
// failure, hit again here within the hour. Each read carries its own name.
const QUEUE = `(function () {
  var q = window.OfflineQueue, out = { label: '__LABEL__', module: !!q };
  try {
    out.key = q && q.STORAGE_KEY;
    out.raw = localStorage.getItem(q ? q.STORAGE_KEY : 'golfapp_wq_v1');
    out.count = out.raw ? JSON.parse(out.raw).length : 0;
    out.paths = out.raw ? JSON.parse(out.raw).map(function (o) { return o.path + '=' + o.value; }) : [];
    out.snapshotKeys = Object.keys(localStorage).filter(function (k) { return k.indexOf('golfapp_snap') === 0; });
  } catch (e) { out.error = String(e && e.message); }
  // WHAT THE GOLFER SEES, rendered - innerText, never textContent: this page
  // keeps its whole application in an inline script and textContent would match
  // these words in the SOURCE of a page that rendered nothing.
  var badge = document.getElementById('offline-badge');
  out.badge = badge && getComputedStyle(badge).display !== 'none'
      ? String(badge.innerText || '').trim() : null;
  out.boxes = document.querySelectorAll('.score-input').length;
  out.writable = document.querySelectorAll('.score-input:not([disabled])').length;
  out.filled = Array.prototype.slice.call(document.querySelectorAll('.score-input'))
      .filter(function (b) { return String(b.value || '').trim() !== ''; }).length;
  out.connecting = /Connecting to game/.test(String(document.body.innerText || ''));
  // WHAT THE DATABASE ACTUALLY RECEIVED, from the stand-in's own recorder: the
  // difference between "the drain never ran" and "it ran and nothing landed".
  out.dbWrites = (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path; }).slice(-12);
  out.onLine = navigator.onLine;
  return JSON.stringify(out);
})()`;

// TYPED, NOT ASSIGNED. A score box saves on input/change, and a value set from
// script without events is a value the page never heard about.
function typeInto(nth, value) {
    return { expression: `(function () {
        var b = document.querySelectorAll('#full-card-container .score-input')[${nth}]
             || document.querySelectorAll('.score-input')[${nth}];
        if (!b) return 'no box ' + ${nth};
        b.focus(); b.value = '${value}';
        b.dispatchEvent(new Event('input', { bubbles: true }));
        b.dispatchEvent(new Event('change', { bubbles: true }));
        b.blur();
        return 'typed ' + ${value} + ' into ' + (b.dataset ? b.dataset.playerId + '/' + b.dataset.hole : '?');
    })()` };
}

const out = { what: 'scores typed in airplane mode, across a reload and a restart' };
const fs = require('fs');
const os = require('os');
const path = require('path');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'airplane-'));

// THE DEVICE SAYS IT HAS NO NETWORK. For the RESTART arm the page has to believe
// it is offline from its first line, and CDP's offline emulation can only be
// applied after the navigation has already happened. This overrides what the
// BROWSER reports about the device - navigator.onLine - and nothing in the app:
// no page function is called, no page logic is replaced. The TYPING arm does not
// need it; that one uses the real Network.emulateNetworkConditions.
const PRETEND_OFFLINE = "try { Object.defineProperty(navigator, 'onLine', { get: function () { return false; }, configurable: true }); } catch (e) {}";

const queueRead = (label) => ({ expression: QUEUE.replace('__LABEL__', label) });
// BY NAME, LAST WINS, so a settle read or a diagnostic can be added anywhere.
const byLabel = (values) => {
    const out = {};
    values.filter(x => typeof x === 'string' && x.charAt(0) === '{').forEach((x) => {
        let v; try { v = JSON.parse(x); } catch (e) { return; }
        if (v && v.label) out[v.label] = v;
    });
    return out;
};
// OFFLINE IS TWO THINGS HERE, and it has to be both. CDP's emulation takes the
// BROWSER's network down, which is what navigator.onLine and the page react to;
// the stand-in database lives IN the page, so it needs telling separately or it
// keeps answering instantly from memory and the queue is never exercised at all
// (measured: 7 scores typed in airplane mode, 0 queued, and a check that would
// have reported success). __coldOffline makes its writes never settle, which is
// what the real SDK was measured doing.
const GO_OFFLINE = [
    { cdp: { method: 'Network.emulateNetworkConditions', params: {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } } },
    { expression: 'window.__coldSetOffline(true); "db offline, and it stays offline across a reload"' }
];
const GO_ONLINE = { cdp: { method: 'Network.emulateNetworkConditions', params: {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } } };

let PAGE_URL = null;
(async () => {
    const served = await serveRepo(require('path').join(__dirname, '..'));
    PAGE_URL = 'http://127.0.0.1:' + served.port + '/index.html?game=' + CODE;
    out.servedFrom = PAGE_URL;
    try {
        // ---- 1,2,3,4: online -> offline -> seven scores -> RELOAD -----------
        const typed = [];
        for (let i = 0; i < 7; i++) typed.push(typeInto(i, 3 + (i % 4)));
        const first = await arriveCold({
            url: PAGE_URL,
            db: DB, auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
            settleMs: 3200, profileDir: PROFILE,
            steps: [
                queueRead('onArrival'),
                { expression: "(function(){ var b=document.getElementById('view-mode-full-btn'); if (b) b.click(); return 'full card'; })()" },
                { sleep: 700 }
            ].concat(GO_OFFLINE).concat([
                { sleep: 400 }
            ]).concat(typed).concat([
                { sleep: 1500 },
                queueRead('afterTyping'),
                // THE APP CLOSED AND REOPENED, STILL OFFLINE. Before this wave
                // the seven scores were gone at exactly this point.
                //
                // THE BROWSER'S NETWORK COMES BACK FOR THE RELOAD ITSELF, and the
                // DATABASE stays offline. Measured with CDP offline left on: the
                // document could not be fetched at all and the page rendered
                // nothing (0 boxes), which is a true fact about a web page with
                // no service worker and NOT the case under test here. On a phone
                // the shell is always available - local files inside the app,
                // the precached shell on the web (sw.js lists index.html, which
                // pwa_activation_test.js pins) - so the honest reproduction is a
                // shell that loads and a server that still cannot be reached.
                { cdp: { method: 'Network.emulateNetworkConditions', params: {
                    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } } },
                { cdp: { method: 'Page.reload', params: {} } },
                { sleep: 3500 },
                queueRead('afterReload'), { sleep: 600 }, queueRead('afterReload'),
                // AND AFTER THE WRITE TIMEOUT (12s in index.html). The drain is
                // genuinely in flight before that, so "Sending..." is true then;
                // what must not happen is the word STAYING once the drain has
                // given up. This read is the one that catches a stuck badge.
                { sleep: 13000 }, queueRead('afterReloadSettled')
            ])
        });
        if (!first.ok) throw new Error('first arrival: ' + first.reason);
        const s1 = byLabel(first.value);
        out.a_online_onArrival = { badge: s1.onArrival.badge, boxes: s1.onArrival.boxes, snapshots: s1.onArrival.snapshotKeys };
        out.b_offline_afterTyping = { queued: s1.afterTyping.count, badge: s1.afterTyping.badge,
                                      filledBoxes: s1.afterTyping.filled, paths: s1.afterTyping.paths };
        out.c2_badgeAfterTimeout = { queued: s1.afterReloadSettled.count,
                                     badge: s1.afterReloadSettled.badge };
        out.c_offline_afterReload = { queued: s1.afterReload.count, badge: s1.afterReload.badge,
                                      boxes: s1.afterReload.boxes, filledBoxes: s1.afterReload.filled,
                                      stillConnecting: s1.afterReload.connecting, paths: s1.afterReload.paths };
        out.typedResults = first.value.filter(v => typeof v === 'string' && v.indexOf('typed ') === 0).length;

        // ---- 5: THE PHONE RESTARTS - a new process over the same disk --------
        // CHROME'S OWN LOCK HAS TO GO FIRST. A profile directory carries
        // SingletonLock/SingletonSocket/SingletonCookie pointing at the process
        // that had it; a second Chrome over the same directory sees them, decides
        // another instance owns the profile, and exits without ever opening a
        // debugging target ("Chrome exposed no page target" - measured). A phone
        // restart does not inherit a lock from a process that no longer exists,
        // so removing them is the honest part of the simulation.
        ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].forEach(function (f) {
            try { fs.rmSync(path.join(PROFILE, f), { force: true, recursive: true }); } catch (e) {}
        });
        await new Promise(function (r) { setTimeout(r, 600); });
        // The round is deliberately ABSENT from the stand-in database here: the
        // server tells this phone nothing, which is what no signal looks like.
        // Everything on screen has to come off the disk.
        const restart = await arriveCold({
            url: PAGE_URL,
            db: { events: {}, trips: {}, global_courses: {}, tournaments: {} },
            auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
            settleMs: 3800, profileDir: PROFILE, preScript: PRETEND_OFFLINE,
            steps: [{ sleep: 1200 }, queueRead('afterRestart')]
        });
        if (!restart.ok) throw new Error('restart arrival: ' + restart.reason);
        const s2 = byLabel(restart.value).afterRestart;
        out.d_afterRestart = { queued: s2.count, badge: s2.badge, boxes: s2.boxes,
                               filledBoxes: s2.filled, stillConnecting: s2.connecting,
                               paths: s2.paths, snapshots: s2.snapshotKeys };

        // ---- 6: signal comes back and the queue drains ----------------------
        // ---- 6: THE GOLFER REOPENS THE APP IN SIGNAL -------------------------
        // The offline flag is cleared in preScript, BEFORE any page script runs,
        // so this page is online from its first line - which is what reopening
        // the app back at the clubhouse actually looks like. (The first version
        // cleared it in a STEP, i.e. after the 4s settle, so the page's arrival
        // drain had already fired into a dead socket and was sitting on a write
        // that never settles. That measured one write and a stuck badge - real
        // behaviour, wrong scenario, and it is arm 7 below on purpose.)
        const back = await arriveCold({
            url: PAGE_URL,
            db: DB, auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
            settleMs: 4000, profileDir: PROFILE,
            // THE LIVE FLAG, NOT JUST THE KEY. cold-arrival injects the stand-in
            // database BEFORE preScript, and it reads __coldOffline out of
            // localStorage at that moment - so removing the key here left
            // window.__coldOffline already true and this arm stayed offline
            // (measured: one write, stuck badge, again).
            preScript: "try { localStorage.removeItem('__coldOffline'); } catch (e) {} "
                     + "if (window.__coldSetOffline) window.__coldSetOffline(false); else window.__coldOffline = false;",
            steps: [{ sleep: 4000 }, queueRead('backOnline'), { sleep: 2000 }, queueRead('backOnline'),
                    ]
        });
        if (!back.ok) throw new Error('reconnect arrival: ' + back.reason);
        const s3 = byLabel(back.value).backOnline;
        out.e_backOnline = { queued: s3.count, badge: s3.badge, writesSeenByDb: s3.dbWrites };
        // WHAT THE DATABASE RECEIVED, from the stand-in's own recorder. There is
        // no fixture global to read (cold-arrival keeps it in a closure), and the
        // recorder is the honest answer to "did the scores actually go": seven
        // score paths written after the reconnect, not six and not eight.
        out.e_scoresWritten = (s3.dbWrites || []).filter(w => /\/scores\//.test(w));
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
        try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
    }

    const b = out.b_offline_afterTyping || {}, c = out.c_offline_afterReload || {},
          d = out.d_afterRestart || {}, e = out.e_backOnline || {};
    out.ok = !out.error
        && b.queued === 7                       // seven scores queued offline
        && /7 waiting/.test(String(b.badge))    // and the badge says seven
        && c.queued === 7                       // STILL SEVEN after the reload
        && /waiting/.test(String((out.c2_badgeAfterTimeout || {}).badge))  // and not stuck on Sending
        && c.boxes > 0 && c.stillConnecting === false   // and the round opened
        && d.queued === 7                       // STILL SEVEN after a restart
        && d.boxes > 0                          // and it opened from the disk
        && e.queued === 0                       // drained when signal returned
        // THE BADGE IS EITHER "Synced" OR ALREADY GONE, and both are right: it
        // shows the tick for two seconds after the last op lands and then
        // collapses, because a permanent row of it moved the hole heading 58px
        // down the page. Asserting the word alone would fail on the correct
        // behaviour, which is exactly what it did when this was tightened.
        && (e.badge === null || /Synced/.test(String(e.badge)))
        && (out.e_scoresWritten || []).length === 7;   // and all seven reached the db
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
