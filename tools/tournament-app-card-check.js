#!/usr/bin/env node
// ============================================================================
// THE IN-APP CARD AND BOARD, COLD, IN A REAL BROWSER (P1-c T1A, P1-d T2C,
// 2026-11-10). Modelled on tools/tournament-scorecard-wired-check.js.
//
// Opens tournament-scorecard.html?...&app=1 at 390x844 the way a golfer
// arrives and touches nothing the page defines: taps are real CDP mouse
// presses (cold-arrival's { tap }), reads are innerText and rects. The only
// harness calls are the stand-in's own (__coldSetOffline; a { deliver } step
// that plays the server's echo of a saved score).
//
// ARM SIZE   untouched scramble card: the Save button and the -/+ stepper are
//            on screen WITHOUT scrolling, not 0x0, and at least 44px tall
//            (a thumb). Then -, Save, the server's echo: "Hole 7 · Par 4",
//            "Hole 6 saved", the team's to-par moved.         -> P1c-scramble.png
// ARM BB     best ball: three golfer rows, each stepper sized.  -> P1c-bestball.png
// ARM WAIT   airplane mode: Save -> "1 waiting for signal".     -> P1c-waiting.png
// ARM BOARD  "See all ›" tapped: 5th, the tie, around you.     -> P1d-board.png
// ARM FLIGHT the same board on a flighted event: 3rd in A Flight. -> P1d-board-flight.png
// ARM WEB    the same link with no ?app=1: the website card.  -> P1c-website-unchanged.png
// ARM LOCK   real SDK against the database emulator running the rules
//            (default the LIVE+lock candidate, as the wired check): a keyed
//            app link saves (the server holds it); the same card WITHOUT
//            the key (hole 8, next after the keyed save of 7) is refused - the
//            lock sentence on the app screen, the server holds no hole 8, and
//            hole 8 is next to play again.
//
// Screenshots go to SHOTS (default the shared mailbox screens-phase1 folder).
//
//   node tools/tournament-app-card-check.js [rules.json]
//   exit 0 PASS   exit 1 an arm diverged   exit 2 could not run (NOTHING PROVEN)
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { startEmulator } = require('./lib/db-emulator.js');
const F = require('../helpers/app-card-fixtures.js');

const CANDIDATE = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox', 'TOURNAMENTS-RULES-CANDIDATE-live-plus-lock.json');
const RULES = path.resolve(process.argv[2] || (fs.existsSync(CANDIDATE) ? CANDIDATE : path.join(__dirname, '..', 'database.rules.json')));
const SHOTS = process.env.SHOTS || path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens-phase1');
const PORT = 9481;
const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return { unparsed: String(s).slice(0, 300) }; } };
const shot = (name) => ({ shot: path.join(SHOTS, name), viewportOnly: true });
const objs = (v) => v.filter((x) => typeof x === 'string' && x[0] === '{').map(parse);
const shotsOf = (v) => v.filter((x) => typeof x === 'string' && x.indexOf('shot ') === 0);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const f = path.join(root, req.url.split('?')[0].replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// The mockup's moment: holes 4 and 5 in, hole 6 about to be saved.
function mockupDb() {
    const db = F.scrambleDb();
    delete db.tournaments.SCR.scores.team4_h6;
    return db;
}
const sized = (r, vh) => !!r && r.w > 0 && r.h >= 44 && r.top >= 0 && r.bottom <= vh;

(async () => {
    try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { bail('cannot write screenshots to ' + SHOTS); }
    const failures = [];
    const out = { rules: RULES, shots: [] };
    const fail = (arm, why, got) => failures.push(arm + ': ' + why + (got === undefined ? '' : ' - got ' + JSON.stringify(got)));
    const q = 'tourney=SCR&team=4&app=1&k=' + F.KEY4;

    // ---- ARM SIZE ----
    const echo = mockupDb().tournaments.SCR;
    echo.scores.team4_h6 = 3;
    const s = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), db: mockupDb(), settleMs: 1500,
        steps: [F.READ_APP, { tap: '#ap-score .ap-minus' }, { tap: '#ap-save' }, { sleep: 300 },
            { deliver: { path: 'tournaments/SCR', value: echo } }, { sleep: 300 }, F.READ_APP, F.WRITES, shot('P1c-scramble.png')] });
    if (!s.ok) bail('arm SIZE did not run: ' + s.reason);
    const [s0, s1] = objs(s.value);
    if (!s0.appShown) bail('arm SIZE: the app view never rendered, so nothing below means anything', s0);
    out.armSize = { untouched: { next: s0.next, steppers: s0.steppers, save: s0.saveRect, plus: s0.plusRect, minus: s0.minusRect, vh: s0.vh },
        afterSave: { next: s1.next, chip: s1.chip, topar: s1.topar, place: s1.place }, writes: parse(s.value[7]) };
    out.shots.push(...shotsOf(s.value));
    if (s0.next !== 'Hole 6 · Par 4') fail('SIZE', 'untouched next hole', s0.next);
    if (!sized(s0.saveRect, s0.vh)) fail('SIZE', 'Save is not on screen at a thumb size without scrolling', s0.saveRect);
    if (!sized(s0.plusRect, s0.vh) || !sized(s0.minusRect, s0.vh)) fail('SIZE', 'the stepper is not on screen at a thumb size', [s0.plusRect, s0.minusRect]);
    if (s1.next !== 'Hole 7 · Par 4' || s1.chip !== 'Hole 6 saved') fail('SIZE', 'after Save', [s1.next, s1.chip]);
    if (s1.topar !== '−3' || s1.place !== '5th of 18') fail('SIZE', 'the echo did not move the to-par/place', [s1.topar, s1.place]);

    // ---- ARM BB ----
    const bb = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=BBL&team=3&app=1'), db: F.bestBallDb(), settleMs: 1500,
        steps: [{ tap: '#ap-score .ap-plus', nth: 1 }, { sleep: 150 }, F.READ_APP, { expression: `JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#ap-score .ap-plus, #ap-score .ap-minus'), function (b) { var r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }))` }, shot('P1c-bestball.png')] });
    if (!bb.ok) bail('arm BB did not run: ' + bb.reason);
    const b0 = parse(bb.value[2]), bRects = parse(bb.value[3]);
    out.armBB = { golfers: b0.golfers, steppers: b0.steppers, buttons: bRects.length };
    out.shots.push(...shotsOf(bb.value));
    if (JSON.stringify(b0.golfers) !== JSON.stringify(['Ann Lee', 'Bo Park', 'Cy Diaz'])) fail('BB', 'golfer rows', b0.golfers);
    if (bRects.length !== 6 || !bRects.every((r) => sized(r, b0.vh))) fail('BB', 'six on-screen stepper buttons of 44px+', bRects);
    if (!sized(b0.saveRect, b0.vh)) fail('BB', 'Save not on screen', b0.saveRect);

    // ---- ARM WAIT ----
    const wdb = mockupDb(); wdb['.info'] = { connected: false };
    const w = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), db: wdb, settleMs: 1500,
        steps: [F.OFFLINE, { tap: '#ap-score .ap-minus' }, { tap: '#ap-save' }, { sleep: 400 }, F.READ_APP, F.QUEUE, shot('P1c-waiting.png')] });
    if (!w.ok) bail('arm WAIT did not run: ' + w.reason);
    const w0 = parse(w.value[4]), wq = parse(w.value[5]);
    out.armWait = { chip: w0.chip, chipClass: w0.chipClass, next: w0.next, queued: wq.length };
    out.shots.push(...shotsOf(w.value));
    if (w0.chip !== '1 waiting for signal' || !/ap-am/.test(w0.chipClass || '')) fail('WAIT', 'chip', [w0.chip, w0.chipClass]);
    if (wq.length !== 1) fail('WAIT', 'one op queued on the phone', wq);

    // ---- ARM BOARD ----
    const bo = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), db: F.scrambleDb(), settleMs: 1500,
        steps: [{ tap: '#ap-board-line' }, { sleep: 200 }, F.READ_APP, shot('P1d-board.png')] });
    if (!bo.ok) bail('arm BOARD did not run: ' + bo.reason);
    const o0 = parse(bo.value[2]);
    out.armBoard = { big: o0.placeBig, line: o0.placeLine, tie: o0.tie, around: o0.around, seeAll: o0.seeAll };
    out.shots.push(...shotsOf(bo.value));
    if (o0.placeBig !== '5th' || o0.tie !== 'Team 15 is level with you (−3)' || o0.around.length !== 5) fail('BOARD', 'place/tie/around', out.armBoard);

    // ---- ARM FLIGHT ----
    const fdb = F.scrambleDb({ flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } } });
    Object.keys(fdb.tournaments.SCR.teams).forEach((k) => { fdb.tournaments.SCR.teams[k].flightId = ['team12', 'team7', 'team4', 'team11', 'team3'].includes(k) ? 'fA' : 'fB'; });
    const fl = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), db: fdb, settleMs: 1500,
        steps: [{ tap: '#ap-board-line' }, { sleep: 200 }, F.READ_APP, shot('P1d-board-flight.png')] });
    if (!fl.ok) bail('arm FLIGHT did not run: ' + fl.reason);
    const f0 = parse(fl.value[2]);
    out.armFlight = { big: f0.placeBig, flight: f0.placeFlight, line: f0.placeLine, seeAll: f0.seeAll };
    out.shots.push(...shotsOf(fl.value));
    if (f0.placeBig !== '3rd' || f0.placeFlight !== 'in A Flight') fail('FLIGHT', 'place in flight', out.armFlight);

    // ---- ARM WEB ----
    const web = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=SCR&team=4&k=' + F.KEY4), db: F.scrambleDb(), settleMs: 1500,
        steps: [F.READ_APP, { expression: 'window.scrollTo(0, 0), "top"' }, shot('P1c-website-unchanged.png')] });
    if (!web.ok) bail('arm WEB did not run: ' + web.reason);
    const e0 = parse(web.value[0]);
    out.armWeb = { appMode: e0.appMode, appShown: e0.appShown, webCardShown: e0.webCardShown, status: e0.webStatus };
    out.shots.push(...shotsOf(web.value));
    if (e0.appMode || e0.appShown || !e0.webCardShown) fail('WEB', 'the website card is not the plain card', out.armWeb);

    // ---- ARM LOCK (real SDK, emulator, the rules) ----
    if (!fs.existsSync(RULES)) { out.armLock = 'NOT RUN: no rules file ' + RULES; }
    else {
        let emu = null;
        try { emu = await startEmulator({ rulesPath: RULES, port: PORT, ns: 'appcard' }); }
        catch (e) { out.armLock = 'NOT RUN: ' + e.message; }
        if (emu) {
            const K = 'k4-eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
            const rec = F.scrambleDb().tournaments.SCR;
            Object.assign(rec, { ownerUid: 'u-org', createdAt: 1 });
            await emu.admin('PUT', '', { tournaments: { SCR: rec }, tournamentKeys: { SCR: { on: true, t: { team4: K } } } });
            const served = await serveRepo(path.join(__dirname, '..'));
            const url = (qq) => 'http://127.0.0.1:' + served.port + '/tournament-scorecard.html?' + qq;
            const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), 'appcard-' + n + '-'));
            const P1 = tmp('k'), P2 = tmp('nok');
            const keyed = await arriveCold({ url: url('tourney=SCR&team=4&app=1&k=' + K), emulator: emu.url, profileDir: P1, settleMs: 1500, closeBrowser: true,
                steps: [{ sleep: 7000 }, F.READ_APP, { tap: '#ap-save' }, { sleep: 3000 }, F.READ_APP] });
            const h7 = await emu.admin('GET', 'tournaments/SCR/scores/team4_h7');
            const bare = await arriveCold({ url: url('tourney=SCR&team=4&app=1'), emulator: emu.url, profileDir: P2, settleMs: 1500, closeBrowser: true,
                steps: [{ sleep: 7000 }, { tap: '#ap-score .ap-plus' }, { tap: '#ap-save' }, { sleep: 3000 }, F.READ_APP, shot('P1c-lock-refused.png')] });
            const h8 = await emu.admin('GET', 'tournaments/SCR/scores/team4_h8');
            emu.stop(); served.server.close();
            [P1, P2].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
            if (!keyed.ok || !bare.ok) { out.armLock = 'NOT RUN: ' + (keyed.reason || bare.reason); }
            else {
                const k0 = parse(keyed.value[1]), k1 = parse(keyed.value[4]), n0 = parse(bare.value[4]);
                out.armLock = { keyed: { before: k0.next, after: k1.next, chip: k1.chip, serverH7: h7 },
                    noKey: { next: n0.next, chip: n0.chip, serverH8: h8 } };
                out.shots.push(...shotsOf(bare.value));
                if (!k0.next) fail('LOCK', 'the keyed card never rendered against the emulator', k0);
                if (h7 !== 4 || k1.next !== 'Hole 8 · Par 3') fail('LOCK', 'the keyed app save did not land', out.armLock.keyed);
                if (h8 !== null) fail('LOCK', 'the keyless save of hole 8 reached the server', h8);
                if (n0.chip !== "⚠️ Not saved — this link can't score this card. Ask the organizer for your team's link.") fail('LOCK', 'the refusal sentence', n0.chip);
                if (n0.next !== 'Hole 8 · Par 3') fail('LOCK', 'the refused hole is not next to play again', n0.next);
            }
        }
    }
    if (typeof out.armLock === 'string') fail('LOCK', out.armLock);

    console.log(JSON.stringify(Object.assign({ verdict: failures.length ? 'FAIL' : 'PASS', failures }, out), null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));
