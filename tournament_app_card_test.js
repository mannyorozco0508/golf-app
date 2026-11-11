// ============================================================================
// P1-c T1A: THE IN-APP CARD, COLD (Phase 1 golfer day, Manny's pick 2026-11-10)
//
// tournament-scorecard.html in APP MODE (?app=1 here; inside the Capacitor app
// it is Capacitor.isNativePlatform()). One hole at a time: the dark "Next to
// play" card, a team -/+ stepper for a scramble or one per golfer otherwise,
// the J4 chip, the green "Save · Next hole ›", the leaderboard line, and the
// whole card one tap away. ONE BUILDER: the same page, the same writers
// (saveHoleScore / savePlayerHoleScore / saveIndividualScore), the same keyed
// proof and the same offline queue as the website card.
//
// HOW EVERY TEST ARRIVES (CLAUDE.md, "a device check may not call a function
// the page defines"). tools/lib/cold-arrival.js opens the link a golfer gets
// in real headless Chrome, with only the DATA SOURCE replaced; the page runs
// its own init, listener and render. A tap is a real CDP mouse press on the
// element. The readers (helpers/app-card-fixtures.js) read innerText and
// rects. Nothing the page defines is called. The only harness calls are the
// stand-in's own: __coldSetOffline (airplane mode) and __coldWrites (what
// reached the "server").
//
// WHAT THIS CANNOT PROVE. The stand-in database is not the rules: that a write
// WITHOUT the key is refused is the emulator arm of
// tools/tournament-app-card-check.js. Here a refusal is a stand-in that
// answers PERMISSION_DENIED (the data source, replaced), which proves what the
// app view DOES with one. The stand-in never re-fires the listener after a
// write, so "Save moves on" is proven without the server echoing the score -
// the airplane case, which is the harder one.
//
// TESTS: 9. Needs Chrome (CHROME_PATH); without it every test is skipped,
// loudly, and proves nothing.
//
// BASELINE against p1-base 48121bea (tournament-scorecard.html as it stood
// there, put in place by cp from git show, this file run, the wave's card
// restored by cp from a saved copy, sha be5e9e7e... RESTORED-OK):
//
//   all 9 tests: 1 PASS / 8 FAIL / 0 cancelled.   1 + 8 = 9.
//
// The 1 that passes at baseline is test 9 (no Capacitor and no ?app=1: no app
// view, the website card) - green before and after by design.
//
// NEGATIVE CONTROLS (mutation in tournament-scorecard.html, this file run,
// the card restored by cp from a scratch copy, sha re-checked RESTORED-OK):
//   C1 appSave writes nothing (the writer loop removed)        6 fail CAUGHT
//   C2 next hole in card order, not play order (startingHole
//      dropped from appNextHole)                                5 fail CAUGHT
//   C3 the app chip ignores J4 (waiting branch removed)        1 fail CAUGHT
//   C4 a refusal no longer puts the hole back                  1 fail CAUGHT
//   C5 Capacitor not consulted (only ?app=1 turns app mode on) 1 fail CAUGHT
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SKIP = fs.existsSync(CHROME) ? false : 'Chrome not found - this guard proves nothing without it';
const parse = (s) => JSON.parse(s);

async function go(query, db, steps, extra) {
    const r = await arriveCold(Object.assign({ url: fileUrl('tournament-scorecard.html', query), db, settleMs: 1500, steps }, extra || {}));
    assert.ok(r.ok, 'the cold arrival did not run: ' + r.reason);
    return r.value;
}
const writesOf = (v) => parse(v);
// A ROOT update() is the keyed write: { scorePath: n, proofPath: { who, k, t } }.
const flat = (ws) => ws.reduce((o, w) => {
    if (w.op === 'update' && !w.path) Object.assign(o, w.value); else o[w.path] = w.op === 'remove' ? null : w.value;
    return o;
}, {});

describe('T1A scramble - one hole at a time', { skip: SKIP }, () => {
    test('untouched: the dark card names the next hole in play order, the stepper sits at par, the website card is hidden', async () => {
        const v = await go('tourney=SCR&team=4&app=1&k=' + F.KEY4, F.scrambleDb(), [F.READ_APP]);
        const a = parse(v[0]);
        assert.equal(a.appMode, true);
        assert.equal(a.appShown, true, 'the app view is on screen');
        assert.equal(a.webCardShown, false, 'the website hole list is not on the hole screen');
        assert.equal(a.webNavShown, false);
        assert.equal(a.title, 'Saturday Scramble');
        assert.equal(a.live, true, 'LIVE badge');
        assert.equal(a.sub, 'LIVETeam 4 · Papago · Shotgun 8:00 AM', 'the badge, then team · course · start');
        // Started on 4, holes 4-6 played: next in play order is 7 (par 4).
        assert.equal(a.next, 'Hole 7 · Par 4');
        assert.match(a.dark, /You started on 4 · 3 holes done/);
        assert.equal(a.topar, '−3');
        assert.equal(a.place, '5th of 18');
        assert.deepEqual(a.steppers, ['4'], 'one team stepper, at par');
        assert.match(a.score, /Team score/);
        assert.match(a.score, /Lopez · Kim · Ruiz · Diaz/);
        assert.equal(a.save, 'Save · Next hole ›');
        assert.equal(a.note, "One tap saves your team's score. It sends when you have signal.");
        assert.equal(a.boardLine, '🏆 Leaderboard See all › 1 Team 9 −9 · 2 Team 12 −8 · 3 Team 2 −7');
        assert.equal(a.wholeCard, '📋 Whole card Holes 1-18 ›');
        assert.equal(a.chipShown, false, 'no chip before anything is saved');
        assert.doesNotMatch(a.appText, /\$|600|250|[Pp]rize/, 'no prize amounts anywhere');
    });

    test('tap +, Save · Next hole: ONE keyed write of 5 through the website writer, then hole 8 (par 3) and "Hole 7 saved"', async () => {
        const v = await go('tourney=SCR&team=4&app=1&k=' + F.KEY4, F.scrambleDb(),
            [{ tap: '#ap-score .ap-plus' }, { sleep: 150 }, F.READ_APP, { tap: '#ap-save' }, { sleep: 300 }, F.READ_APP, F.WRITES, F.QUEUE]);
        const mid = parse(v[2]), after = parse(v[5]), ws = writesOf(v[6]), q = parse(v[7]);
        assert.deepEqual(mid.steppers, ['5']);
        assert.equal(ws.length, 1, 'one write: ' + JSON.stringify(ws));
        // The website card's keyed write, byte for byte: the score and its proof in one root update.
        assert.deepEqual(ws[0], { op: 'update', path: '', value: {
            'tournaments/SCR/scores/team4_h7': 5,
            'scoreProofs/SCR/team4_h7': { who: 'team4', k: F.KEY4, t: { '.sv': 'timestamp' } } } });
        assert.equal(after.next, 'Hole 8 · Par 3', 'the next hole in play order');
        assert.deepEqual(after.steppers, ['3'], 'the stepper resets to the new hole\'s par');
        assert.match(after.dark, /4 holes done/);
        assert.equal(after.chip, 'Hole 7 saved');
        assert.equal(after.chipShown, true);
        assert.deepEqual(q, [], 'the queue is empty once the server confirmed');
    });

    test('play order wraps: a team that started on 17 with 17 and 18 done plays hole 1 next, then 2', async () => {
        const db = F.scrambleDb();
        const t4 = db.tournaments.SCR.teams.team4;
        t4.startingHole = '17';
        db.tournaments.SCR.scores = Object.assign({}, db.tournaments.SCR.scores, { team4_h4: null, team4_h5: null, team4_h6: null, team4_h17: 3, team4_h18: 4 });
        Object.keys(db.tournaments.SCR.scores).forEach((k) => { if (db.tournaments.SCR.scores[k] === null) delete db.tournaments.SCR.scores[k]; });
        const v = await go('tourney=SCR&team=4&app=1&k=' + F.KEY4, db, [F.READ_APP, { tap: '#ap-save' }, { sleep: 300 }, F.READ_APP, F.WRITES]);
        const a = parse(v[0]), b = parse(v[3]), ws = flat(writesOf(v[4]));
        assert.equal(a.next, 'Hole 1 · Par 4');
        assert.match(a.dark, /You started on 17 · 2 holes done/);
        assert.equal(ws['tournaments/SCR/scores/team4_h1'], 4, 'Save at par wrote hole 1 = 4');
        assert.equal(b.next, 'Hole 2 · Par 4');
    });

    test('a link without its key writes the website card\'s UNKEYED set, and a refusal says the lock sentence and puts the hole back', async () => {
        // The data source replaced by one that refuses every write, as the
        // rules refuse a keyless write on a locked event.
        const refuse = `(function () {
          var real = window.firebase.database;
          var wrap = function () { var d = real.apply(this, arguments); var ref = d.ref;
            d.ref = function (p) { var r = ref(p); ['set', 'update', 'remove'].forEach(function (m) { var f = r[m];
              r[m] = function (v) { f.call(r, v); var e = new Error('PERMISSION_DENIED: refused'); e.code = 'PERMISSION_DENIED'; return Promise.reject(e); }; });
              return r; }; return d; };
          wrap.ServerValue = real.ServerValue; window.firebase.database = wrap; })();`;
        const v = await go('tourney=SCR&team=4&app=1', F.scrambleDb(), [{ tap: '#ap-score .ap-plus' }, { tap: '#ap-save' }, { sleep: 400 }, F.READ_APP, F.WRITES],
            { preScript: refuse });
        const a = parse(v[3]), ws = writesOf(v[4]);
        assert.deepEqual(ws.map((w) => [w.op, w.path, w.value]), [['set', 'tournaments/SCR/scores/team4_h7', 5]],
            'no key: the plain set the website card makes');
        assert.equal(a.chip, "⚠️ Not saved — this link can't score this card. Ask the organizer for your team's link.");
        assert.equal(a.next, 'Hole 7 · Par 4', 'the refused hole is the next to play again');
        assert.match(a.dark, /3 holes done/);
        assert.deepEqual(a.steppers, ['5'], 'the golfer\'s number comes back with the hole, not par');
    });
});

describe('T1A other formats - one row per golfer', { skip: SKIP }, () => {
    test('best ball: one stepper per golfer by name; Save writes each golfer through savePlayerHoleScore, keyed', async () => {
        const K = 'k3-cccccccccccccccccccccccccccccc';
        const v = await go('tourney=BBL&team=3&app=1&k=' + K, F.bestBallDb(),
            [F.READ_APP, { tap: '#ap-score .ap-plus', nth: 1 }, { tap: '#ap-score .ap-minus', nth: 2 }, { sleep: 150 }, F.READ_APP,
                { tap: '#ap-save' }, { sleep: 300 }, F.READ_APP, F.WRITES]);
        const a = parse(v[0]), mid = parse(v[4]), after = parse(v[7]), ws = writesOf(v[8]);
        assert.deepEqual(a.golfers, ['Ann Lee', 'Bo Park', 'Cy Diaz']);
        assert.deepEqual(a.steppers, ['4', '4', '4'], 'each at par');
        assert.equal(a.next, 'Hole 1 · Par 4');
        assert.doesNotMatch(a.dark, /You started on/, 'no tee: no "started on"');
        assert.deepEqual(mid.steppers, ['4', '5', '3']);
        assert.match(mid.score, /Team score this hole: 3/, 'best ball of 4, 5, 3');
        assert.equal(ws.length, 3, 'one write per golfer');
        const f = flat(ws);
        assert.equal(f['tournaments/BBL/scores/team3_p0_h1'], 4);
        assert.equal(f['tournaments/BBL/scores/team3_p1_h1'], 5);
        assert.equal(f['tournaments/BBL/scores/team3_p2_h1'], 3);
        ['p0', 'p1', 'p2'].forEach((p) => assert.deepEqual(f[`scoreProofs/BBL/team3_${p}_h1`], { who: 'team3', k: K, t: { '.sv': 'timestamp' } }));
        assert.equal(after.next, 'Hole 2 · Par 4');
        assert.equal(after.chip, 'Hole 1 saved');
    });

    test('group link, round 2: a row per golfer; Save writes each golfer id under rounds/r2 with the round\'s proof path', async () => {
        const K = 'kg-dddddddddddddddddddddddddddddd';
        const v = await go('tourney=FLT&group=g3&round=r2&app=1&k=' + K, F.groupDb(),
            [F.READ_APP, { tap: '#ap-save' }, { sleep: 300 }, F.READ_APP, F.WRITES]);
        const a = parse(v[0]), b = parse(v[3]), f = flat(writesOf(v[4]));
        assert.deepEqual(a.golfers, ['Dana Ruiz', 'Lee Park']);
        assert.equal(a.next, 'Hole 3 · Par 4', 'holes 1-2 played by EVERY golfer on the card');
        assert.equal(a.note, "One tap saves your group's scores. It sends when you have signal.");
        assert.equal(f['tournaments/FLT/rounds/r2/scores/pD_h3'], 4);
        assert.equal(f['tournaments/FLT/rounds/r2/scores/pE_h3'], 4);
        assert.deepEqual(f['scoreProofs/FLT/r/r2/pD_h3'], { who: 'pD', k: K, t: { '.sv': 'timestamp' } });
        assert.equal(b.next, 'Hole 4 · Par 4');
    });
});

describe('T1A offline - the save queues and the chip says waiting', { skip: SKIP }, () => {
    test('no signal: Save queues the keyed op on this phone, the chip reads "1 waiting for signal", and the card moves on', async () => {
        const db = F.scrambleDb();
        db['.info'] = { connected: false };   // the socket is down, as it is in airplane mode
        const v = await go('tourney=SCR&team=4&app=1&k=' + F.KEY4, db,
            [F.OFFLINE, { tap: '#ap-score .ap-minus' }, { tap: '#ap-save' }, { sleep: 400 }, F.READ_APP, F.QUEUE, F.WRITES]);
        const a = parse(v[4]), q = parse(v[5]), ws = writesOf(v[6]);
        assert.equal(a.chip, '1 waiting for signal');
        assert.match(a.chipClass, /ap-am/, 'amber');
        assert.equal(a.next, 'Hole 8 · Par 3', 'the golfer is not held on a hole the phone has kept');
        assert.equal(q.length, 1, 'one op on this phone');
        assert.equal(q[0].path, 'tournaments/SCR/scores/team4_h7');
        assert.equal(q[0].type, 'keyed');
        assert.deepEqual(q[0].value, { score: 3, who: 'team4', k: F.KEY4, proof: 'scoreProofs/SCR/team4_h7' });
        assert.equal(ws.length, 1);
        assert.equal(ws[0].offline, true, 'the write was attempted and is pending, not lost');
    });
});

describe('T1A app mode switch - the website card is the default', { skip: SKIP }, () => {
    test('inside the app (Capacitor.isNativePlatform() true), with NO ?app=1: the app view', async () => {
        const v = await go('tourney=SCR&team=4&k=' + F.KEY4, F.scrambleDb(), [F.READ_APP],
            { preScript: 'window.Capacitor = { isNativePlatform: function () { return true; }, getPlatform: function () { return "ios"; } };' });
        const a = parse(v[0]);
        assert.equal(a.appMode, true);
        assert.equal(a.next, 'Hole 7 · Par 4');
        assert.equal(a.webCardShown, false);
    });

    test('a browser, no ?app=1 (and a Capacitor that says not native): no app view, the website card as it was', async () => {
        const v = await go('tourney=SCR&team=4&k=' + F.KEY4, F.scrambleDb(), [F.READ_APP],
            { preScript: 'window.Capacitor = { isNativePlatform: function () { return false; } };' });
        const a = parse(v[0]);
        assert.equal(a.appMode, false);
        assert.equal(a.appShown, false);
        assert.equal(a.webCardShown, true, 'the website hole list is on screen');
        assert.equal(a.webStatus, 'Next: Hole 7 · Par 4', 'the website card itself rendered (positive control)');
    });
});
