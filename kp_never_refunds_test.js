// ============================================================================
// KP MONEY NEVER GOES BACK TO THE FIELD (2026-09-22, Manny's rule)
//
// pool-engine.js's KP branch (approved per file): three states, none a refund.
//   paid        a pool participant was recorded - recording pays (v182).
//   skins       "nobody" (kpNoWinner): the share is added to the SKINS BUCKET
//               before the skins are allocated and the flights split.
//   unresolved  HELD - a blank hole live OR finished, a recorded winner who is
//               out of the round (Out on the Players sheet), or "nobody" on a
//               round with no skins bucket. kpUnresolvedCents > 0, settled ===
//               false: every money surface stays "not final" and says why -
//               "Not final — KP on hole 15 not recorded" (score-gaps.js
//               kpHoldPhrase through notFinalLine's extras) on the live head,
//               the Weekly Game card, the Receipt head and Finish Round.
// A verified round with a blank KP is still held (verification records no KP).
// settlement-engine.js (approved: the wording): the "KP refund · …" ledger line
// is gone with the branch that produced it.
// Until today a blank on a finished round, "nobody", and an outside winner each
// refunded the share equally to the field (v182); the 2026-09-19 "every card in,
// nothing recorded: FINAL" pins reverse here, each named in its own suite.
// ============================================================================

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const pool = d => { ENG.__d = J(d); return J(run(ENG, 'computeMoneyPool(__d, __d.courseData, __d.scores)')); };
const sumLines = ls => ls.reduce((a, l) => a + (l.cents || 0), 0);
// The pool_flights golden's flight variant: 23 golfers, $20 in, KP $40 on
// 3/7/12/16 ($10 each), net $200, skins the rest; every card in; one KP recorded
// (h3 Ann) and three blank. Birdies so both flights win skins.
function round(o) {
    o = o || {};
    const r = wizardSavedRound({ code: 'KPX', courseData: CD, thru: o.thru === undefined ? 18 : o.thru,
        overrides: Object.assign({ additionalGames: {}, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: o.split || 'even' } }, o.overrides || {}) });
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    const b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    b('Ann Alpha', 1); b('Ben Bravo', 2); b('Max Mike', 2); b('Cal Charlie', 5); b('Ned November', 7); b('Dee Delta', 9); b('Oli Oscar', 11); b('Eli Echo', 13); b('Pat Papa', 13); b('Quy Quebec', 16);
    if (o.kpWinners !== undefined) r.kpWinners = o.kpWinners;
    if (o.kpNoWinner) r.kpNoWinner = o.kpNoWinner;
    if (o.verified) r.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'organizer' };
    if (o.noSkins) r.moneyPool.skins = { mode: 'none' };
    if (o.noSkins) r.moneyPool.net = { amount: 420, places: [100] };   // the pot still adds up: 460 - 40 KP
    return r;
}
const identity = (r) => {
    const prizes = sumLines(r.kp ? r.kp.lines.filter(l => l.state === 'paid') : []) + sumLines(r.net ? r.net.lines : []) + sumLines(r.skins ? r.skins.lines : []);
    return { prizes, refund: r.refund.cents, withheld: r.kpUnresolvedCents || 0, pot: r.totalPoolCents, sum: prizes + r.refund.cents + (r.kpUnresolvedCents || 0) };
};

describe('a) A BLANK KP ON A FINISHED ROUND IS HELD, NOT REFUNDED', () => {
    const r = pool(round());
    test('every card in, h3 recorded, 7/12/16 blank: three unresolved lines, $30 withheld, no refund, settled false, finished true', () => {
        assert.equal(r.kp.finished, true);
        assert.deepEqual(r.kp.lines.map(l => [l.hole, l.state]), [[3, 'paid'], [7, 'unresolved'], [12, 'unresolved'], [16, 'unresolved']]);
        assert.equal(r.kp.unresolvedCents, 3000); assert.equal(r.kp.toSkinsCents, 0);
        assert.equal(r.kpUnresolvedCents, 3000); assert.equal(r.settled, false);
        assert.equal(r.refund.cents, 0, 'CONTROL: nothing refunded'); assert.deepEqual(r.refund.reasons, []);
        assert.equal(r.kp.lines[1].reason, 'blank');
        assert.equal(r.kp.unclaimedCents, undefined, 'the old field is gone');
    });
    test('prizes + refunds + withheld === the pot; the ledger sums to -withheld (the money is in the pot, not in anyone\'s hand)', () => {
        const i = identity(r);
        assert.equal(i.sum, i.pot); assert.equal(i.pot, 46000); assert.equal(i.withheld, 3000);
        assert.equal(Object.values(r.perPlayerCents).reduce((a, c) => a + c, 0), -3000);
    });
    test('a VERIFIED round with a blank KP is still held', () => {
        const v = pool(round({ verified: true }));
        assert.equal(v.kp.finished, true); assert.equal(v.settled, false); assert.equal(v.kp.unresolvedCents, 3000); assert.equal(v.refund.cents, 0);
    });
    test('the skins pots did not move for a held hole (even split of $220 = $110 / $110)', () => {
        assert.deepEqual(r.skins.flights.map(f => [f.flight, f.amountCents]), [['A', 11000], ['B', 11000]]);
    });
    test('recording the three winners makes it final: settled true, $40 paid, nothing withheld', () => {
        const f = pool(round({ kpWinners: { h3: '101', h7: '113', h12: '104', h16: '116' } }));
        assert.equal(f.settled, true); assert.equal(f.kp.unresolvedCents, 0); assert.equal(sumLines(f.kp.lines), 4000);
        assert.equal(identity(f).sum, 46000);
    });
});

describe('b) "NOBODY" GOES TO THE SKINS POT', () => {
    test('h7 nobody: its $10 is in the skins bucket - $230, both flights re-split evenly $115 / $115; no refund; settled', () => {
        const n = pool(round({ kpNoWinner: { h7: true } }));
        assert.deepEqual(n.kp.lines.map(l => [l.hole, l.state]), [[3, 'paid'], [7, 'skins'], [12, 'unresolved'], [16, 'unresolved']]);
        assert.equal(n.kp.toSkinsCents, 1000);
        assert.equal(n.skins.amountCents, 23000, 'the bucket grew by the share');
        assert.deepEqual(n.skins.flights.map(f => [f.flight, f.amountCents]), [['A', 11500], ['B', 11500]]);
        assert.equal(n.refund.cents, 0, 'CONTROL: nobody is not a refund');
        assert.equal(identity(n).sum, 46000);
        // and by headcount: 12 A / 11 B of $230 -> B floor(230*11/23)=110, A 120
        const h = pool(round({ kpNoWinner: { h7: true }, split: 'headcount' }));
        assert.deepEqual(h.skins.flights.map(f => [f.flight, f.amountCents]), [['A', 12000], ['B', 11000]]);
    });
    test('all three blanks called nobody: $30 to skins ($250), nothing withheld, settled true - the round is final', () => {
        const n = pool(round({ kpNoWinner: { h7: true, h12: true, h16: true } }));
        assert.equal(n.skins.amountCents, 25000); assert.equal(n.kpUnresolvedCents, 0); assert.equal(n.settled, true); assert.equal(n.refund.cents, 0);
        assert.equal(identity(n).sum, 46000);
    });
    test('nobody with NO skins bucket: held, not refunded (reason nobody), settled false', () => {
        const n = pool(round({ kpNoWinner: { h7: true }, noSkins: true }));
        assert.ok(n.valid, n.errors.join(' | '));
        assert.equal(n.skins, null);
        assert.deepEqual(n.kp.lines.find(l => l.hole === 7), { hole: 7, winnerId: null, winnerName: null, cents: 1000, state: 'unresolved', reason: 'nobody' });
        assert.equal(n.kp.toSkinsCents, 0); assert.equal(n.refund.cents, 0); assert.equal(n.settled, false);
        assert.equal(identity(n).sum, 46000);
    });
});

describe('c) A LEADER MARKED OUT IS HELD', () => {
    test('h3 recorded to Ann, Ann Out: the hole is unresolved (reason out), her share withheld, not refunded', () => {
        const d = round(); d.players[0].playingForMoney = false; d.players[0].out = true;
        const o = pool(d);
        assert.deepEqual(o.kp.lines[0], { hole: 3, winnerId: '101', winnerName: 'Ann Alpha', cents: 1000, state: 'unresolved', reason: 'out' });
        assert.equal(o.kp.unresolvedCents, 4000); assert.equal(o.refund.cents, 0); assert.equal(o.settled, false);
        assert.equal(o.perPlayerCents['101'], undefined, 'nothing paid to her');
        assert.equal(identity(o).sum, 22 * 2000);
    });
});

describe('THE WORDS', () => {
    const G = require('./score-gaps.js');
    test('kpHoldPhrase and notFinalLine\'s extras', () => {
        const r = pool(round());
        assert.equal(G.kpHoldPhrase(r.kp), 'KP on holes 7, 12, 16 not recorded');
        assert.equal(G.notFinalLine([], x => x, [G.kpHoldPhrase(r.kp)]), 'Not final — KP on holes 7, 12, 16 not recorded');
        assert.equal(G.notFinalLine([{ name: 'Marty', holes: [1] }], g => g.name, ['KP on hole 15 not recorded']), 'Not final — Marty is missing hole 1; KP on hole 15 not recorded');
        assert.equal(G.kpHoldPhrase(pool(round({ kpWinners: { h3: '101', h7: '113', h12: '104', h16: '116' } })).kp), '');
    });
    test('on a LIVE round only a hole the field has played is "not recorded": thru 10 names hole 7, not 12 and 16', () => {
        const d = round({ thru: 10 });
        const played = h => G.holePlayedByField(d.players, d.scores, h);
        assert.equal(played(7), true); assert.equal(played(10), true); assert.equal(played(11), false); assert.equal(played(16), false);
        assert.equal(G.kpHoldPhrase(pool(d).kp, played), 'KP on hole 7 not recorded');
        assert.equal(G.kpHoldPhrase(pool(d).kp), 'KP on holes 7, 12, 16 not recorded', 'without the predicate every held hole is named');
        // a roster name with no score never teed off and is not waited for
        const one = round({ thru: 10 }); Object.keys(one.scores).forEach(k => { if (k.indexOf('p101_') === 0) delete one.scores[k]; });
        assert.equal(G.holePlayedByField(one.players, one.scores, 10), true);
        assert.equal(G.holePlayedByField(one.players, {}, 10), false, 'nobody started: nothing is played');
        // and the pages pass it: the live head thru 10 names hole 7 alone
        const r = results(d);
        // (the seeded birdies past hole 10 are score gaps, named first on the same line)
        assert.match(r.live, /^\|Not final — [^|]*; KP on hole 7 not recorded\|/);
        assert.match(r.pool, /; KP on hole 7 not recorded\|/);
        assert.doesNotMatch(r.live + r.pool, /KP on holes/);
        assert.match(r.pool, /\|Hole 12: not recorded\|\$10 in the pot\|/, 'the KP card itself still lists every held hole');
    });
    function results(data) {
        const sb = loadHtmlInlineScript('settlement.html');
        sb.__d = J(data);
        run(sb, 'currentMode = "KPX"; currentData = __d; document.__mount(document.getElementById("money-pool-section")); document.__mount(document.getElementById("combined-settlement-summary")); renderMoneyPoolSection(__d, __d.courseData, __d.scores); renderCombinedSummary(__d, __d.courseData, __d.scores);');
        const t = id => String(run(sb, "document.getElementById('" + id + "').innerHTML")).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ');
        return { live: String(run(sb, 'buildLiveResultsHtml(__d, __d.courseData, __d.scores)')).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'), pool: t('money-pool-section'), summary: t('combined-settlement-summary'), head: String(run(sb, 'buildReceiptHeader()')).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') };
    }
    test('Results on the held round: "Not final — KP on holes 7, 12, 16 not recorded" on the live head, the Weekly Game card and the Receipt head; the KP lines say "not recorded"; no "refunded" / "back to the field" anywhere', () => {
        const r = results(round());
        assert.match(r.live, /^\|Not final — KP on holes 7, 12, 16 not recorded\|/);
        assert.match(r.pool, /\|Not final — KP on holes 7, 12, 16 not recorded\|/);
        assert.match(r.head, /\|Not final — KP on holes 7, 12, 16 not recorded\|/);
        assert.match(r.pool, /\|Hole 7: not recorded\|\$10 in the pot\|/);
        assert.match(r.pool, /\|Hole 3: Ann Alpha[^|]*\|\$10\|/);
        assert.doesNotMatch(r.pool + r.summary + r.live, /refunded|back to the field|KP refund/i);
        assert.doesNotMatch(r.summary, /Player Payouts/, 'not final: the live head, not the receipt');
    });
    test('a verified round with a blank KP: the line still shows (verification records no KP); the gap line does not', () => {
        const d = round({ verified: true }); delete d.scores['p102_h1'];   // Ben also missing hole 1 - a gap, forgiven by verification
        const r = results(d);
        assert.match(r.live, /Not final — KP on holes 7, 12, 16 not recorded\|/);
        assert.doesNotMatch(r.live, /Ben.*is missing/);
    });
    test('nobody on h7: the Receipt line "Hole 7: nobody — $10 to the skins pot"; recorded everywhere: no Not-final line, the receipt is final', () => {
        const n = results(round({ kpNoWinner: { h7: true } }));
        assert.match(n.pool, /\|Hole 7: nobody\|\$10 to the skins pot\|/);
        const f = results(round({ kpWinners: { h3: '101', h7: '113', h12: '104', h16: '116' } }));
        assert.doesNotMatch(f.live + f.pool + f.head, /Not final/);
        assert.match(f.summary, /Player Payouts/);
    });
    test('an Out leader on the Receipt: "Hole 3: Ann Alpha is out of the round — re-record it"', () => {
        const d = round(); d.players[0].playingForMoney = false; d.players[0].out = true;
        assert.match(results(d).pool, /\|Hole 3: Ann Alpha is out of the round — re-record it\|\$10 in the pot\|/);
    });
    test('the Players sheet warning and the Hole View line (index.html source)', () => {
        const src = read('index.html');
        assert.match(src, /' \\u2014 re-record it after saving'\)/);
        assert.doesNotMatch(src, /it will be refunded unless re-recorded/);
        assert.match(src, /out of the round, re-record it<\/div>'/);
        assert.match(src, /pays when recorded \\u2014 record the winner to finish the round/);
        assert.match(src, /That share goes into the skins pot\./);
        assert.doesNotMatch(src.slice(src.indexOf('function renderFinishRoundKp') > -1 ? src.indexOf('function renderFinishRoundKp') : 0), /refunded to the field|back to the field once every card/);
        assert.doesNotMatch(read('settlement.html'), /No KP winners — refunded to the field|nobody recorded it|winner not in the pool/);
        assert.doesNotMatch(read('settlement-engine.js'), /KP refund \\u00B7|nobody recorded it/);
    });
});

describe('THE SEAMS', () => {
    test('pool-engine.js: no refund path in the KP branch; the skins bucket adds toSkinsCents', () => {
        const src = read('pool-engine.js');
        const kp = src.slice(src.indexOf('// ---- KP ----'), src.indexOf('// ---- NET FINISH ----'));
        assert.doesNotMatch(kp, /refundCents \+=|refundReason\(|'refunded'|\|\| finished\)/);
        assert.match(kp, /state: 'skins'/); assert.match(kp, /state: 'unresolved'/);
        const skins = src.slice(src.indexOf('// ---- SKINS ----'), src.indexOf('// ---- REFUNDS ----'));
        assert.match(skins, /\+ \(\(result\.kp && result\.kp\.toSkinsCents\) \|\| 0\)/);
    });
});

// ---------------------------------------------------------------------------
// CHROME, cold arrival, 390x844: the organizer's bare link on the golden round
// (every card in, h3 recorded, 7/12/16 blank). One real tap on Finish Round
// shows "Not final — KP on holes 7, 12, 16 not recorded" in the warning; the
// delivered snapshot with the three winners recorded makes the line go away
// (final). No page function is called.
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
describe('CHROME: Finish Round shows the hold; recording the winners makes it final', () => {
    const d = round(); d.ownerUid = 'anon-cold';
    const done = J(d); done.kpWinners = { h3: '101', h7: '113', h12: '104', h16: '116' };
    const DB = { events: { KPX: d }, global_courses: {}, trips: {}, tournaments: {} };
    let r;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=KPX'), db: DB, settleMs: 4000, steps: [
            { tap: '#group-pick-overlay .btn-outline', nth: 0 }, { sleep: 250 },   // Just watching (the picker on a bare multi-group link)
            // the page lands on hole 1; Finish Round is the last hole's Next - seventeen real taps on Next
            ...[].concat(...Array.from({ length: 17 }, () => [{ tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 120 }])),
            { expression: "'H:' + String(currentViewedHole)" },
            { tap: '.finish-round-nav-btn', nth: 0 }, { sleep: 400 },
            { expression: "'W0:' + document.getElementById('fr-incomplete-warning').innerText.replace(/\\s+/g, ' ').trim()" },
            { expression: "'K0:' + (function () { var m = document.getElementById('fr-kp-block'); return m ? m.innerText.replace(/\\s+/g, ' ').slice(0, 400) : 'no kp block'; })()" },
            // the winners arrive (another phone recorded them); the organizer closes and reopens Finish Round
            { deliver: { path: 'events/KPX', value: done } }, { sleep: 400 },
            { tap: '#finish-round-modal-overlay .close-modal', nth: 0 }, { sleep: 250 },
            { tap: '.finish-round-nav-btn', nth: 0 }, { sleep: 400 },
            { expression: "'W1:' + document.getElementById('fr-incomplete-warning').innerText.replace(/\\s+/g, ' ').trim()" }
        ] });
    });
    const v = tag => { const hit = (r.value || []).find(x => typeof x === 'string' && x.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 500)); return hit.slice(tag.length + 1); };
    test('ran; on hole 18; the warning names the held holes', () => {
        assert.ok(r && r.ok, r && r.reason);
        assert.equal(v('H'), '18');
        assert.match(v('W0'), /^Not final — KP on holes 7, 12, 16 not recorded/);
        assert.doesNotMatch(v('W0'), /scores still missing/, 'every card is in - only the KP holds it');
    });
    test('the money panel says the pot holds $30 and how to finish; nothing says refunded', () => {
        assert.match(v('K0'), /\$30 still in the pot — pays when recorded — record the winner to finish the round/);
        assert.doesNotMatch(v('K0'), /refund/i);
    });
    test('the winners recorded (a delivered snapshot): the line is gone', () => {
        assert.equal(v('W1'), '');
    });
});
