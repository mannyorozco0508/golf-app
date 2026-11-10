// ============================================================================
// NO CASH PRIZES (P1-a, 2026-11-10).
//
// Manny, verbatim: "Never show cash prizes — our prizes are trophies and pro
// shop credit only; fix any "$ prize" wording."
//
// The organizer still types an amount per place (payoutSpots), and payouts.js
// still splits it exactly as before - that amount IS pro shop credit. So a
// place with an amount reads "$600 pro shop credit" and a place with no amount
// reads "Trophy". Wording only: the allocator, resolvePrizeView's choice of
// rows and the saved fields are untouched. Entry fees are not prizes: "Total in
// is $500.00", the Desk's Paid/Unpaid and the refunds stay in dollars.
//
// ONE DISPLAY RULE CHANGED, ON PURPOSE. The 2026-09-18 page filter dropped every
// amount-0 row. A $0 place INSIDE the organizer's "Prize Places" count is now a
// trophy place, and its winner is listed with "Trophy" - otherwise the 3rd-place
// trophy winner is named nowhere. Ranks past the count are still dropped, and
// nothing is listed until an amount is set.
//
// PART 1 - COLD CHROME (tools/lib/cold-arrival.js). Two arrivals at
// ?tourney=CODE, the page's own init and listener, no page function called:
// the organizer (signed in as the owner) and a golfer (anonymous). A two-round
// event, basis saved = Sunday, spots 600/250/0. The only input is a real tap on
// the Leaderboard tab button. Text is innerText scoped to the prize containers,
// never textContent, never the body.
//
// PART 2 - SOURCE SCAN, DECODED (helpers/decode-escapes.js). tournament.html,
// tournament-scorecard.html and tournament-engine.js, comments stripped, for the
// banned words in user-facing text. One sentence is allowed by name: the Desk's
// "Tick Paid when you have the cash ..." is about ENTRY FEES, not prizes. A
// positive assertion proves the scan saw the prize section.
//
// SCREENSHOTS: P1A_SHOTS=<dir> writes P1a-organizer-prizes.png and
// P1a-golfer-prizes.png, 390x844 @2x, scrolled to the prize section.
//
// BASELINE against p1-base 48121bea (tournament.html before P1-a):
//   all 11 tests: 2 PASS / 9 FAIL.
//   The 2 that pass: both arrivals ran and showed a list (1), payouts.js
//   byte-identical (1). 2 + 9 = 11. Every wording assertion is red there, and so
//   is the scan's positive (the new words did not exist yet); the scan's hits
//   were "spots pay ... prize money", "Results are paid on", "Paid on <b>" and
//   the engine's two "paid on" reasons.
// After P1-a (p1-prizes): all 11 tests: 11 PASS / 0 FAIL.
//
// NEGATIVE CONTROLS (tournament.html mutated, restored by sha from a saved copy):
//   C1 prizeLabel without "pro shop credit" (a bare "$600")         -> 4 fail
//   C2 trophy rows filtered out again (amount > 0 only)            -> 1 fail
//   C3 the golfer's basis line back to "Paid on"                   -> 3 fail
//   C4 "prize money" put back in the calculator's sub-line          -> 1 fail
//   Each restored from a saved copy, sha cd416f82a716 printed beside RESTORED-OK.
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, REPO_ROOT } = require('./tools/lib/cold-arrival.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = path.join(REPO_ROOT, 'tournament.html');
const CODE = 'NOCASH';
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const SHOTS = process.env.P1A_SHOTS ? path.resolve(process.env.P1A_SHOTS) : null;

const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const fill = (key, v) => { const o = {}; CD18.forEach((h) => { o[`${key}_h${h.hole}`] = v; }); return o; };
const round = (id, extra) => Object.assign({ id, name: 'Round', status: 'open', createdAt: 1, format: 'individual',
    scoringMode: 'gross', courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false, scoringGroups: {}, scores: {} }, extra);
// Sunday (the saved basis): Bob 1st, Ann 2nd, Cy 3rd, Dee 4th.
function record() {
    const p = (id, name) => ({ id, name, handicap: '0' });
    return { ownerUid: OWNER.uid, name: 'Member-Guest', courseName: 'Test GC', courseData: CD18, createdAt: 1,
        eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', entryFee: 0,
        payoutSpots: [600, 250, 0], payoutBasis: 'r2',
        players: { pA: p('pA', 'Ann'), pB: p('pB', 'Bob'), pC: p('pC', 'Cy'), pD: p('pD', 'Dee') },
        rounds: {
            r1: round('r1', { name: 'Saturday', status: 'closed', createdAt: 1, scores: Object.assign({}, fill('pA', 3), fill('pB', 5), fill('pC', 6), fill('pD', 7)) }),
            r2: round('r2', { name: 'Sunday', createdAt: 2, scores: Object.assign({}, fill('pA', 5), fill('pB', 4), fill('pC', 6), fill('pD', 7)) }) } };
}
const dbOf = (rec) => ({ tournaments: { [CODE]: rec }, events: {}, trips: {}, global_courses: {} });

// DOM only: innerText of the prize containers. A container that is not
// rendered reads '' - Chrome's innerText of a display:none element falls back to
// its textContent, so visibility is checked first (offsetParent).
const READ = `JSON.stringify((function () {
  var t = function (id) { var e = document.getElementById(id); if (!e) return null; if (e.offsetParent === null) return '';
    return (e.innerText || '').replace(/\\s+/g, ' ').trim(); };
  return { owner: t('payout-owner-controls'), heading: t('payout-public-heading'), pub: t('payout-public-amounts'),
           label: t('payout-basis-label'), results: t('payout-results'), control: t('payout-basis-control') };
})())`;
const TAP_BOARD = `(function () { var b = document.getElementById('tab-btn-leaderboard'); if (b && b.offsetParent !== null) b.click(); return !!b; })()`;
const SCROLL = `(function () { var a = document.getElementById('payout-owner-controls'); var h = document.getElementById('payout-public-heading');
  var e = (a && a.offsetParent !== null) ? a : h; if (e) e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40); return true; })()`;

const seen = {};
async function arrive(name, auth) {
    const steps = [{ expression: TAP_BOARD }, { sleep: 400 }, { expression: READ }];
    if (SHOTS) steps.push({ expression: SCROLL }, { sleep: 200 }, { shot: path.join(SHOTS, `P1a-${name}-prizes.png`), viewportOnly: true });
    const r = await arriveCold({ url: 'file://' + PAGE + '?tourney=' + CODE, db: dbOf(record()), steps, settleMs: 4000, auth });
    seen[name] = r.ok ? JSON.parse(r.value[2]) : { reason: r.reason };
}
const all = (v) => [v.owner, v.pub, v.label, v.results, v.control].filter(Boolean).join(' | ');
const BANNED = /\bspots? pay\b|\bcash\b|\bpurse\b|\bwinnings\b|prize money|payout pool|\bpays\b|\bpaid on\b|\bpot\b/i;
// A dollar amount that is not followed by "pro shop credit".
const bareDollars = (s) => (s.match(/\$\d[\d,]*(?:\.\d\d)?(?! pro shop credit)\b/g) || []);

describe('PART 1: cold arrival, basis picked (Sunday), spots 600/250/0', () => {
    before(async () => {
        if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
        await arrive('organizer', OWNER);
        await arrive('golfer', 'anonymous');
    });
    test('both arrivals ran, and each shows a prize list (positive: the page rendered money at all)', () => {
        ['organizer', 'golfer'].forEach((k) => {
            assert.ok(seen[k] && !seen[k].reason, k + ': ' + JSON.stringify(seen[k]));
            assert.match(seen[k].results || '', /1st — Bob/, k + ' has no prize list: ' + JSON.stringify(seen[k]));
        });
    });
    test('organizer: places read as pro shop credit, the $0 place reads Trophy, and its winner is named', () => {
        const o = seen.organizer;
        assert.match(o.results, /1st — Bob \$600 pro shop credit/);
        assert.match(o.results, /2nd — Ann \$250 pro shop credit/);
        assert.match(o.results, /3rd — Cy Trophy/);
        assert.doesNotMatch(o.results, /Dee/, 'a rank past the place count is still not a row');
    });
    test('organizer: the calculator and the basis control use no cash wording', () => {
        const o = seen.organizer;
        assert.match(o.owner, /Prize Places/, 'positive: the calculator is on screen');
        assert.match(o.owner, /pro shop credit/);
        assert.match(o.owner, /Trophy/);
        assert.match(o.control, /Prizes go by/i);
        assert.doesNotMatch(all(o), BANNED);
    });
    test('organizer: no bare dollar amount anywhere in the prize containers', () => {
        assert.deepEqual(bareDollars(all(seen.organizer)), []);
    });
    test('golfer: the read-only line names credit and Trophy', () => {
        const g = seen.golfer;
        assert.equal(g.pub, '1st $600 pro shop credit · 2nd $250 pro shop credit · 3rd Trophy');
    });
    test('golfer: the list matches the organizer\'s, and the basis line says "Prizes go by Sunday"', () => {
        const g = seen.golfer;
        assert.equal(g.results, seen.organizer.results);
        assert.equal(g.label, 'Prizes go by Sunday');
        assert.equal(g.owner, '', 'a golfer sees no calculator');
    });
    test('golfer: no cash wording and no bare dollar amount', () => {
        const g = seen.golfer;
        assert.match(all(g), /pro shop credit/);
        assert.match(all(g), /Trophy/);
        assert.doesNotMatch(all(g), BANNED);
        assert.deepEqual(bareDollars(all(g)), []);
    });
});

describe('PART 2: source scan, decoded, comments stripped', () => {
    const FILES = ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js'];
    // Entry fees are not prizes: this Desk sentence is about collecting them.
    const ALLOWED = ['Tick Paid when you have the cash, then approve golfers into the field.'];
    function userText(file) {
        let s = decodeEscapes(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
        s = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        s = s.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
        ALLOWED.forEach((a) => { s = s.split(a).join(' '); });
        return s;
    }
    const TEXT = {};
    FILES.forEach((f) => { TEXT[f] = userText(f); });
    test('positive: the scan sees the prize section and its new words', () => {
        const t = TEXT['tournament.html'];
        assert.match(t, /Prize Results Calculator/);
        assert.match(t, /pro shop credit/);
        assert.match(t, /'Trophy'/);
        assert.match(t, /Prizes go by/);
        assert.match(t, /Prize results coming soon/, 'the golfer sentence stays');
        assert.ok(t.length > 100000, 'the page was read: ' + t.length);
    });
    test('no banned prize words in any tournament page', () => {
        const hits = [];
        FILES.forEach((f) => TEXT[f].split('\n').forEach((l, i) => { if (BANNED.test(l)) hits.push(f + ':' + (i + 1) + ': ' + l.trim().slice(0, 140)); }));
        assert.deepEqual(hits, []);
    });
    test('no amount is printed as a bare toFixed dollar in the prize renderer', () => {
        const src = TEXT['tournament.html'];
        const at = src.indexOf('function renderPayoutResults()');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /prizeLabel\(p\.amount\)/, 'positive: the row uses the credit/Trophy label');
        assert.match(fn, /prizeLabel\(v\)/, 'positive: the golfer line uses it too');
        assert.doesNotMatch(fn, /\$\$\{p\.amount\.toFixed/);
        assert.doesNotMatch(fn, /\$\$\{v\.toFixed/);
    });
    test('payouts.js is byte-identical (wording only, the allocator is untouched)', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'payouts.js'))).digest('hex');
        assert.equal(sha, 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    });
});
