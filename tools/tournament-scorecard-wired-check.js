#!/usr/bin/env node
// ============================================================================
// THE WIRED SCORECARD, COLD, IN A REAL BROWSER (2026-11-08)
// Mockups A2 (shotgun next hole), A3 (golfer board with flights) and J4
// (waiting chip), approved by Manny 2026-11-08.
//
// tournament_scorecard_wired_test.js proves the card's logic in mini-dom,
// which cannot see what is applied to LIVE rows after render (the "played" /
// "next to play" labels, the is-next stripe), cannot scroll, and cannot tap.
// This opens the real page at the URL a golfer gets and touches nothing the
// page defines: no render, pick or save function is called. Typing is the
// DOM's (a value plus a change event on the box the card rendered, which runs
// the card's own onchange); a tap is a real CDP mouse press on the element.
//
// ARM A2   real SDK against the database emulator (the rules given, default
//          the LIVE+lock candidate, as tools/tournament-offline-queue-check.js).
//          A shotgun team on hole 8, keyed link. Untouched: "Enter Hole 8",
//          rows 8..18 then 1..7, row 8 striped "next to play", the play-order
//          note. Hole 8 typed as 3: the SDK's own local event re-renders the
//          card - "Next: Hole 9 · Par 4", "Thru 1 · 3 strokes · E", row 8
//          "played", row 9 striped "next to play", and row 9 on screen.
// ARM J4   same emulator, a team with no tee. The socket is taken down with
//          the SDK's own goOffline (not a page function), two holes typed:
//          "2 waiting for signal" shown. goOnline: the chip is gone and the
//          server holds both scores.
// ARM A3   cold-arrival stand-in (read-only board). A two-round flighted event
//          on a group link in B Flight: the Leaderboard tab tapped, B Flight ★
//          chip ON by default, only B golfers, both marked (You); then the
//          "Event (2 rounds)" button tapped - the event standings.
// ARM DEF  stand-in. One round, no flights, no tee, team link, touch nothing:
//          "Enter Hole 1", rows 1..18, no note, no chip; Leaderboard tapped -
//          no chips, no switch, no note.
//
// Screenshots (390x844 viewport, 2x) go to SHOTS (default the shared mailbox
// screens folder): A2-wired-*.png, J4-wired-*.png, A3-wired-*.png, default-*.png.
//
//   node tools/tournament-scorecard-wired-check.js [rules.json]
//   exit 0 PASS   exit 1 an arm diverged   exit 2 could not run (NOTHING PROVEN)
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { startEmulator } = require('./lib/db-emulator.js');

const CANDIDATE = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox', 'TOURNAMENTS-RULES-CANDIDATE-live-plus-lock.json');
const RULES = path.resolve(process.argv[2] || (fs.existsSync(CANDIDATE) ? CANDIDATE : path.join(__dirname, '..', 'database.rules.json')));
const SHOTS = process.env.SHOTS || path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens');
const PORT = 9477;
const K7 = 'k7-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', K1 = 'k1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PARS = [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];   // the mockup's: 8 par 3, 9 par 4
const COURSE = PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 }));
const SEED = {
    tournaments: {
        SHOT: { name: 'Rattle Classic', format: 'scramble', courseName: 'Tidewater', ownerUid: 'u-org', createdAt: 1, courseData: COURSE,
            startType: 'shotgun', teams: {
                team7: { num: 7, name: 'Bell / Shaw', players: ['Pat Bell', 'Lee Shaw'], handicap: 0, startingHole: '8' },
                team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0, startingHole: '1' } } },
        QUE: { name: 'Rattle Classic', format: 'scramble', courseName: 'Tidewater', ownerUid: 'u-org', createdAt: 1, courseData: COURSE,
            teams: { team4: { num: 4, name: 'Lopez / Kim', players: ['Al Lopez', 'Jo Kim'], handicap: 0 } } }
    },
    tournamentKeys: { SHOT: { on: true, t: { team7: K7 } }, QUE: { on: true, t: { team4: K1 } } }
};

const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const thru = (pid, v, n) => { const s = {}; for (let h = 1; h <= n; h++) s[`${pid}_h${h}`] = v; return s; };
const FLIGHTS = { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } };
const PLAYERS = {
    pA: { id: 'pA', name: 'Ana Diaz', handicap: '4', flightId: 'fA' }, pB: { id: 'pB', name: 'Joe Fox', handicap: '6', flightId: 'fA' },
    pC: { id: 'pC', name: 'Sam Kim', handicap: '12', flightId: 'fB' }, pD: { id: 'pD', name: 'Dana Ruiz', handicap: '15', flightId: 'fB' },
    pE: { id: 'pE', name: 'Lee Park', handicap: '14', flightId: 'fB' } };
const GROUPS = { g1: { name: 'Group 1', playerIds: ['pA', 'pB'] }, g2: { name: 'Group 2', playerIds: ['pC'] }, g3: { name: 'Group 3', playerIds: ['pD', 'pE'] } };
const rnd = (name, at, scores) => ({ name, status: 'open', format: 'individual', scoringMode: 'gross', courseName: 'Tidewater',
    courseData: CD, createdAt: at, scoringGroups: GROUPS, scores });
const BOARD_DB = { tournaments: { FLT: { name: 'Club Champs', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual',
    flights: FLIGHTS, players: PLAYERS, rounds: {
        r1: rnd('Saturday', 10, Object.assign({}, thru('pA', 4, 18), thru('pB', 5, 18), thru('pC', 4, 18), thru('pD', 5, 18), thru('pE', 4, 18))),
        r2: rnd('Sunday', 20, Object.assign({}, thru('pA', 4, 12), thru('pB', 5, 9), thru('pC', 5, 11), thru('pD', 4, 12), thru('pE', 5, 14))) } } } };
const DEFAULT_DB = { tournaments: { DEF: { name: 'Club Scramble', format: 'scramble', courseName: 'Tidewater', courseData: COURSE,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Lee', 'Bo Park'] }, team2: { num: 2, name: 'Hawks', players: ['Cal Ruiz'] } },
    scores: { team2_h1: 4, team2_h2: 3 } } } };

// SERVED OVER http for the emulator arms (same reason as the offline-queue check).
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
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return { unparsed: String(s).slice(0, 300) }; } };

// TYPE into the box the card rendered for that hole - found by its row, not position.
const typeRow = (hole, v) => ({ expression: `(function () {
  var i = document.querySelector('#hole-row-${hole} input');
  if (!i) return 'no box for hole ${hole}';
  i.value = ${JSON.stringify(String(v))};
  i.dispatchEvent(new Event('change', { bubbles: true }));
  return 'typed h${hole}=' + ${JSON.stringify(String(v))};
})()` });
// READ - innerText, scoped, never textContent (CLAUDE.md).
const READ_CARD = { expression: `JSON.stringify((function () {
  var t = function (id) { var e = document.getElementById(id); return e ? (e.innerText || '').trim() : null; };
  var vis = function (id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null && (e.innerText || '').trim()); };
  var rows = Array.prototype.map.call(document.querySelectorAll('#holes-list [id^="hole-row-"]'), function (r) { return Number(r.id.replace('hole-row-', '')); });
  var states = {};
  Array.prototype.forEach.call(document.querySelectorAll('#holes-list [id^="hole-row-"]'), function (r) {
    var s = r.querySelector('.hole-state'); var x = s ? (s.innerText || '').trim() : ''; if (x) states[r.id.replace('hole-row-', '')] = x; });
  var next = Array.prototype.map.call(document.querySelectorAll('#holes-list .is-next'), function (r) { return r.id; });
  var n = next.length ? document.getElementById(next[0]).getBoundingClientRect() : null;
  return { statusMain: t('status-main'), statusSub: t('status-sub'), banner: t('starting-hole-banner'), rows: rows, states: states,
    next: next, nextOnScreen: n ? (n.top >= 0 && n.bottom <= innerHeight) : null, nextStripe: next.length ? getComputedStyle(document.getElementById(next[0])).borderLeftWidth : null,
    scrollY: Math.round(scrollY), note: t('play-order-note'), noteShown: vis('play-order-note'), chip: t('score-waiting'), chipShown: vis('score-waiting'),
    saveState: t('save-state'), boxes: document.querySelectorAll('#holes-list input').length };
})())` };
const READ_BOARD = { expression: `JSON.stringify((function () {
  var btn = function (sel) { return Array.prototype.map.call(document.querySelectorAll(sel), function (b) { return { t: (b.innerText || '').trim(), on: b.classList.contains('on') }; }); };
  var vis = function (id) { var e = document.getElementById(id); return !!(e && e.offsetParent !== null && (e.innerText || '').trim()); };
  var list = document.getElementById('leaderboard-list');
  var rows = Array.prototype.map.call(list.querySelectorAll('.lb-row'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); });
  return { chips: btn('#lb-chips button'), seg: btn('#lb-scope button'), chipsShown: vis('lb-chips'), segShown: vis('lb-scope'),
    note: (document.getElementById('lb-note').innerText || '').trim(), noteShown: vis('lb-note'), rows: rows,
    you: ((list.innerText || '').match(/\\(You\\)/g) || []).length };
})())` };
const shot = (name) => ({ shot: path.join(SHOTS, name), viewportOnly: true });
const TOP = { expression: '(window.scrollTo(0, 0), "top")' };

(async () => {
    if (!fs.existsSync(RULES)) bail('no rules file ' + RULES);
    try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { bail('cannot write screenshots to ' + SHOTS); }
    const failures = [];
    const out = { rules: RULES, shots: [] };
    const fail = (arm, why, got) => failures.push(arm + ': ' + why + (got === undefined ? '' : ' - got ' + JSON.stringify(got)));
    const shotsOf = (v) => v.filter((x) => typeof x === 'string' && x.indexOf('shot ') === 0);

    let emu;
    try { emu = await startEmulator({ rulesPath: RULES, port: PORT, ns: 'wired' }); }
    catch (e) { bail('could not start the emulator: ' + e.message); }
    await emu.admin('PUT', '', SEED);
    const served = await serveRepo(path.join(__dirname, '..'));
    const pageUrl = (q) => 'http://127.0.0.1:' + served.port + '/tournament-scorecard.html?' + q;
    const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), 'wired-' + n + '-'));
    const dirs = [];

    // ---- ARM A2 ----
    const PA = tmp('a2'); dirs.push(PA);
    const a2 = await arriveCold({ url: pageUrl('tourney=SHOT&team=7&k=' + K7), emulator: emu.url, profileDir: PA, settleMs: 1500, closeBrowser: true,
        steps: [{ sleep: 8000 }, READ_CARD, shot('A2-wired-1-untouched-hole8.png'), typeRow(8, 3), { sleep: 2500 }, READ_CARD,
            shot('A2-wired-2-after-hole8-next9.png'), TOP, shot('A2-wired-3-after-hole8-top.png')] });
    if (!a2.ok) bail('arm A2 did not run: ' + a2.reason);
    const a2u = parse(a2.value[1]), a2t = parse(a2.value[5]);
    if (!a2u.boxes) bail('arm A2: the card never rendered, so nothing below means anything', a2u);
    const server8 = await emu.admin('GET', 'tournaments/SHOT/scores/team7_h8');
    out.armA2 = { untouched: a2u, afterHole8: a2t, serverTeam7H8: server8 };
    out.shots.push(...shotsOf(a2.value));
    const ORDER8 = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7];
    if (a2u.statusMain !== 'Enter Hole 8') fail('A2', 'untouched status is not "Enter Hole 8"', a2u.statusMain);
    if (JSON.stringify(a2u.rows) !== JSON.stringify(ORDER8)) fail('A2', 'rows are not in play order 8..18,1..7', a2u.rows);
    if (JSON.stringify(a2u.next) !== '["hole-row-8"]') fail('A2', 'untouched: row 8 is not the one next row', a2u.next);
    if (a2u.states['8'] !== 'next to play') fail('A2', 'untouched: row 8 does not say next to play', a2u.states);
    if (a2u.note !== 'Holes listed in play order: 8 → 18, then 1 → 7.' || !a2u.noteShown) fail('A2', 'play-order note', a2u.note);
    if (a2u.scrollY !== 0) fail('A2', 'an untouched card scrolled by itself', a2u.scrollY);
    if (server8 !== 3) fail('A2', 'hole 8 did not reach the server', server8);
    if (a2t.statusMain !== 'Next: Hole 9 · Par 4') fail('A2', 'after hole 8 the status is not "Next: Hole 9 · Par 4"', a2t.statusMain);
    if (a2t.statusSub !== 'Thru 1 · 3 strokes · E') fail('A2', 'after hole 8 the sub line', a2t.statusSub);
    if (a2t.states['8'] !== 'played' || a2t.states['9'] !== 'next to play') fail('A2', 'row labels after hole 8', a2t.states);
    if (JSON.stringify(a2t.next) !== '["hole-row-9"]' || a2t.nextStripe !== '5px') fail('A2', 'row 9 is not the striped next row', [a2t.next, a2t.nextStripe]);
    if (a2t.nextOnScreen !== true) fail('A2', 'row 9 is not on screen after hole 8', a2t.scrollY);
    if (a2t.chipShown) fail('A2', 'a waiting chip showed on a live socket', a2t.chip);

    // ---- ARM J4 ----
    const PJ = tmp('j4'); dirs.push(PJ);
    const j4 = await arriveCold({ url: pageUrl('tourney=QUE&team=4&k=' + K1), emulator: emu.url, profileDir: PJ, settleMs: 1500, closeBrowser: true,
        steps: [{ sleep: 8000 }, READ_CARD, { expression: '(firebase.database().goOffline(), "socket down")' }, { sleep: 800 },
            typeRow(10, 3), typeRow(11, 5), { sleep: 1200 }, READ_CARD, shot('J4-wired-1-two-waiting.png'),
            { expression: '(firebase.database().goOnline(), "socket up")' }, { sleep: 8000 }, READ_CARD, shot('J4-wired-2-signal-back.png')] });
    if (!j4.ok) bail('arm J4 did not run: ' + j4.reason);
    const j4a = parse(j4.value[1]), j4w = parse(j4.value[7]), j4b = parse(j4.value[11]);
    if (!j4a.boxes) bail('arm J4: the card never rendered', j4a);
    const serverQ = await emu.admin('GET', 'tournaments/QUE/scores');
    out.armJ4 = { untouched: { chip: j4a.chip, chipShown: j4a.chipShown }, offlineTwoTyped: { chip: j4w.chip, chipShown: j4w.chipShown, saveState: j4w.saveState },
        signalBack: { chip: j4b.chip, chipShown: j4b.chipShown, saveState: j4b.saveState }, server: serverQ };
    out.shots.push(...shotsOf(j4.value));
    if (j4a.chipShown) fail('J4', 'a chip on an untouched card', j4a.chip);
    if (j4w.chip !== '2 waiting for signal' || !j4w.chipShown) fail('J4', 'offline, two typed: chip', [j4w.chip, j4w.chipShown]);
    if (j4b.chipShown || j4b.chip !== '') fail('J4', 'signal back: the chip did not clear', [j4b.chip, j4b.chipShown]);
    if (JSON.stringify(serverQ) !== JSON.stringify({ team4_h10: 3, team4_h11: 5 })) fail('J4', 'server after signal back', serverQ);

    emu.stop();
    served.server.close();

    // ---- ARM A3 ----
    const a3 = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=FLT&group=g3&round=r2'), db: BOARD_DB, settleMs: 1500,
        steps: [{ sleep: 500 }, { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, READ_BOARD, shot('A3-wired-1-default-own-flight.png'),
            { tap: '#lb-scope button', nth: 1 }, { sleep: 400 }, READ_BOARD, shot('A3-wired-2-event-toggle.png')] });
    if (!a3.ok) bail('arm A3 did not run: ' + a3.reason);
    const a3d = parse(a3.value[3]), a3e = parse(a3.value[7]);
    out.armA3 = { taps: [a3.value[1], a3.value[5]], default: a3d, event: a3e };
    out.shots.push(...shotsOf(a3.value));
    const chipsWant = [{ t: 'Overall', on: false }, { t: 'A Flight', on: false }, { t: 'B Flight ★', on: true }];
    if (JSON.stringify(a3d.chips) !== JSON.stringify(chipsWant)) fail('A3', 'default chips (B Flight ★ on)', a3d.chips);
    if (JSON.stringify(a3d.seg) !== JSON.stringify([{ t: 'This round', on: true }, { t: 'Event (2 rounds)', on: false }])) fail('A3', 'default switch', a3d.seg);
    const bNames = ['Sam Kim', 'Dana Ruiz', 'Lee Park'];
    const rowsHave = (rows, n) => rows.some((r) => r.indexOf(n) !== -1);
    if (!bNames.every((n) => rowsHave(a3d.rows, n)) || ['Ana Diaz', 'Joe Fox'].some((n) => rowsHave(a3d.rows, n))) fail('A3', 'default board is not B Flight only', a3d.rows);
    if (a3d.you !== 2) fail('A3', 'default: (You) count on a two-golfer group link', a3d.you);
    if (!/^B Flight is yours \(★\)\. Updates live/.test(a3d.note)) fail('A3', 'note', a3d.note);
    if (JSON.stringify(a3e.seg) !== JSON.stringify([{ t: 'This round', on: false }, { t: 'Event (2 rounds)', on: true }])) fail('A3', 'Event tap did not switch', a3e.seg);
    if (!/^Pos .* Rds To Par$/i.test(a3e.rows[0] || '')) fail('A3', 'event header is not Pos / Golfer / Rds / To Par', a3e.rows[0]);
    if (!a3e.rows.some((r) => /\(incomplete\)/.test(r))) fail('A3', 'event view marks no incomplete golfer', a3e.rows);

    // ---- ARM DEFAULT ----
    const df = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=DEF&team=1'), db: DEFAULT_DB, settleMs: 1500,
        steps: [{ sleep: 500 }, READ_CARD, shot('default-1-scorecard-untouched.png'), { tap: '#tab-btn-leaderboard' }, { sleep: 400 },
            READ_BOARD, shot('default-2-leaderboard-untouched.png')] });
    if (!df.ok) bail('arm DEFAULT did not run: ' + df.reason);
    const dc = parse(df.value[1]), db = parse(df.value[5]);
    out.armDefault = { card: dc, board: db };
    out.shots.push(...shotsOf(df.value));
    if (!dc.boxes) bail('default arm: the card never rendered', dc);
    if (dc.statusMain !== 'Enter Hole 1') fail('DEF', 'status', dc.statusMain);
    if (JSON.stringify(dc.rows) !== JSON.stringify(COURSE.map((h) => h.hole))) fail('DEF', 'rows not 1..18', dc.rows);
    if (dc.noteShown || dc.chipShown || dc.scrollY !== 0) fail('DEF', 'note, chip or scroll on an untouched default card', [dc.note, dc.chip, dc.scrollY]);
    if (db.chipsShown || db.segShown || db.noteShown || db.chips.length || db.seg.length) fail('DEF', 'chips, switch or note on a no-flight one-round board', db);
    if (db.you !== 1 || !rowsHave(db.rows, 'Eagles') || !rowsHave(db.rows, 'Hawks')) fail('DEF', 'board is not the whole field with (You)', db.rows);

    if (out.shots.length !== 9) fail('SHOTS', 'expected 9 screenshots', out.shots);
    dirs.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
    console.log(JSON.stringify(Object.assign({ verdict: failures.length ? 'FAIL' : 'PASS', failures }, out), null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));
