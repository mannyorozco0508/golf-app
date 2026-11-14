// ============================================================================
// PAYOUTS / PRIZE RESULTS - COLD CHROME (PO build 2026-11-14,
// ADVISOR-20261114-1156-OK-build-final-set)
//
// What mini-dom cannot prove (tournament_prizes_cards_test.js says which):
// the organizer's own place boxes filled by the page, rendered text, ring
// geometry, the recap -> My results tap, and the TV results page at 16:9.
//
// tools/lib/cold-arrival.js: the page loads its own scripts, runs its own init
// and listeners; the only thing replaced is the data. Inputs are real taps on
// real elements. No page function is called. Text is innerText scoped to the
// container the claim is about - never textContent, never the body.
//
// THE DEFAULT STATE is arm 1: no prizeType on the record, nothing on the switch
// tapped - every amount reads pro shop credit and "Cash" is only the switch.
//
// FIXTURE: helpers/prize-fixtures.js oneDay() (one round, four golfers, two
// flights, KP 7 and 13, long drive 18, all confirmed), owner u-org, spots 80/40,
// 20 a skin, 25 a contest. The posted record is TournamentPrizes.recordFor() of
// that event - the same value the page's Post results writes (proven in the
// mini-dom test, section 6).
//
// BASELINE against main e1312cf2 (tournament.html sha256 fad162561b8f4db8): the
// fixture helper is missing there, the require throws at load, node reports
// 1 test / 0 pass / 1 fail; no per-assertion meaning. FINAL RUN on preview-po:
// 8 tests / 8 pass / 0 fail.
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { loadJsFile } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const settings = { prizeSettings: { perSkin: 20, perContest: 25 } };
function postedRecord() {
    const eng = loadJsFile('tournament-prizes.js', ['handicap.js', 'payouts.js', 'tournament-engine.js', 'skins.js', 'tournament-contests.js']);
    const d = F.oneDay(settings);
    const rec = JSON.parse(JSON.stringify(eng.TournamentPrizes.recordFor(d, eng.TournamentPrizes.summary(d, F.oneDayEntries(), [80, 40]))));
    rec.postedAt = Date.UTC(2026, 10, 22, 21, 10);
    return rec;
}
const dbOf = (rec) => ({ '.info': { connected: true }, tournaments: { ONE: rec }, contestEntries: { ONE: F.oneDayEntries() }, events: {}, trips: {}, global_courses: {} });

const READ = (ids) => ({ expression: `JSON.stringify((function () { var o = {}; ${JSON.stringify(ids)}.forEach(function (id) { var e = document.getElementById(id);
  o[id] = !e ? null : (e.offsetParent === null && getComputedStyle(e).position !== 'fixed' ? '' : (e.innerText || '').replace(/\\s+/g, ' ').trim()); }); return o; })())` });
const RING = { expression: `JSON.stringify(Array.prototype.slice.call(document.querySelectorAll('#prize-card-skins .pz-ring')).map(function (e) { var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { mark: e.getAttribute('data-mark'), w: Math.round(r.width), h: Math.round(r.height), shadow: cs.boxShadow, radius: cs.borderRadius, bg: cs.backgroundColor }; }))` };

const seen = {};
before(async () => {
    const OWNER_IDS = ['prize-type-control', 'prize-owner-head', 'payout-owner-controls', 'payout-results', 'prize-card-skins', 'prize-card-kps', 'prize-total'];
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=ONE'), db: dbOf(F.oneDay(settings)), auth: F.OWNER, settleMs: 2500,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 400 }, READ(OWNER_IDS), { tap: '#prize-skins-open' }, { sleep: 250 }, READ(['prize-card-skins']), RING] });
    seen.owner = a.ok ? { first: JSON.parse(a.value[2]), open: JSON.parse(a.value[5]), rings: JSON.parse(a.value[6]) } : { reason: a.reason };
    const post = postedRecord();
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=ONE&recap=1'), db: dbOf(F.oneDay(Object.assign({ prizeResults: post }, settings))), settleMs: 2500,
        steps: [READ(['recap-prizes', 'recap-winners']), { expression: `(function () { var b = Array.prototype.slice.call(document.querySelectorAll('#recap-prizes .pz-name')); return b.map(function (x) { return x.innerText; }).indexOf('Dana Ruiz'); })()` }] });
    const nth = b.ok ? b.value[1] : -1;
    seen.recap = b.ok ? JSON.parse(b.value[0]) : { reason: b.reason };
    const c = await arriveCold({ url: fileUrl('tournament.html', 'tourney=ONE&recap=1'), db: dbOf(F.oneDay(Object.assign({ prizeResults: post }, settings))), settleMs: 2500,
        steps: [{ tap: '#recap-prizes .pz-name', nth: Math.max(0, nth) }, { sleep: 300 }, READ(['my-results-screen', 'my-results-sub', 'my-results-card', 'recap-screen'])] });
    seen.tapped = c.ok ? Object.assign(JSON.parse(c.value[2]), { nth }) : { reason: c.reason };
    const d = await arriveCold({ url: fileUrl('tournament.html', 'tourney=ONE&recap=1&me=pA'), db: dbOf(F.oneDay(Object.assign({ prizeResults: post }, settings))), settleMs: 2500,
        steps: [READ(['my-results-card', 'recap-screen'])] });
    seen.url = d.ok ? JSON.parse(d.value[0]) : { reason: d.reason };
    const e = await arriveCold({ url: fileUrl('tournament-tv.html', 'tourney=ONE&every=60'), db: dbOf(F.oneDay(Object.assign({ prizeResults: post }, settings))), viewport: { width: 1280, height: 720 }, settleMs: 3000,
        steps: [{ expression: `JSON.stringify((function () { var r = document.getElementById('tv-results'); var f = document.getElementById('tv-foot');
          if (!r) return { none: true, board: (document.getElementById('tv-board') || {}).innerText };
          var cols = Array.prototype.slice.call(r.querySelectorAll('.col')).map(function (c) { var b = c.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: c.scrollHeight, ch: c.clientHeight }; });
          return { text: r.innerText.replace(/\\s+/g, ' ').trim(), cols: cols, foot: Math.round(f.getBoundingClientRect().top), vh: innerHeight, label: document.getElementById('tv-page-label').innerText }; })())` }] });
    seen.tv = e.ok ? JSON.parse(e.value[0]) : { reason: e.reason };
});

describe('cold Chrome', () => {
    test('1. organizer, nothing tapped: the switch is Pro shop credit, and Cash is the switch alone', () => {
        const o = seen.owner.first;
        assert.ok(o, JSON.stringify(seen.owner));
        assert.equal(o['prize-type-control'], 'Pro shop credit Cash');
        const rest = ['payout-owner-controls', 'payout-results', 'prize-card-skins', 'prize-card-kps', 'prize-total'].map((k) => o[k]).join(' | ');
        assert.match(rest, /pro shop credit/, 'positive: amounts are on screen');
        assert.doesNotMatch(rest, /cash/i);
    });
    test('2. organizer: the page fills its own place boxes and lists each flight from them', () => {
        const r = seen.owner.first['payout-results'];
        assert.equal(r, 'A FLIGHT 1st — Ana Diaz $80 pro shop credit 2nd — Sam Ortiz $40 pro shop credit B FLIGHT 1st — Dana Ruiz $80 pro shop credit 2nd — Lee Park $40 pro shop credit');
    });
    test('3. organizer: Skins, KPs and the total, as rendered', () => {
        const o = seen.owner.first;
        assert.match(o['prize-card-skins'], /\$20 pro shop credit a skin · per round · carryover on/);
        assert.match(o['prize-card-skins'], /2 skins \(1 carried\) → \$40 pro shop credit/);
        assert.match(o['prize-card-kps'], /7 Sam Ortiz closest · 6 ft 1 in \$25 credit/);
        assert.match(o['prize-total'], /^Total awarded pro shop credit · 4 golfers \$355 pro shop credit$/);
    });
    test('4. a real tap on Open shows the hole that paid, its score in a 2px ring with no fill', () => {
        assert.match(seen.owner.open['prize-card-skins'], /Tied at 4 \(Ana, Sam, Dana, Lee\) · no skin, carried to 2/);
        const birdie = seen.owner.rings.find((x) => x.mark === 'birdie');
        assert.ok(birdie, 'a birdie ring rendered: ' + JSON.stringify(seen.owner.rings));
        assert.ok(birdie.w >= 20 && birdie.h >= 20, 'the ring has a size on screen');
        assert.match(birdie.shadow, /rgb\(193, 18, 31\) 0px 0px 0px 2px inset/);
        assert.equal(birdie.radius, '50%');
        assert.equal(birdie.bg, 'rgba(0, 0, 0, 0)', 'a ring, not a coloured badge');
    });
    test('5. the recap, posted: the cards by flight, skins and KPs, and the total', () => {
        const r = seen.recap;
        assert.equal(r['recap-winners'], '', 'the old winners card is not shown once posted');
        assert.match(r['recap-prizes'], /^Tap your name to see My results\. PLACES · A FLIGHT 1st Ana Diaz -1 \$80 credit/);
        assert.match(r['recap-prizes'], /KPS & LONG DRIVE 7 Sam Ortiz closest · 6 ft 1 in \$25 credit/);
        assert.match(r['recap-prizes'], /Total awarded pro shop credit \$355$/);
    });
    test('6. a real tap on a name on the recap opens that golfer\'s My results', () => {
        const t = seen.tapped;
        assert.ok(t.nth >= 0, 'Dana Ruiz is a button on the recap');
        assert.equal(t['recap-screen'], '', 'the recap is hidden');
        assert.equal(t['my-results-sub'], 'Papago Classic · Dana Ruiz · B Flight');
        assert.match(t['my-results-card'], /\$105/);
        assert.match(t['my-results-card'], /Spend it at the Papago pro shop\. The organizer settles with the shop; HardPan collects nothing\./);
    });
    test('7. My results by URL (&me=pA): place, skin and total, credit', () => {
        assert.match(seen.url['my-results-card'], /^PLACES 1st · A Flight -1 \$80 credit SKINS 3 2 skins · hole 2 par 4 · 1 carried \$40 credit Pro shop credit at the Papago pro shop \$120 Spend it at the Papago pro shop/);
    });
    test('8. TV at 1280x720: the results page leads, three cards, all inside the screen above the footer', () => {
        const t = seen.tv;
        assert.ok(t && !t.none && t.text, JSON.stringify(t));
        assert.match(t.text, /^PLACES A FLIGHT 1st Ana Diaz -1 \$80 2nd Sam Ortiz \+1 \$40 B FLIGHT/);
        assert.match(t.text, /SKINS 3 Ana Diaz 2 · x2 \$40/);
        assert.match(t.text, /KPS & LONG DRIVE 7 Sam Ortiz 6 ft 1 in \$25 13 Dana Ruiz 3 ft 8 in \$25 18 Lee Park 287 yds \$25 All amounts are pro shop credit at the Papago pro shop\./);
        assert.equal(t.cols.length, 3);
        t.cols.forEach((c) => { assert.ok(c.bottom <= t.foot, 'a card runs under the footer: ' + JSON.stringify(t)); assert.ok(c.h <= c.ch + 1, 'a card overflows: ' + JSON.stringify(c)); });
        assert.match(t.label, /^Results/);
    });
});
