// ============================================================================
// PAYOUTS / PRIZE RESULTS - the screens (PO build 2026-11-14,
// ADVISOR-20261114-1156-OK-build-final-set). STRICT lane: money on screen.
//
// THE USER PATH, in mini-dom. Every "phone" is a fresh page realm that ARRIVES
// at a URL (?tourney=CODE, ?tourney=CODE&recap=1, ...&me=<key>); the record is
// handed to the page's OWN value listener, the organizer is signed in through
// the page's own auth listener, and a tap runs the onclick the page itself
// rendered. No render function is called by name. Section 1 is the DEFAULT
// STATE: nothing tapped, no prizeType saved, and every amount reads pro shop
// credit.
//
// WHAT MINI-DOM CANNOT PROVE, AND WHERE IT IS PROVEN INSTEAD
//  - layout, rings and anything visible: innerHTML is a string here.
//  - the organizer's typed amounts: static value="" attributes are not parsed,
//    so the owner's place boxes read blank in this harness. Sections that need
//    the owner's places seed the boxes and say so; the owner's default list,
//    with the boxes as the page fills them, is tournament_prizes_chrome_test.js
//    (cold Chrome, innerText, nothing called).
//  - the recap's and the TV's rendered text: also the Chrome check.
//
// BASELINE against main e1312cf2 (tournament.html sha256 fad162561b8f4db8,
// no skins.js, no tournament-prizes.js, no PO markup): 1 test / 0 pass / 1 fail - the
// fixture helper and both modules are absent there, so the file cannot load;
// node reports it as one failure. No per-assertion meaning: every assertion
// here is about markup and modules that do not exist on main.
// FINAL RUN on preview-po: 23 tests / 23 pass / 0 fail.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };

function arrive(code, rec, user, search, entries) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: search || '?tourney=' + code });
    sb.fire = (r) => sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + code + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => plain(r), exists: () => true }));
    sb.entries = (e) => sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('contestEntries/' + code + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => plain(e), exists: () => true }));
    sb.fire(rec);
    if (user) sb.__auth.setUser(user);
    if (entries) sb.entries(entries);
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Tap the rendered button inside #id whose text is `label`: run ITS onclick,
// with `this` standing for the button (its data-* attributes), as a tap does.
function tap(sb, id, label) {
    const re = /<button([^>]*)onclick="([^"]+)"([^>]*)>([\s\S]*?)<\/button>/g;
    let m, hit = null;
    while ((m = re.exec(html(sb, id)))) if (text(m[4]) === label) hit = m;
    assert.ok(hit, `no "${label}" button rendered in #${id}`);
    const attrs = hit[1] + hit[3];
    const dataset = {};
    attrs.replace(/data-([a-z]+)="([^"]*)"/g, (_, k, v) => { dataset[k] = v.replace(/&amp;/g, '&'); });
    sb.__tapThis = { dataset, value: '' };
    vm.runInContext(`(function () { ${hit[2]} }).call(__tapThis)`, sb);
}
function change(sb, id, value) {
    const m = new RegExp(`id="${id}"[^>]*onchange="([^"]+)"`).exec(html(sb, id.startsWith('prize-skin') ? 'prize-card-skins' : 'prize-card-kps'));
    assert.ok(m, 'no onchange on #' + id);
    sb.__tapThis = { value: String(value) };
    vm.runInContext(`(function () { ${m[1]} }).call(__tapThis)`, sb);
}
// A button in the page's STATIC markup (mini-dom does not parse static
// markup into innerHTML): run the onclick the page's own source declares on it.
const SRC = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
function tapStatic(sb, id) {
    const m = new RegExp(`id="${id}"[^>]*onclick="([^"]+)"`).exec(SRC);
    assert.ok(m, 'no static button #' + id);
    vm.runInContext(m[1], sb);
}
const writes = (sb, re) => plain(sb.__dbWrites.filter((x) => re.test(x.path)));
// The owner's place boxes, seeded (mini-dom does not parse value="...").
const seedPlaces = (sb, list) => list.forEach((v, i) => { el(sb, 'payout-spot-' + i).value = String(v); });

describe('1. THE DEFAULT STATE: nothing tapped, no prizeType saved - credit everywhere', () => {
    test('organizer: the switch shows Pro shop credit on, Cash off; the three cards and Post results are there', () => {
        const sb = arrive('STK', F.starkey(), F.OWNER);
        const sw = html(sb, 'prize-type-control');
        assert.match(sw, /class="on" aria-pressed="true"[^>]*>Pro shop credit</);
        assert.match(sw, /class="" aria-pressed="false"[^>]*>Cash</);
        ['prize-owner-head', 'prize-card-skins', 'prize-card-kps', 'prize-post'].forEach((id) => assert.equal(el(sb, id).style.display, 'block', id));
        assert.match(text(html(sb, 'prize-type-note')) || el(sb, 'prize-type-note').textContent, /Credit is spent at the host pro shop/);
        assert.match(html(sb, 'prize-card-skins'), /Skins · gross/);
        assert.match(html(sb, 'prize-card-kps'), /KPs · contest holes/);
        assert.match(text(html(sb, 'prize-total')), /^Total awarded pro shop credit · 8 golfers \$0 pro shop credit$/);
        assert.equal(el(sb, 'prize-places-title').textContent, 'Places · per flight');
    });
    test('organizer: no prize container says cash with nothing tapped (only the switch may)', () => {
        const sb = arrive('STK', F.starkey({ prizeSettings: { perSkin: 20 } }), F.OWNER);
        tap(sb, 'prize-card-skins', 'Open');
        const all = ['payout-results', 'payout-spot-amounts', 'prize-card-skins', 'prize-card-kps', 'prize-total'].map((id) => text(html(sb, id))).join(' | ')
            + ' | ' + el(sb, 'payout-pool-sub').textContent + ' | ' + el(sb, 'prize-type-note').textContent;
        assert.match(all, /\$20 pro shop credit a skin/, 'positive: amounts are on screen');
        assert.match(all, /\$620 pro shop credit/);
        assert.doesNotMatch(all, /cash/i);
    });
    test('golfer: the per-flight places read pro shop credit, ties split as payouts.js splits them, and no organizer card is drawn', () => {
        const sb = arrive('STK', F.starkey({ prizeSettings: { perSkin: 20 } }), null);
        const r = text(html(sb, 'payout-results'));
        assert.equal(r, 'A Flight 1st — Ana Diaz $100 pro shop credit 2nd — Sam Ortiz $60 pro shop credit 3rd — Joe Fox $20 pro shop credit 3rd — Mia Chen $20 pro shop credit '
            + 'B Flight 1st — Lee Park $100 pro shop credit 2nd — Dana Ruiz $50 pro shop credit 2nd — Ray Diaz $50 pro shop credit');
        assert.equal(text(html(sb, 'payout-public-amounts')), 'Each flight: 1st $100 pro shop credit · 2nd $60 pro shop credit · 3rd $40 pro shop credit');
        ['prize-owner-head', 'prize-card-skins', 'prize-card-kps', 'prize-post'].forEach((id) => {
            assert.equal(el(sb, id).style.display, 'none', id);
        });
        assert.equal(html(sb, 'prize-card-skins') + html(sb, 'prize-type-control'), '');
    });
    test('a signed-in stranger gets no cards, and the writes refuse them', () => {
        const sb = arrive('STK', F.starkey(), STRANGER);
        assert.equal(el(sb, 'prize-card-skins').style.display, 'none');
        assert.match(html(sb, 'payout-results'), /\$100 pro shop credit/, 'positive: the stranger sees the places');
        ["setPrizeType('cash')", "savePrizeSetting('perSkin', '20')", 'postPrizeResults()'].forEach((c) => vm.runInContext(c, sb));
        assert.deepEqual(writes(sb, /prize/), []);
    });
});

describe('2. THE PRIZE TYPE SWITCH', () => {
    test('tapping Cash saves prizeType, and every amount label then reads cash; Trophy rows are unaffected', () => {
        const sb = arrive('STK', F.starkey({ payoutSpots: [100, 60, 0] }), F.OWNER);
        tap(sb, 'prize-type-control', 'Cash');
        assert.deepEqual(writes(sb, /prizeType/), [{ path: 'tournaments/STK/prizeType', op: 'set', value: 'cash' }]);
        const w = arrive('STK', F.starkey({ payoutSpots: [100, 60, 0], prizeType: 'cash' }), null);
        const r = text(html(w, 'payout-results'));
        assert.match(r, /1st — Ana Diaz \$100 cash/);
        assert.match(r, /3rd — Joe Fox Trophy/, 'a $0 place inside the count is still a Trophy');
        assert.doesNotMatch(r, /pro shop credit/);
        const o = arrive('STK', F.starkey({ payoutSpots: [100, 60, 0], prizeType: 'cash' }), F.OWNER);
        assert.match(html(o, 'prize-type-control'), /class="on" aria-pressed="true"[^>]*>Cash</);
        assert.match(text(html(o, 'prize-total')), /\$0 cash/);
        assert.doesNotMatch(el(o, 'prize-type-note').textContent, /cash|credit/i, 'the note under Cash names no word of its own');
    });
    test('tapping Pro shop credit saves it back', () => {
        const sb = arrive('STK', F.starkey({ prizeType: 'cash' }), F.OWNER);
        tap(sb, 'prize-type-control', 'Pro shop credit');
        assert.deepEqual(writes(sb, /prizeType/), [{ path: 'tournaments/STK/prizeType', op: 'set', value: 'credit' }]);
    });
});

describe('3. THE PLACES CARD: payouts.js per flight, on the saved basis', () => {
    const eng = loadJsFile('tournament-prizes.js', ['handicap.js', 'payouts.js', 'tournament-engine.js', 'skins.js', 'tournament-contests.js']);
    test('each flight is exactly allocatePlacePayouts over the engine\'s flight ranking', () => {
        const d = F.starkey();
        ['fA', 'fB'].forEach((fid) => {
            const rows = eng.resolveLeaderboardView(d, 'event', fid).rows.filter((r) => r.hasScores);
            const want = plain(eng.allocatePlacePayouts(rows, [100, 60, 40]).filter((p) => p.amount > 0).map((p) => [p.rank, p.entry.teamName, p.amount]));
            const got = plain(eng.TournamentPrizes.placeGroups(d, eng.resolvePrizeView(d), [100, 60, 40]).groups.find((g) => g.flightId === fid).rows.map((r) => [r.rank, r.name, r.amount]));
            assert.deepEqual(got, want);
            assert.ok(got.length >= 3, 'positive: the flight has paid rows');
        });
    });
    test('no flights: the overall list, the same rows computeTournamentPayouts gives', () => {
        const d = F.oneDay({ flights: null });
        const p = eng.resolvePrizeView(d);
        const got = plain(eng.TournamentPrizes.placeGroups(d, p, [80, 40]).groups[0].rows.map((r) => [r.rank, r.name, r.amount]));
        assert.deepEqual(got, plain(eng.computeTournamentPayouts(p.rows, [80, 40]).filter((x) => x.amount > 0).map((x) => [x.rank, x.teamName, x.amount])));
        assert.equal(eng.TournamentPrizes.placeGroups(d, p, [80, 40]).byFlight, false);
    });
    test('the organizer\'s Places title says per flight only when the event has flights', () => {
        assert.equal(el(arrive('ONE', F.oneDay({ flights: null }), F.OWNER), 'prize-places-title').textContent, 'Places');
    });
});

describe('4. THE SKINS CARD', () => {
    test('Open shows every hole that paid, the carried runs, the last-hole rule, and the winning score in a ring', () => {
        const sb = arrive('STK', F.starkey({ prizeSettings: { perSkin: 20 } }), F.OWNER);
        assert.doesNotMatch(html(sb, 'prize-card-skins'), /data-hole/, 'closed until Open is tapped');
        tap(sb, 'prize-card-skins', 'Open');
        const h = html(sb, 'prize-card-skins');
        assert.match(text(h), /Cascade 15 skins \(12 carried\) · Olympic 16 skins \(13 carried\) → \$620 pro shop credit/);
        assert.match(h, /data-hole="4"><span class="pz-n">4<\/span><span class="pz-ring birdie" data-mark="birdie">3<\/span><span class="pz-who">Ray Diaz <small>par 4 · <span class="pz-tag">carried from 1–3<\/span><\/small><\/span><span class="pz-amt">\$80 credit<\/span>/);
        assert.match(h, /data-hole="11">[\s\S]*?pz-ring eagle[^>]*>3<[\s\S]*?Sam Ortiz/, 'an eagle wears the double ring');
        assert.match(text(h), /Holes 5–8 tied · no skin, carried to 9/);
        assert.match(text(h), /Holes 16–18 tied: nothing carries past the last hole\./);
        assert.match(text(h), /Skins total 6 holes won · 25 carried · 31 skins \$620 pro shop credit/);
        assert.doesNotMatch(h, /background:|color:#|green|lime/i, 'no colour badge on a skin');
    });
    test('the amount box and the carryover switch save prizeSettings', () => {
        const sb = arrive('STK', F.starkey(), F.OWNER);
        assert.match(text(html(sb, 'prize-card-skins')), /No amount a skin yet · per round · carryover on/);
        change(sb, 'prize-skin-amount', '20');
        tap(sb, 'prize-card-skins', 'Carryover off');
        assert.deepEqual(writes(sb, /prizeSettings/), [
            { path: 'tournaments/STK/prizeSettings/perSkin', op: 'set', value: 20 },
            { path: 'tournaments/STK/prizeSettings/carryover', op: 'set', value: false }]);
        const off = arrive('STK', F.starkey({ prizeSettings: { perSkin: 20, carryover: false } }), F.OWNER);
        assert.match(text(html(off, 'prize-card-skins')), /Cascade 3 skins · Olympic 3 skins → \$120 pro shop credit/);
    });
    test('net is not offered as a number: the card says why skins are gross', () => {
        const sb = arrive('STK', F.starkey(), F.OWNER);
        assert.match(text(html(sb, 'prize-card-skins')), /Gross scores only\. Net skins need each golfer's handicap strokes on every hole/);
    });
});

describe('5. THE KPs CARD', () => {
    test('one-round event: the Contests tab\'s confirmed winners, each at the amount set', () => {
        const sb = arrive('ONE', F.oneDay({ prizeSettings: { perContest: 25 } }), F.OWNER, null, F.oneDayEntries());
        const t = text(html(sb, 'prize-card-kps'));
        assert.match(t, /Winners from the Contests tab · \$25 pro shop credit each/);
        assert.match(t, /7 Sam Ortiz closest · 6 ft 1 in \$25 credit 13 Dana Ruiz closest · 3 ft 8 in \$25 credit 18 Lee Park long drive · 287 yds \$25 credit/);
        change(sb, 'prize-kp-amount', '30');
        assert.deepEqual(writes(sb, /perContest/), [{ path: 'tournaments/ONE/prizeSettings/perContest', op: 'set', value: 30 }]);
    });
    test('a hole with no confirmed winner is listed as waiting, not paid', () => {
        const d = F.oneDay({ prizeSettings: { perContest: 25 } });
        d.contests.h13 = { kind: 'kp', allowGps: true };
        const t = text(html(arrive('ONE', d, F.OWNER, null, F.oneDayEntries()), 'prize-card-kps'));
        assert.match(t, /Hole 13 \(closest to the pin\): no winner confirmed yet\./);
        assert.doesNotMatch(t, /Dana Ruiz/);
    });
    test('multi-round event: the one-round limit is said on screen, and nothing is paid', () => {
        const t = text(html(arrive('STK', F.starkey({ prizeSettings: { perContest: 25 } }), F.OWNER), 'prize-card-kps'));
        assert.match(t, /Contest holes are for one-round events, so this event has none\./);
        assert.doesNotMatch(t, /\$25/);
    });
});

describe('6. POST RESULTS saves the three cards on the event', () => {
    test('one write to tournaments/<code>/prizeResults, beside payoutSpots, with the numbers the cards show', () => {
        const sb = arrive('ONE', F.oneDay({ prizeSettings: { perSkin: 20, perContest: 25 } }), F.OWNER, null, F.oneDayEntries());
        seedPlaces(sb, [80, 40]);
        tapStatic(sb, 'prize-post-btn');
        const w = writes(sb, /prizeResults/);
        assert.equal(w.length, 1);
        assert.equal(w[0].path, 'tournaments/ONE/prizeResults');
        const r = w[0].value;
        assert.deepEqual(r.postedAt, { '.sv': 'timestamp' });
        assert.equal(r.prizeType, 'credit');
        assert.equal(r.host, 'Papago');
        assert.deepEqual(r.places.map((g) => [g.flight, g.rows.map((x) => [x.rank, x.key, x.amount])]),
            [['A Flight', [[1, 'pA', 80], [2, 'pS', 40]]], ['B Flight', [[1, 'pD', 80], [2, 'pL', 40]]]]);
        assert.deepEqual(r.skins.rounds[0].won.map((x) => [x.hole, x.key, x.score, x.skins, x.amount]), [[2, 'pA', 3, 2, 40]]);
        assert.deepEqual(r.contests.rows.map((c) => [c.hole, c.key, c.amount]), [[7, 'pS', 25], [13, 'pD', 25], [18, 'pL', 25]]);
        assert.equal(r.total, 240 + 40 + 75);
        assert.equal(Object.keys(r).some((k) => /uid|email/i.test(k)), false, 'no uid or email on the posted record');
    });
});

// The posted record of section 6, as the database hands it back (postedAt a number).
function postedOneDay(extra) {
    const sb = arrive('ONE', F.oneDay({ prizeSettings: { perSkin: 20, perContest: 25 } }), F.OWNER, null, F.oneDayEntries());
    seedPlaces(sb, [80, 40]);
    tapStatic(sb, 'prize-post-btn');
    const rec = writes(sb, /prizeResults/)[0].value;
    rec.postedAt = Date.UTC(2026, 10, 22, 21, 10);
    return F.oneDay(Object.assign({ prizeSettings: { perSkin: 20, perContest: 25 }, prizeResults: rec }, extra || {}));
}

describe('7. THE RECAP AND MY RESULTS read the posted numbers', () => {
    test('the recap lists the posted results card by card, and every name is a button', () => {
        const sb = arrive('ONE', postedOneDay(), null, '?tourney=ONE&recap=1');
        assert.equal(el(sb, 'recap-prizes').style.display, 'block');
        assert.equal(el(sb, 'recap-winners').style.display, 'none', 'the posted cards take the winners card\'s place');
        const t = text(html(sb, 'recap-prizes'));
        assert.match(t, /^Tap your name to see My results\. Places · A Flight 1st Ana Diaz -1 \$80 credit 2nd Sam Ortiz \+1 \$40 credit Places · B Flight/);
        assert.match(t, /Skins · 2 2 3 Ana Diaz par 4 · 1 carried \$40 credit/);
        assert.match(t, /KPs & long drive 7 Sam Ortiz closest · 6 ft 1 in \$25 credit/);
        assert.match(t, /Total awarded pro shop credit \$355$/);
        assert.match(html(sb, 'recap-prizes'), /<small class="pz-tp pz-under">-1<\/small>/, 'under par is red');
        assert.match(html(sb, 'recap-prizes'), /<small class="pz-tp">\+1<\/small>/, 'over par is the normal colour');
    });
    test('tapping a name on the recap opens that golfer\'s My results, and See the full results goes back', () => {
        const sb = arrive('ONE', postedOneDay(), null, '?tourney=ONE&recap=1');
        tap(sb, 'recap-prizes', 'Dana Ruiz');
        assert.equal(el(sb, 'my-results-screen').style.display, 'block');
        assert.equal(el(sb, 'recap-screen').style.display, 'none');
        assert.equal(el(sb, 'my-results-sub').textContent, 'Papago Classic · Dana Ruiz · B Flight');
        const t = text(html(sb, 'my-results-card'));
        assert.equal(t, 'Places 1st · B Flight +1 $80 credit KPs Closest to the pin · hole 13 3 ft 8 in $25 credit '
            + 'Pro shop credit at the Papago pro shop $105 Spend it at the Papago pro shop. The organizer settles with the shop; HardPan collects nothing.');
        assert.match(el(sb, 'my-results-posted').textContent, /^Posted .+ by the organizer$/);
        tapStatic(sb, 'my-results-full');
        assert.equal(el(sb, 'recap-screen').style.display, 'block');
    });
    test('My results by URL (&me=), with Cash: no pro shop line, amounts read cash', () => {
        const sb = arrive('ONE', postedOneDay({ prizeType: 'cash' }), null, '?tourney=ONE&recap=1&me=pA');
        assert.equal(el(sb, 'my-results-screen').style.display, 'block');
        const t = text(html(sb, 'my-results-card'));
        assert.match(t, /^Places 1st · A Flight -1 \$80 cash Skins 3 2 skins · hole 2 par 4 · 1 carried \$40 cash Cash \$120$/);
        assert.doesNotMatch(t, /pro shop|HardPan/);
    });
    test('a golfer who won nothing, an unknown link, and results not posted yet each get one plain sentence', () => {
        const none = arrive('ONE', postedOneDay({ players: Object.assign(F.oneDay().players, { pZ: { id: 'pZ', name: 'Zed Ames', handicap: '0' } }) }), null, '?tourney=ONE&me=pZ');
        assert.equal(text(html(none, 'my-results-card')), 'No prize for Zed Ames on the posted results.');
        assert.equal(text(html(arrive('ONE', postedOneDay(), null, '?tourney=ONE&recap=1&me=nobody'), 'my-results-card')), 'No golfer with that link in this event.');
        const before = arrive('ONE', F.oneDay(), null, '?tourney=ONE&recap=1&me=pA');
        assert.match(text(html(before, 'my-results-card')), /^Results are not posted yet\./);
    });
    test('before posting the recap is exactly today\'s: the winners card, no prize card', () => {
        const sb = arrive('ONE', F.oneDay(), null, '?tourney=ONE&recap=1', F.oneDayEntries());
        assert.equal(el(sb, 'recap-prizes').style.display, 'none');
        assert.equal(el(sb, 'recap-winners').style.display, 'block');
        assert.match(text(html(sb, 'recap-winners')), /Winners/, 'positive: today\'s winners card rendered');
        assert.doesNotMatch(html(sb, 'recap-winners'), /\$/);
    });
});

describe('8. GUARDS', () => {
    test('payouts.js is byte-identical (allocatePlacePayouts is called, never edited)', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'payouts.js'))).digest('hex');
        assert.equal(sha, 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    });
    test('no new UI string says protected, secure or locked', () => {
        const prizes = fs.readFileSync(path.join(REPO_ROOT, 'tournament-prizes.js'), 'utf8') + fs.readFileSync(path.join(REPO_ROOT, 'skins.js'), 'utf8');
        const page = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
        const at = page.indexOf('// PAYOUTS / PRIZE RESULTS (PO build');
        const block = page.slice(at, page.indexOf('// ROUNDS', at)) + page.slice(page.indexOf('// ===== PO (2026-11-14): THE RECAP BY CARD'), page.indexOf('function shareRecap()'));
        assert.ok(at > 0 && /postPrizeResults/.test(block) && /renderMyResults/.test(block), 'positive: both PO blocks were sliced');
        const strings = (s) => (s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []);
        assert.deepEqual(strings(block + prizes).filter((x) => /protected|secure|locked/i.test(x)), []);
    });
});
