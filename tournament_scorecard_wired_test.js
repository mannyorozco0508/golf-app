// ============================================================================
// THE GOLFER'S SCORECARD, WIRED: A2 NEXT HOLE, A3 GOLFER BOARD, J4 WAITING
// CHIP (FAST lane, 2026-11-08 - mockups A2, A3 and J4 approved by Manny)
//
// A2  A shotgun card lists its holes in play order from the tee (8 -> 18, then
//     1 -> 7), says "Enter Hole 8" before a stroke and "Next: Hole 9 · Par 4"
//     over "Thru 1 · 3 strokes · E" after one. Group cards too.
//     OPEN DECISION, IMPLEMENTED AS "EVERY": on a GROUP card a hole counts as
//     played only when EVERY golfer on the card has a score. It lives in ONE
//     function, groupHolePlayed() in tournament-scorecard.html; if Manny picks
//     "any", the change is `ids.every` -> `ids.some` on that one line, and the
//     "every golfer" tests below are the ones that flip.
// A3  The Leaderboard tab opens on the golfer's own flight (defaultFlightFor),
//     with Overall and every flight as chips, a This round / Event switch on
//     a multi-round event, and (You) by isMeRow - so a GROUP-link golfer is
//     marked for the first time. No flights and one round: no chips, no
//     switch, no note - the board it always was.
// J4  "N waiting for signal" (amber) from scoreQueueWaiting(), repainted on
//     enqueue, confirm, drain, socket up/down and online/offline. Zero: no
//     chip. Deliberately NOT here: any "round closed, scores not sent"
//     sentence - it is not approved.
//
// HOW EVERY TEST ARRIVES. The page loads from its link URL; the page's own
// value listener receives the record; a score is typed by running the
// onchange the card itself rendered into #holes-list; the Leaderboard tab is
// tapped by running its own onclick attribute read out of the markup; a chip
// is tapped by running the onclick the board rendered, with `this` the chip.
// No render or pick function is called by name.
//
// WHAT THE HARNESS CANNOT PROVE (helpers/mini-dom.js):
//   - innerHTML is a string, so the per-row "played" / "next to play" labels
//     and the is-next stripe (applied to the live rows AFTER render) are not
//     observable here, nor is the scroll. tools/tournament-scorecard-wired-check.js
//     measures those in headless Chrome, cold, touching nothing it should not.
//   - no <template>.content: the in-place value patch is not exercised; a
//     first render lays its markup into #holes-list (same shim as
//     tournament_offline_queue_test.js).
//   - the stand-in db is not the rules; the offline queue's real-SDK half is
//     tools/tournament-offline-queue-check.js.
//
// TESTS: 17 (final run of the finished file: 17 pass / 0 fail).
//
// BASELINE against c3b7a139 (tournament-scorecard.html sha256 13525961...,
// the pre-wiring card), the card swapped in from that commit's copy, the
// file run, and the wired card restored by cp from a saved copy (sha
// 2e186179... RESTORED-OK):
//
//   2 PASS / 15 FAIL / 0 cancelled / 17 tests.   2 + 15 = 17.
//
// The 2 that pass at baseline are the lines this wave must NOT move: a
// finished card's "Thru 18 — 72 strokes", and the untouched card with no
// starting hole ("Enter Hole 1", rows 1..18). Green before and after by
// design. The two other DEFAULT tests (no chip; no board chips/switch/note)
// fail at baseline only because those elements do not exist in that page and
// mini-dom hands back a detached div for any id - so they prove the elements
// are hidden now, not that the old page showed them.
//
// NEGATIVE CONTROLS (mutation in tournament-scorecard.html, this file run,
// the card restored by cp from a scratch copy, sha re-checked RESTORED-OK):
//   C1 groupHolePlayed every -> some                         2 fail CAUGHT
//   C2 scramble list back in card order (courseData.forEach) 1 fail CAUGHT
//   C3 board ignores the golfer's own flight (always Overall) 2 fail CAUGHT
//   C4 chip not repainted after a confirm or a drain         1 fail CAUGHT
//      (C4 was INERT on the first draft: the socket-up repaint alone hid
//      the chip. The test now ages the stored ops a minute first.)
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');

const PAGE = 'tournament-scorecard.html';
const QKEY = 'rattle_tournament_scores_wq_v1';
const engine = loadJsFile('tournament-engine.js');
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// The mockup's pars: hole 8 a par 3, 9 and 10 par 4, 11 a par 5, 12 a par 3.
const PARS = [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
const COURSE = PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 }));

// ---- the phone and the page (the same shape as tournament_offline_queue_test.js)
function phone(code, record) { return { storage: {}, server: { tournaments: { [code]: record } }, code }; }
function applyServer(server, p, op, v) {
    const put = (pth, val) => {
        const parts = String(pth).split('/').filter(Boolean);
        let n = server;
        for (let i = 0; i < parts.length - 1; i++) { if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
        if (val === null || val === undefined) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = clone(val);
    };
    if (op === 'update' && !p) Object.keys(v).forEach((k) => put(k, v[k]));
    else if (op === 'remove') put(p, null);
    else put(p, v);
}
function arrive(ph, query, net) {
    net = net || { mode: 'online' };
    const sb = loadHtmlInlineScript(PAGE, [], {
        search: '?' + query, localStorage: true, seedStorage: ph.storage,
        beforeRun(s) {
            const ce = s.document.createElement.bind(s.document);
            s.document.createElement = (tag) => {
                const el = ce(tag);
                if (String(tag).toLowerCase() === 'template' && !el.content) el.content = { querySelectorAll: () => [] };
                return el;
            };
            s.__dbHold = (p, op, v) => {
                if (net.mode === 'offline') return new Promise(() => {});
                applyServer(ph.server, p, op, v);
                return null;
            };
        }
    });
    return sb;
}
function deliver(sb, ph) {
    sb.__dbHandlers.filter((h) => h.event === 'value' && h.path === 'tournaments/' + ph.code)
        .forEach((h) => h.cb({ val: () => clone(ph.server.tournaments[ph.code]), exists: () => true }));
}
function connected(sb, on) {
    sb.__dbHandlers.filter((h) => h.event === 'value' && h.path === '.info/connected')
        .forEach((h) => h.cb({ val: () => on }));
}
// TYPE: the onchange the card rendered for this hole (and golfer).
function type(sb, hole, value, pid) {
    const html = String(sb.document.getElementById('holes-list').innerHTML);
    const handlers = [...html.matchAll(/onchange="([^"]*)"/g)].map((m) => m[1].replace(/&#39;/g, "'"));
    const mine = handlers.filter((h) => pid
        ? new RegExp("saveIndividualScore\\('" + pid + "', " + hole + ',').test(h)
        : new RegExp('saveHoleScore\\(' + hole + ',').test(h));
    assert.equal(mine.length, 1, 'the card rendered no box for hole ' + hole);
    vm.runInContext('(function () { ' + mine[0] + ' }).call(' + JSON.stringify({ value: String(value) }) + ')', sb);
}
const text = (sb, id) => String(sb.document.getElementById(id).textContent || '');
const shown = (sb, id) => sb.document.getElementById(id).style.display !== 'none';
const rowsOf = (sb) => [...String(sb.document.getElementById('holes-list').innerHTML)
    .matchAll(/id="hole-row-(\d+)"/g)].map((m) => Number(m[1]));

// THE TAP on the Leaderboard tab: its own onclick, out of the page's markup.
function tapBoard(sb) {
    const src = fs.readFileSync(path.join(__dirname, PAGE), 'utf8');
    const tap = /id="tab-btn-leaderboard"[^>]*onclick="([^"]+)"/.exec(src);
    assert.ok(tap, 'the Leaderboard tab has an onclick');
    vm.runInContext(tap[1], sb);
    return String(sb.document.getElementById('leaderboard-list').innerHTML || '');
}
// THE TAP on a rendered chip or switch button, found by its label.
function tapRendered(sb, containerId, label) {
    const html = String(sb.document.getElementById(containerId).innerHTML || '');
    const btns = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => {
        const attrs = m[1];
        const on = /onclick="([^"]+)"/.exec(attrs);
        const f = /data-f="([^"]*)"/.exec(attrs);
        return { label: m[2], onclick: on && on[1], f: f ? f[1] : null, on: /class="[^"]*\bon\b/.test(attrs) };
    });
    const b = btns.find((x) => x.label.trim() === label);
    assert.ok(b && b.onclick, 'no rendered button "' + label + '" in #' + containerId + ' (have: ' + btns.map((x) => x.label).join(' | ') + ')');
    sb.__thisChip = { getAttribute: (k) => (k === 'data-f' ? b.f : null) };
    vm.runInContext('(function () { ' + b.onclick + ' }).call(__thisChip)', sb);
    return String(sb.document.getElementById('leaderboard-list').innerHTML || '');
}
function buttons(sb, containerId) {
    return [...String(sb.document.getElementById(containerId).innerHTML || '').matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]
        .map((m) => ({ label: m[2].trim(), on: /class="[^"]*\bon\b/.test(m[1]) }));
}

// ---- fixtures
const shotgunTeam = (scores) => ({ name: 'Shotgun Scramble', format: 'scramble', courseName: 'Tidewater', courseData: COURSE,
    startType: 'shotgun', teams: { team7: { num: 7, name: 'Bell / Shaw', players: ['Bell', 'Shaw'], startingHole: '8' },
        team1: { num: 1, name: 'Eagles', players: ['Ann'] } }, scores: scores || {} });
const plainTeam = () => ({ name: 'Club Scramble', format: 'scramble', courseName: 'Tidewater', courseData: COURSE,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'] }, team2: { num: 2, name: 'Hawks', players: ['Bo'] } },
    scores: { team1_h1: 4, team2_h1: 3 } });
const shotgunGroup = (scores) => ({ name: 'Shotgun Stroke', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
    courseName: 'Tidewater', courseData: COURSE, startType: 'shotgun',
    players: { pA: { id: 'pA', name: 'Ann Lee', handicap: '4' }, pB: { id: 'pB', name: 'Bo Park', handicap: '8' } },
    scoringGroups: { g1: { name: 'Group 1', playerIds: ['pA', 'pB'], startingHole: '8' } }, scores: scores || {} });

const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const fill = (pid, v) => { const s = {}; for (let h = 1; h <= 18; h++) s[`${pid}_h${h}`] = v; return s; };
const FLIGHTS = { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } };
const PLAYERS = () => ({
    pA: { id: 'pA', name: 'Ann Lee', handicap: '4', flightId: 'fA' }, pB: { id: 'pB', name: 'Bo Park', handicap: '6', flightId: 'fA' },
    pC: { id: 'pC', name: 'Sam Kim', handicap: '12', flightId: 'fB' }, pD: { id: 'pD', name: 'Dana Ruiz', handicap: '15', flightId: 'fB' } });
const GROUPS = { g1: { name: 'Group 1', playerIds: ['pA', 'pB'] }, g2: { name: 'Group 2', playerIds: ['pC', 'pD'] } };
const flightedSingle = () => ({ name: 'Club Champs', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
    courseName: 'Tidewater', courseData: CD, flights: FLIGHTS, players: PLAYERS(), scoringGroups: GROUPS,
    scores: Object.assign({}, fill('pA', 4), fill('pB', 5), fill('pC', 5), fill('pD', 4)) });
const rnd = (name, at, scores) => ({ name, status: 'open', format: 'individual', scoringMode: 'gross',
    courseName: 'Tidewater', courseData: CD, createdAt: at, scoringGroups: GROUPS, scores });
const flightedTwoRound = () => ({ name: 'Two Day', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual',
    flights: FLIGHTS, players: PLAYERS(), rounds: {
        r1: rnd('Saturday', 10, Object.assign({}, fill('pA', 4), fill('pB', 5), fill('pC', 4), fill('pD', 6))),
        r2: rnd('Sunday', 20, Object.assign({}, fill('pA', 5), fill('pB', 4), fill('pC', 3), fill('pD', 5))) } });

// ============================================================================
describe('A2 - the shotgun card plays from its tee', () => {
    test('untouched hole-8 team card: "Enter Hole 8", rows 8..18 then 1..7, the play-order note', () => {
        const ph = phone('A2T', shotgunTeam());
        const sb = arrive(ph, 'tourney=A2T&team=7'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Enter Hole 8');
        assert.deepEqual(rowsOf(sb), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7]);
        assert.equal(text(sb, 'play-order-note'), 'Holes listed in play order: 8 → 18, then 1 → 7.');
        assert.ok(shown(sb, 'play-order-note'));
    });

    test('hole 8 typed as 3: "Next: Hole 9 · Par 4" over "Thru 1 · 3 strokes · E" (the mockup)', async () => {
        const ph = phone('A2N', shotgunTeam());
        const sb = arrive(ph, 'tourney=A2N&team=7'); deliver(sb, ph);
        type(sb, 8, 3); await settle();
        assert.deepEqual(ph.server.tournaments.A2N.scores, { team7_h8: 3 }, 'positive: the score reached the server');
        deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Next: Hole 9 · Par 4');
        assert.equal(text(sb, 'status-sub'), 'Thru 1 · 3 strokes · E');
    });

    test('a skipped hole is next, not one past the furthest (8 and 10 scored -> 9)', () => {
        const ph = phone('A2S', shotgunTeam({ team7_h8: 3, team7_h10: 4 }));
        const sb = arrive(ph, 'tourney=A2S&team=7'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Next: Hole 9 · Par 4');
    });

    test('the wrap: 8..18 scored, next is hole 1', () => {
        const s = {}; for (let h = 8; h <= 18; h++) s['team7_h' + h] = 4;
        const ph = phone('A2W', shotgunTeam(s));
        const sb = arrive(ph, 'tourney=A2W&team=7'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Next: Hole 1 · Par 4');
    });

    test('a finished card keeps the line it always had', () => {
        const s = {}; for (let h = 1; h <= 18; h++) s['team7_h' + h] = 4;
        const ph = phone('A2F', shotgunTeam(s));
        const sb = arrive(ph, 'tourney=A2F&team=7'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Thru 18 — 72 strokes');
    });

    test('DEFAULT: an untouched card with no starting hole is today\'s card - "Enter Hole 1", rows 1..18, no note', () => {
        const ph = phone('A2D', plainTeam());
        ph.server.tournaments.A2D.scores = {};
        const sb = arrive(ph, 'tourney=A2D&team=1'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Enter Hole 1');
        assert.deepEqual(rowsOf(sb), COURSE.map((h) => h.hole));
        assert.ok(!/Next:/.test(text(sb, 'status-main')));
        assert.ok(!shown(sb, 'play-order-note') || text(sb, 'play-order-note') === '', 'no play-order note on a 1..18 card');
    });

    test('GROUP CARD, "EVERY": one golfer of two on hole 8 is not played - still "Enter Hole 8"', () => {
        const ph = phone('A2G', shotgunGroup({ pA_h8: 4 }));
        const sb = arrive(ph, 'tourney=A2G&group=g1'); deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Enter Hole 8');
        assert.equal(rowsOf(sb)[0], 8, 'positive: the group list starts at the tee');
    });

    test('GROUP CARD, "EVERY": both golfers typed on hole 8 (through the card) -> "Next: Hole 9 · Par 4"', async () => {
        const ph = phone('A2H', shotgunGroup({ pA_h8: 4 }));
        const sb = arrive(ph, 'tourney=A2H&group=g1'); deliver(sb, ph);
        type(sb, 8, 3, 'pB'); await settle();
        deliver(sb, ph);
        assert.equal(text(sb, 'status-main'), 'Next: Hole 9 · Par 4');
    });

    test('the rule is ONE named function, every golfer (source, positive and exact)', () => {
        const src = fs.readFileSync(path.join(__dirname, PAGE), 'utf8');
        assert.match(src, /function groupHolePlayed\(scores, ids, hole\) \{\n\s*return ids\.length > 0 && ids\.every\(/);
        const uses = (src.match(/groupHolePlayed\(/g) || []).length;
        assert.equal(uses, 2, 'declared once, called once (renderGroup) - nothing else answers "played" for a group');
    });
});

// ============================================================================
describe('A3 - the golfer board: own flight, the event, (You)', () => {
    test('DEFAULT: no flights, one round, team link - no chips, no switch, no note, whole field, (You) on own team', () => {
        const ph = phone('A3D', plainTeam());
        const sb = arrive(ph, 'tourney=A3D&team=2'); deliver(sb, ph);
        const html = tapBoard(sb);
        ['Eagles', 'Hawks'].forEach((n) => assert.ok(html.includes(n), 'positive: ' + n));
        assert.equal((html.match(/\(You\)/g) || []).length, 1);
        assert.match(html, /Hawks[^]*?\(You\)/);
        assert.ok(!shown(sb, 'lb-chips') && text(sb, 'lb-chips') === '' && !String(sb.document.getElementById('lb-chips').innerHTML));
        assert.ok(!shown(sb, 'lb-scope') && !String(sb.document.getElementById('lb-scope').innerHTML));
        assert.ok(!shown(sb, 'lb-note'));
    });

    test('group-link golfer in B Flight: B Flight ★ chip on, only B golfers, (You) on both, the note', () => {
        const ph = phone('A3F', flightedSingle());
        const sb = arrive(ph, 'tourney=A3F&group=g2'); deliver(sb, ph);
        const html = tapBoard(sb);
        assert.deepEqual(buttons(sb, 'lb-chips'), [
            { label: 'Overall', on: false }, { label: 'A Flight', on: false }, { label: 'B Flight ★', on: true }]);
        ['Sam Kim', 'Dana Ruiz'].forEach((n) => assert.ok(html.includes(n), 'positive: ' + n));
        ['Ann Lee', 'Bo Park'].forEach((n) => assert.ok(!html.includes(n), n + ' is A Flight'));
        assert.equal((html.match(/\(You\)/g) || []).length, 2, 'a group-link golfer is marked');
        assert.match(text(sb, 'lb-note'), /^B Flight is yours \(★\)\. Updates live/);
        assert.ok(!shown(sb, 'lb-scope'), 'a single-round event has no This round / Event switch');
    });

    test('tapping Overall shows the whole field, ranks equal to the organizer view, (You) still on', () => {
        const ph = phone('A3O', flightedSingle());
        const sb = arrive(ph, 'tourney=A3O&group=g2'); deliver(sb, ph);
        tapBoard(sb);
        const html = tapRendered(sb, 'lb-chips', 'Overall');
        const want = engine.resolveLeaderboardView(flightedSingle(), null).rows.map((r) => r.teamName);
        const got = [...html.matchAll(/<span class="lb-team">([^<]*)/g)].map((m) => m[1].trim()).slice(1);
        assert.deepEqual(got, want);
        assert.equal(buttons(sb, 'lb-chips').find((b) => b.on).label, 'Overall');
        assert.equal((html.match(/\(You\)/g) || []).length, 2);
    });

    test('multi-round: This round on by default; tapping Event (2 rounds) shows the event standings', () => {
        const ph = phone('A3E', flightedTwoRound());
        const sb = arrive(ph, 'tourney=A3E&group=g2&round=r2'); deliver(sb, ph);
        tapBoard(sb);
        assert.deepEqual(buttons(sb, 'lb-scope'), [{ label: 'This round', on: true }, { label: 'Event (2 rounds)', on: false }]);
        const html = tapRendered(sb, 'lb-scope', 'Event (2 rounds)');
        assert.ok(/>Rds</.test(html), 'the event column says Rds, as the organizer board does');
        const want = engine.golferLeaderboardView(flightedTwoRound(), { scope: 'event', flightId: 'fB' }).rows.map((r) => r.teamName);
        const got = [...html.matchAll(/<span class="lb-team">([^<]*)/g)].map((m) => m[1].trim()).slice(1);
        assert.ok(want.length === 2, 'positive: the B event field is two golfers');
        assert.deepEqual(got, want);
        assert.ok(/2\/2/.test(html), 'rounds complete out of countable');
    });

    test('the open board updates on the next snapshot, with no tap', () => {
        const ph = phone('A3L', plainTeam());
        const sb = arrive(ph, 'tourney=A3L&team=1'); deliver(sb, ph);
        const before = tapBoard(sb);
        assert.ok(!before.includes('Owls'), 'positive control: Owls not there yet');
        ph.server.tournaments.A3L.teams.team3 = { num: 3, name: 'Owls', players: ['Cy'] };
        ph.server.tournaments.A3L.scores.team3_h1 = 2;
        deliver(sb, ph);
        assert.ok(String(sb.document.getElementById('leaderboard-list').innerHTML).includes('Owls'));
    });
});

// ============================================================================
describe('J4 - the waiting chip', () => {
    test('DEFAULT: an untouched card shows no chip', () => {
        const ph = phone('J4D', plainTeam());
        const sb = arrive(ph, 'tourney=J4D&team=1'); deliver(sb, ph); connected(sb, true);
        assert.ok(!shown(sb, 'score-waiting'));
        assert.equal(text(sb, 'score-waiting'), '');
    });

    test('no signal: two typed holes show "2 waiting for signal"; signal back, it clears', async () => {
        const ph = phone('J4W', plainTeam());
        const net = { mode: 'offline' };
        const sb = arrive(ph, 'tourney=J4W&team=1', net); deliver(sb, ph);
        connected(sb, false);
        type(sb, 2, 4); type(sb, 3, 5);
        assert.ok(shown(sb, 'score-waiting'));
        assert.equal(text(sb, 'score-waiting'), '2 waiting for signal');
        // A MINUTE PASSES (the stored ops are aged; storage is data, not a page
        // function). Now the chip would stay up on a live socket too - so only
        // a repaint AFTER the drain can clear it. Without this the socket-up
        // repaint alone hid the chip and the drain repaint was unproven.
        const aged = JSON.parse(sb.localStorage.getItem(QKEY)).map((o) => Object.assign(o, { ts: o.ts - 60000 }));
        sb.localStorage.setItem(QKEY, JSON.stringify(aged));
        net.mode = 'online';
        connected(sb, true); await settle();
        assert.equal(ph.server.tournaments.J4W.scores.team1_h3, 5, 'positive: the replay landed');
        assert.ok(!shown(sb, 'score-waiting'), 'the chip clears once the queue drains');
        assert.equal(text(sb, 'score-waiting'), '');
    });

    test('a score in flight on a live socket is NOT "waiting for signal" (no flash per keystroke)', () => {
        const ph = phone('J4F', plainTeam());
        const sb = arrive(ph, 'tourney=J4F&team=1', { mode: 'offline' }); deliver(sb, ph);
        connected(sb, true);
        type(sb, 2, 4);
        assert.equal(JSON.parse(sb.localStorage.getItem(QKEY) || '[]').length, 1, 'positive: it is queued');
        assert.ok(!shown(sb, 'score-waiting'), 'inside the grace period, with the socket up');
    });
});
