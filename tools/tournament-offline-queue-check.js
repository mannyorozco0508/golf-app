#!/usr/bin/env node
// ============================================================================
// THE SCORECARD'S SAVED QUEUE, IN A REAL BROWSER AGAINST THE REAL RULES
// (2026-11-07)
//
// tournament_offline_queue_test.js proves the page's queue logic in a realm.
// A realm cannot prove the part that matters: that a score typed with no
// signal is still there after the BROWSER PROCESS is gone, and that the
// replay the next process makes is accepted by the rules on a locked event.
// So this opens the real tournament-scorecard.html with its real Firebase SDK
// against the database emulator running the rules file given (default: the
// LIVE+lock candidate), and models a phone restart as a second Chrome process
// over the SAME profile directory (tools/lib/cold-arrival.js profileDir).
//
// ARM A  keyed link, online -> card renders -> signal lost (the SDK's own
//        goOffline: a dead socket, not a page function) -> five edits typed
//        into the card's boxes (h1=4, h2=5, h3=6, h2 cleared, h1=3) -> the
//        process is killed. Server must hold none of them.
// ARM B  same profile, NEW process, the emulator still unreachable (its URL
//        blocked): the queue must still be in storage and the card cannot
//        open. Then the block is lifted - signal back - and nothing else is
//        touched. Server must end with team1_h1=3, team1_h3=6, NO team1_h2,
//        each with a proof whose t is the server's clock; storage empty.
// ARM C  a link carrying the WRONG team's key: a score typed offline, process
//        killed, reopened online. The rules refuse the replay; the card must
//        show the existing red refusal, the queue must be empty, and the
//        server must hold nothing for that hole.
//
// THE APP IS CLOSED, NOT SHOT: every arm ends with Browser.close (cold-arrival
// closeBrowser). A SIGTERM'd headless Chrome with the real SDK connected was
// measured losing localStorage written 5 s+ after load; see cold-arrival.js.
// What a phone's OS does to an app killed mid-commit is not proven here.
//
// Nothing the page defines is called. Typing is the DOM's: value + a change
// event on the box the card rendered, which runs the card's own onchange.
//
//   node tools/tournament-offline-queue-check.js [rules.json]
//   exit 0 PASS   exit 1 an arm diverged   exit 2 could not run (NOTHING PROVEN)
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { arriveCold } = require('./lib/cold-arrival.js');
const { startEmulator } = require('./lib/db-emulator.js');

const CANDIDATE = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox', 'TOURNAMENTS-RULES-CANDIDATE-live-plus-lock.json');
const RULES = path.resolve(process.argv[2] || (fs.existsSync(CANDIDATE) ? CANDIDATE : path.join(__dirname, '..', 'database.rules.json')));
const PORT = 9476;
const QKEY = 'rattle_tournament_scores_wq_v1';
const K1 = 'k1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', K2 = 'k2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const SEED = {
    tournaments: {
        LOCKQ: { name: 'Queue Day', format: 'scramble', courseName: 'Tidewater', ownerUid: 'u-org', createdAt: 1, courseData: COURSE,
            teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 } } }
    },
    tournamentKeys: { LOCKQ: { on: true, t: { team1: K1, team2: K2 } } }
};
// SERVED OVER http, NOT file:// - a file:// page has an opaque origin and its
// localStorage does not survive the process (tools/airplane-mode-check.js
// measured that first). One server for the whole run, so every arm is the
// same origin, as one phone's app is.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}
const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };

const typeHole = (n, v) => ({ expression: `(function () {
  var i = document.querySelectorAll('#holes-list input')[${n - 1}];
  if (!i) return 'no box for hole ${n}';
  i.value = ${JSON.stringify(String(v))};
  i.dispatchEvent(new Event('change', { bubbles: true }));
  return 'typed h${n}=' + ${JSON.stringify(String(v))};
})()` });
const READ = { expression: `JSON.stringify({ queue: JSON.parse(localStorage.getItem(${JSON.stringify(QKEY)}) || '[]'),
  keys: Object.keys(localStorage), origin: location.origin, boxes: document.querySelectorAll('#holes-list input').length,
  saveState: (document.getElementById('save-state') || {}).innerText || '' })` };
const OFFLINE = { expression: `(firebase.database().goOffline(), 'socket down')` };

(async () => {
    if (!fs.existsSync(RULES)) bail('no rules file ' + RULES);
    let emu;
    try { emu = await startEmulator({ rulesPath: RULES, port: PORT, ns: 'offq' }); }
    catch (e) { bail('could not start the emulator: ' + e.message); }
    await emu.admin('PUT', '', SEED);
    const served = await serveRepo(path.join(__dirname, '..'));
    const pageUrl = (q) => 'http://127.0.0.1:' + served.port + '/tournament-scorecard.html?' + q;
    const failures = [];
    const out = { rules: RULES, emulatorOnlyTransform: emu.transformed + ' x registrations email regex' };
    const parse = (s) => { try { return JSON.parse(s); } catch (e) { return { unparsed: String(s).slice(0, 200) }; } };
    const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), 'offq-' + n + '-'));
    const run = (q, profileDir, steps, extra) => arriveCold(Object.assign({ url: pageUrl(q), emulator: emu.url, profileDir, steps, settleMs: 1500, closeBrowser: true }, extra || {}));
    const untilBoxes = [{ sleep: 9000 }];

    // ---- ARM A ----
    const P = tmp('a');
    const t0 = Date.now();
    const a = await run('tourney=LOCKQ&team=1&k=' + K1, P, [...untilBoxes, READ, OFFLINE, { sleep: 500 },
        typeHole(1, 4), typeHole(2, 5), typeHole(3, 6), typeHole(2, ''), typeHole(1, 3), { sleep: 10000 }, READ]);
    if (!a.ok) bail('arm A did not run: ' + a.reason);
    const aBefore = parse(a.value[1]), aAfter = parse(a.value[a.value.length - 1]);
    if (!aBefore.boxes) bail('arm A: the card never rendered online, so nothing below means anything', aBefore);
    const serverA = await emu.admin('GET', 'tournaments/LOCKQ/scores');
    out.armA = { typed: a.value.slice(3, 8), boxes: aBefore.boxes, queuedAtClose: aAfter.queue.map((o) => [o.type, o.path.split('/').pop(), o.value && o.value.score]), serverAfterClose: serverA };
    if (serverA !== null) failures.push('A: the server got scores while the socket was down: ' + JSON.stringify(serverA));
    if (aAfter.queue.length !== 3) failures.push('A: expected 3 queued ops (h1, h2 cleared, h3), got ' + aAfter.queue.length);
    if (/"t":/.test(JSON.stringify(aAfter.queue))) failures.push('A: a proof time was stored on the phone');

    // ---- ARM B ----
    // NO SIGNAL ON THE SECOND PROCESS EITHER, until the step that lifts it:
    // the emulator's URL is blocked (long-poll) and a stand-in WebSocket
    // refuses to connect while window.__offqNoSignal is set - the harness's
    // model of no bars, installed before any page script. setBlockedURLs alone
    // does not stop a WebSocket (measured: the card opened at 1.5 s).
    const tAEnd = Date.now();
    const host = '*127.0.0.1:' + PORT + '*';
    const NO_SIGNAL = `(function () {
      var Real = window.WebSocket; window.__offqNoSignal = true;
      function W(u, p) { return window.__offqNoSignal ? new Real('ws://127.0.0.1:9/') : (p === undefined ? new Real(u) : new Real(u, p)); }
      W.prototype = Real.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { W[k] = Real[k]; });
      window.WebSocket = W;
    })();`;
    const b = await run('tourney=LOCKQ&team=1&k=' + K1, P, [{ sleep: 4000 }, READ,
        { expression: '(window.__offqNoSignal = false, "signal back")' },
        { cdp: { method: 'Network.setBlockedURLs', params: { urls: [] } } }, { sleep: 30000 }, READ], { blockUrls: [host], preScript: NO_SIGNAL });
    if (!b.ok) bail('arm B did not run: ' + b.reason);
    const bBlocked = parse(b.value[1]), bAfter = parse(b.value[b.value.length - 1]);
    const serverB = await emu.admin('GET', 'tournaments/LOCKQ/scores');
    const proofs = await emu.admin('GET', 'scoreProofs/LOCKQ');
    const t1 = Date.now();
    out.armB = { whileNoSignal: { queued: bBlocked.queue.length, boxes: bBlocked.boxes, saveState: bBlocked.saveState },
        afterSignal: { queued: bAfter.queue.length, boxes: bAfter.boxes, saveState: bAfter.saveState }, server: serverB, proofs, armAEndedAt: tAEnd };
    if (bBlocked.queue.length !== 3) failures.push('B: the queue did not survive the restart: ' + bBlocked.queue.length + ' ops');
    if (bBlocked.boxes !== 0) failures.push('B: the card opened while there was meant to be no signal - this arm did not model a reload offline');
    if (!bAfter.boxes) failures.push('B: the card never opened after signal came back');
    const want = { team1_h1: 3, team1_h3: 6 };
    if (JSON.stringify(serverB) !== JSON.stringify(want)) failures.push('B: server holds ' + JSON.stringify(serverB) + ', wanted ' + JSON.stringify(want));
    if (bAfter.queue.length !== 0) failures.push('B: ' + bAfter.queue.length + ' ops still queued after the replay');
    // THE CLEAR WENT THROUGH THE RULES TOO, with its own proof; and every
    // proof's t is the server's clock AT REPLAY - after process A had ended.
    ['team1_h1', 'team1_h2', 'team1_h3'].forEach((k) => {
        const p = proofs && proofs[k];
        if (!p || p.k !== K1 || p.who !== 'team1' || !(p.t >= tAEnd - 2000 && p.t <= t1 + 2000)) failures.push('B: proof for ' + k + ' is not a replay-time server proof with the link key: ' + JSON.stringify(p));
    });

    // ---- ARM C ----
    const Q = tmp('c');
    const c1 = await run('tourney=LOCKQ&team=1&k=' + K2, Q, [...untilBoxes, READ, OFFLINE, { sleep: 500 }, typeHole(9, 4), { sleep: 3000 }, READ]);
    if (!c1.ok) bail('arm C (offline half) did not run: ' + c1.reason);
    const c1After = parse(c1.value[c1.value.length - 1]);
    if (!parse(c1.value[1]).boxes) bail('arm C: the card never rendered online', c1.value);
    const c2 = await run('tourney=LOCKQ&team=1&k=' + K2, Q, [{ sleep: 12000 }, READ, { sleep: 22000 }, READ]);
    if (!c2.ok) bail('arm C (replay half) did not run: ' + c2.reason);
    const c2After = parse(c2.value[1]), c2Later = parse(c2.value[3]);
    const serverC = await emu.admin('GET', 'tournaments/LOCKQ/scores/team1_h9');
    out.armC = { queuedAtClose: c1After.queue.length, afterReplay: c2After, after22sMore: { queued: c2Later.queue.length, saveState: c2Later.saveState }, serverTeam1H9: serverC };
    if (c1After.queue.length !== 1) failures.push('C: the wrong-key score was not queued offline');
    if (serverC !== null) failures.push('C: the rules ACCEPTED a wrong-key replay: ' + serverC);
    if (c2After.queue.length !== 0) failures.push('C: the refused op is still queued (would retry forever)');
    if (!/Not saved/.test(c2After.saveState)) failures.push('C: the card did not say Not saved: ' + JSON.stringify(c2After.saveState));
    if (c2Later.queue.length !== 0 || !/Not saved/.test(c2Later.saveState)) failures.push('C: 22 s later the queue or the refusal changed: ' + JSON.stringify(c2Later));

    emu.stop();
    served.server.close();
    [P, Q].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
    console.log(JSON.stringify(Object.assign({ verdict: failures.length ? 'FAIL' : 'PASS', failures }, out), null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));
