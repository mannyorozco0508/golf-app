// ============================================================================
// SCORECARD SCAN CHECK - THE COMPARE (scan-compare.js), SK, ADVISOR-20261114-1527
//
// The pure module behind the Desk's Scan card: the scanner's read of a paper
// card against the app's scores, hole by hole; the name matching that puts a
// card row on a golfer; the written total; the per-card verdict; the choices;
// the field's tiles. No page here - tournament_card_check_test.js arrives at
// the Desk the way the organizer does.
//
// THE CONFIDENCE CUT IS 0.85 (ScanCompare.CONFIDENCE_CUT), the scanner
// validator's own MIN_CONFIDENCE: a differing digit read BELOW 0.85 is unsure
// (amber), at 0.85 or above it is a mismatch (red). M3 holds both sides of
// the line, and that the two files agree on the number.
//
// NEGATIVE CONTROLS (each mutation copied to the scratchpad first, restored by
// sha; run against this file, each must turn the named tests red):
//   C1 tie of names     matchNames takes the FIRST of two candidates instead of
//                       refusing                         -> M7 red
//   C2 mismatch=match   cellStatus answers 'match' for any two scores
//                                   -> M2, M3, M5, M9, M10, M11, M12 red
//   C3 cut off by one   '< cut' becomes '<= cut'         -> M3 red
//   C4 written total    issuesOf never raises 'total'    -> M9 red
//
// BASELINE (the FINAL file): against preview-batch 5033e24b, where
// scan-compare.js does not exist, the file cannot load - 1 test reported,
// 0 pass / 1 fail (the require throws before any test registers); that proves
// nothing per assertion. After the build (scan-compare.js sha256 0cd06bd8
// 77559e1c...): 15 tests, 15 pass / 0 fail. Controls run 2026-11-14, each
// restored by sha (RESTORED-OK 0cd06bd877559e1c).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const SC = require(path.join(__dirname, 'scan-compare.js'));
const V = require(path.join(__dirname, 'scorecard-validate.js'));

const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const HOLES = PAR.map((_, i) => i + 1);
const GOLFERS = [{ key: 'p05', name: 'Dana Ruiz' }, { key: 'p06', name: 'Lee Park' }, { key: 'p07', name: 'Kim Vo' }, { key: 'p08', name: 'Al Lopez' }];
const score = (pi, h) => PAR[h - 1] + ((pi + h) % 3 === 0 ? 1 : 0);
function appFor(players) {
    const out = {};
    players.forEach((p, pi) => { out[p.key] = {}; HOLES.forEach((h) => { out[p.key][h] = score(pi, h); }); });
    return out;
}
// A scanner answer that reads exactly what the app holds, then edited per test.
function scanFor(players, edit) {
    const rows = players.map((p, pi) => {
        const holes = HOLES.map((h) => ({ hole: h, score: score(pi, h), confidence: 0.97 }));
        const sum = holes.reduce((s, c) => s + c.score, 0);
        return { name: p.name, row_label_as_written: p.name, holes, written_out: null, written_in: null, written_total: sum };
    });
    if (edit) edit(rows);
    return { players: rows };
}
const cell = (rows, i, h) => rows[i].holes[h - 1];
const run = (scan, players, extra) => SC.compareCard(Object.assign({ scan, players: players || GOLFERS, holes: HOLES, app: appFor(players || GOLFERS) }, extra || {}));

test('M1 a card that reads what the app holds: every cell match, no issues, verdict match, verified', () => {
    const c = run(scanFor(GOLFERS));
    assert.equal(c.verdict, 'match');
    assert.deepEqual(SC.issuesOf(c), []);
    assert.equal(SC.isVerified(c), true);
    assert.equal(c.rows.p05.h.h7.status, 'match');
    assert.equal(c.rows.p05.how, 'exact');
    assert.equal(c.rows.p05.writtenTotal, c.rows.p05.appTotal, 'written total vs app total, both carried');
});

test('M2 card 5, app 4, read surely: a red mismatch with both digits, Use card offered, verdict mismatch', () => {
    const c = run(scanFor(GOLFERS, (r) => { cell(r, 0, 7).score = 6; }));   // app holds 5 on Dana's 7th (par 5)
    const x = SC.issuesOf(c).find((i) => i.id === 'p05|h7');
    assert.ok(x, 'the hole is an issue');
    assert.equal(x.kind, 'mismatch');
    assert.equal(x.card, 6); assert.equal(x.app, 5);
    assert.equal(x.canUseCard, true);
    assert.equal(c.verdict, 'mismatch');
    assert.equal(SC.cellStatus(5, 4, 0.99, SC.CONFIDENCE_CUT), 'mismatch');
    assert.equal(SC.cellStatus(4, 4, 0.99, SC.CONFIDENCE_CUT), 'match');
});

test('M3 the confidence cut is 0.85 (the scanner\'s own): 0.84 differing = unsure, 0.85 differing = mismatch, low-confidence equal = match', () => {
    assert.equal(SC.CONFIDENCE_CUT, 0.85);
    assert.equal(SC.CONFIDENCE_CUT, V.MIN_CONFIDENCE, 'the check and the scanner agree on what unsure means');
    assert.equal(SC.cellStatus(6, 5, 0.84, 0.85), 'unsure');
    assert.equal(SC.cellStatus(6, 5, 0.85, 0.85), 'mismatch');
    assert.equal(SC.cellStatus(5, 5, 0.30, 0.85), 'match');
    const c = run(scanFor(GOLFERS, (r) => { cell(r, 2, 13).score = 6; cell(r, 2, 13).confidence = 0.55; }));
    const x = SC.issuesOf(c).find((i) => i.id === 'p07|h13');
    assert.equal(x.kind, 'unsure');
    assert.equal(x.conf, 0.55);
    assert.equal(SC.verdictOf({ holes: [13], rows: { p07: { name: 'Kim Vo', row: 1, h: { h13: { status: 'unsure', card: 6, app: 5, conf: 0.55 } } } }, unmatched: [] }), 'unsure', 'only amber cells: verdict unsure');
});

test('M4 missing: a blank on the card with an app score (Keep app only); a card digit with no app score (Use card offered); both empty is nothing', () => {
    const app = appFor(GOLFERS);
    delete app.p06[4];
    const c = SC.compareCard({ scan: scanFor(GOLFERS, (r) => { cell(r, 0, 2).score = null; r[1].written_total = null; r[0].written_total = null; }), players: GOLFERS, holes: HOLES, app });
    const blank = SC.issuesOf(c).find((i) => i.id === 'p05|h2');
    assert.equal(blank.kind, 'missing'); assert.equal(blank.card, null); assert.equal(blank.canUseCard, false);
    const noApp = SC.issuesOf(c).find((i) => i.id === 'p06|h4');
    assert.equal(noApp.kind, 'missing'); assert.equal(noApp.app, null); assert.equal(noApp.canUseCard, true);
    assert.equal(SC.cellStatus(null, null, 0, 0.85), 'empty');
});

test('M5 a team card in another order: rows go to golfers by NAME, never by position', () => {
    const scan = scanFor(GOLFERS, (r) => { cell(r, 3, 5).score = 9; });   // Al Lopez's 5th misread
    scan.players.reverse();
    const c = run(scan);
    assert.equal(c.rows.p08.row, 1, 'Al Lopez is the first row on this card');
    assert.equal(c.rows.p05.row, 4);
    const ids = SC.issuesOf(c).filter((i) => i.kind === 'mismatch').map((i) => i.id);
    assert.deepEqual(ids, ['p08|h5'], 'the misread lands on Al, not on whoever is first in the record');
});

test('M6 the three tiers: exact, then case/spaces/full stops, then first name + last initial', () => {
    const m = SC.matchNames(['Dana Ruiz', '  lee   PARK ', 'Kim V.', 'UNKNOWN:Al L'], GOLFERS);
    assert.deepEqual(m.byRow.map((r) => [r.player, r.how]), [[0, 'exact'], [1, 'loose'], [2, 'first+initial'], [3, 'first+initial']]);
    assert.deepEqual(m.byPlayer, [0, 1, 2, 3]);
    assert.equal(SC.matchNames(['Dana'], GOLFERS).byRow[0].how, 'none', 'a first name alone is not a match');
});

test('M7 two golfers who share a first name and initial: "Dana R" is NOT MATCHED (never guessed); full names still match; the row and both golfers show', () => {
    const players = [{ key: 'pa', name: 'Dana Ruiz' }, { key: 'pb', name: 'Dana Reed' }];
    const amb = SC.matchNames(['Dana R'], players);
    assert.deepEqual(amb.byRow[0], { player: -1, how: 'ambiguous' });
    assert.deepEqual(amb.byPlayer, [-1, -1]);
    const full = SC.matchNames(['Dana Reed', 'Dana Ruiz'], players);
    assert.deepEqual(full.byPlayer, [1, 0]);
    const scan = { players: [{ name: 'Dana R', row_label_as_written: 'Dana R', holes: [{ hole: 1, score: 4, confidence: 0.99 }], written_total: null }] };
    const c = SC.compareCard({ scan, players, holes: [1], app: { pa: { 1: 4 }, pb: { 1: 5 } } });
    const issues = SC.issuesOf(c);
    assert.deepEqual(issues.map((i) => i.id), ['pa|absent', 'pb|absent', 'row1']);
    assert.equal(issues[2].asWritten, 'Dana R');
    assert.equal(c.unmatched[0].why, 'ambiguous');
    assert.equal(c.verdict, 'mismatch');
});

test('M8 two card rows that both fit one golfer: neither is matched', () => {
    const m = SC.matchNames(['Kim Vo', 'kim vo'], GOLFERS);
    // the exact row claims Kim at tier 1; the loose row then wants a golfer already claimed
    assert.deepEqual(m.byRow.map((r) => r.how), ['exact', 'duplicate']);
    const both = SC.matchNames(['Kim V', 'Kim V.'], GOLFERS);
    assert.deepEqual(both.byRow.map((r) => r.how), ['duplicate', 'duplicate']);
    assert.equal(both.byPlayer[2], -1);
});

test('M9 the written total: card 77 vs app 76 is an issue (Keep app only) until Use card on the hole that differs makes them agree', () => {
    const c = run(scanFor(GOLFERS, (r) => { cell(r, 0, 7).score = 6; r[0].written_total += 1; }));
    const total = SC.issuesOf(c).find((i) => i.id === 'p05|total');
    assert.ok(total, 'the totals disagree');
    assert.equal(total.written, c.rows.p05.appTotal + 1);
    assert.equal(total.canUseCard, false);
    const used = SC.choose(c, 'p05|h7', 'card');
    assert.equal(SC.issuesOf(used).find((i) => i.id === 'p05|total'), undefined, 'the card\'s digit on the app closes the total');
    assert.equal(SC.isVerified(used), true);
    // Every hole matches but the card's own arithmetic is off by one: still raised.
    const sums = run(scanFor(GOLFERS, (r) => { r[1].written_total -= 1; }));
    const t2 = SC.issuesOf(sums).find((i) => i.id === 'p06|total');
    assert.ok(t2, 'a wrong written total is raised on a card whose holes all match');
    assert.equal(sums.verdict, 'mismatch');
    assert.equal(SC.isVerified(SC.choose(sums, 'p06|total', 'app')), true, 'Keep app answers it');
    assert.equal(SC.choose(sums, 'p06|total', 'card'), sums, 'Use card is refused on a total: there is no hole to write');
});

test('M10 choices: Keep app resolves without changing the app digit; Use card is refused where the card has no digit; the original check is untouched', () => {
    const c = run(scanFor(GOLFERS, (r) => { cell(r, 0, 2).score = null; r[0].written_total = null; cell(r, 1, 3).score = 2; r[1].written_total = null; }));
    assert.equal(SC.openIssues(c).length, 2);
    assert.equal(SC.choose(c, 'p05|h2', 'card'), c, 'no card digit: nothing recorded');
    const kept = SC.choose(c, 'p06|h3', 'app');
    assert.equal(kept.rows.p06.h.h3.choice, 'app');
    assert.equal(kept.rows.p06.h.h3.app, c.rows.p06.h.h3.app);
    assert.equal(c.rows.p06.h.h3.choice, undefined, 'a copy, not the stored object');
    const done = SC.choose(kept, 'p05|h2', 'app');
    assert.equal(SC.isVerified(done), true);
    assert.equal(SC.choose(done, 'p05|h2', 'x'), done, 'an unknown choice records nothing');
});

test('M11 the tiles: cards, verified, with mismatches, to scan; all verified only when every card is scanned and nothing is open', () => {
    const ok = run(scanFor(GOLFERS));
    const open = run(scanFor(GOLFERS, (r) => { cell(r, 0, 7).score = 6; r[0].written_total = null; }));
    const s = SC.fieldSummary([{ key: 'g1', check: ok }, { key: 'g2', check: open }, { key: 'g3', check: null }]);
    assert.deepEqual([s.cards, s.verified, s.withMismatches, s.toScan, s.open, s.matched, s.allVerified], [3, 1, 1, 1, 1, 1, false]);
    const fixed = SC.choose(open, 'p05|h7', 'card');
    assert.equal(SC.fieldSummary([{ check: ok }, { check: fixed }, { check: null }]).allVerified, false, 'a card not scanned holds it open');
    const all = SC.fieldSummary([{ check: ok }, { check: fixed }]);
    assert.deepEqual([all.verified, all.matched, all.allVerified], [2, 1, true]);
    assert.equal(SC.fieldSummary([]).allVerified, false, 'no cards is not "all verified"');
});

test('M12 a scramble card: one team row, matched by the team name or any of its golfers', () => {
    const team = [{ key: 'team', name: 'Birdie Hunters', aliases: ['Dana Ruiz', 'Lee Park'] }];
    assert.deepEqual(SC.matchNames(['Lee Park'], team).byPlayer, [0]);
    assert.deepEqual(SC.matchNames(['birdie hunters'], team).byRow[0], { player: 0, how: 'loose' });
    const c = SC.compareCard({ scan: { players: [{ name: 'Dana Ruiz', holes: [{ hole: 1, score: 3, confidence: 0.9 }], written_total: 3 }] }, players: team, holes: [1], app: { team: { 1: 4 } } });
    assert.equal(c.rows.team.h.h1.status, 'mismatch');
});

test('M13 the stored shape: h<n> keys (no numeric keys for the database to turn into an array), no photo, no account id', () => {
    const c = run(scanFor(GOLFERS), null);
    const json = JSON.stringify(Object.assign({ at: 1 }, c));
    assert.deepEqual(Object.keys(c.rows.p05.h).slice(0, 3), ['h1', 'h2', 'h3']);
    assert.ok(!/"\d+":/.test(json), 'no numeric object keys');
    assert.ok(!/uid|image|photo|base64|data:/i.test(json), 'no photo and no uid in what is stored');
    assert.deepEqual(Object.keys(c).sort(), ['appTotal', 'holes', 'rows', 'unmatched', 'verdict', 'writtenTotal']);
    assert.deepEqual(Object.keys(c.rows.p05).sort(), ['appTotal', 'h', 'how', 'name', 'row', 'writtenTotal']);
});

test('M14 an unreadable row ("UNKNOWN:" from the scanner) shows as written, and a golfer with no row is raised', () => {
    const scan = scanFor(GOLFERS.slice(0, 3));
    scan.players.push({ name: 'UNKNOWN:Bobby', row_label_as_written: '', holes: [], written_total: null });
    const c = run(scan);
    const ids = SC.issuesOf(c).map((i) => i.id);
    assert.ok(ids.includes('p08|absent'), 'Al Lopez has no row');
    const row = SC.issuesOf(c).find((i) => i.kind === 'row');
    assert.equal(row.row, 4); assert.equal(row.asWritten, 'Bobby');
});

test('M15 a 9-hole card on the back: the written OUT or IN stands for the total', () => {
    const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    const c = SC.compareCard({ scan: { players: [{ name: 'Kim Vo', holes: back.map((h) => ({ hole: h, score: 4, confidence: 0.99 })), written_out: null, written_in: 36, written_total: null }] },
        players: [{ key: 'p07', name: 'Kim Vo' }], holes: back, app: { p07: Object.fromEntries(back.map((h) => [h, 4])) } });
    assert.equal(c.rows.p07.writtenTotal, 36);
    assert.equal(c.verdict, 'match');
});

// ---- THE WHOLE CARD (Manny's typed OK 2026-11-16, "scanner event list" item 2) ----
// BASELINE against 2c184122 (scan-compare.js before wholeCardIssues / chooseMany): 15 pass / 2 fail of 17 (M16, M17); 17 / 0 after.
// CONTROL K4 (the app===null filter dropped from wholeCardIssues): M16 red, restored by sha.
const WC_PLAYERS = [{ key: 'p05', name: 'Dana Ruiz' }, { key: 'p06', name: 'Lee Park' }, { key: 'p07', name: 'Kim Vo' }, { key: 'p08', name: 'Al Lopez' }];
const WC_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const wcScan = (edit) => {
    const players = WC_PLAYERS.map((p, pi) => ({ name: p.name, row_label_as_written: p.name, holes: WC_HOLES.map((h) => ({ hole: h, score: 4 + ((pi + h) % 3 === 0 ? 1 : 0), confidence: 0.97 })), written_out: null, written_in: null, written_total: null }));
    if (edit) edit(players);
    return { players, notes: '' };
};
const wcApp = (keys, holes) => { const app = {}; keys.forEach((k) => { app[k] = {}; const pi = WC_PLAYERS.findIndex((p) => p.key === k); holes.forEach((h) => { app[k][h] = 4 + ((pi + h) % 3 === 0 ? 1 : 0); }); }); return app; };

test('M16 wholeCardIssues: an untyped foursome is 72 holes; a typed one is 0; half typed is the other half; red and amber are never in it', () => {
    const none = SC.compareCard({ scan: wcScan(), players: WC_PLAYERS, holes: WC_HOLES, app: {} });
    assert.equal(SC.wholeCardIssues(none).length, 72);
    assert.deepEqual(SC.wholeCardIssues(none).slice(0, 2).map((x) => [x.key, x.hole, x.card, x.app, x.kind]), [['p05', 1, 4, null, 'missing'], ['p05', 2, 4, null, 'missing']]);
    const full = SC.compareCard({ scan: wcScan(), players: WC_PLAYERS, holes: WC_HOLES, app: wcApp(['p05', 'p06', 'p07', 'p08'], WC_HOLES) });
    assert.equal(SC.wholeCardIssues(full).length, 0);
    assert.equal(SC.issuesOf(full).length, 0, 'positive: a typed card that matches has nothing at all');
    // The front nine typed, the back not; plus one red (Dana's 7th differs) and one amber (Kim's 3rd read at 0.5 and differs).
    const scan = wcScan((r) => { r[0].holes[6].score += 1; r[2].holes[2].score += 1; r[2].holes[2].confidence = 0.5; });
    const half = SC.compareCard({ scan, players: WC_PLAYERS, holes: WC_HOLES, app: wcApp(['p05', 'p06', 'p07', 'p08'], WC_HOLES.slice(0, 9)) });
    const whole = SC.wholeCardIssues(half);
    assert.equal(whole.length, 36);
    assert.ok(whole.every((x) => x.hole >= 10), 'only the untyped back nine');
    const wholeIds = new Set(whole.map((x) => x.id));
    const kinds = SC.openIssues(half).filter((x) => !wholeIds.has(x.id)).map((x) => x.kind).sort();
    assert.deepEqual(kinds, ['mismatch', 'unsure'], 'the red and the amber stay out of the whole-card list');
    // A blank on the card over an empty app cell is nothing to write.
    const blank = SC.compareCard({ scan: wcScan((r) => { r[1].holes[4].score = null; }), players: WC_PLAYERS, holes: WC_HOLES, app: {} });
    assert.equal(SC.wholeCardIssues(blank).length, 71);
});

test('M17 chooseMany records every usable choice on one copy; an id Use card cannot take is skipped, not an error', () => {
    const none = SC.compareCard({ scan: wcScan(), players: WC_PLAYERS, holes: WC_HOLES, app: {} });
    const ids = SC.wholeCardIssues(none).map((x) => x.id);
    const next = SC.chooseMany(none, ids, 'card');
    assert.notEqual(next, none);
    assert.equal(SC.openIssues(next).length, 0);
    assert.ok(SC.isVerified(next));
    assert.equal(Object.keys(next.rows).reduce((n, k) => n + WC_HOLES.filter((h) => next.rows[k].h['h' + h].choice === 'card').length, 0), 72);
    assert.equal(SC.openIssues(none).length, 72, 'the original is untouched');
    const scan = wcScan((r) => { r[0].holes[6].score += 1; });
    const typed = SC.compareCard({ scan, players: WC_PLAYERS, holes: WC_HOLES, app: wcApp(['p05', 'p06', 'p07', 'p08'], WC_HOLES) });
    const same = SC.chooseMany(typed, ['p05|total', 'nope'], 'card');
    assert.equal(same, typed, 'a total line and an unknown id change nothing');
});
