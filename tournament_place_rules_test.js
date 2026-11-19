// ============================================================================
// PLACE RULES - Starkey settings 1-7, layout B (Manny 2026-11-19: "Starkey
// settings: layout B ... Build order: places 1-7 ... Preview only"). STRICT
// lane: money on screen.
//
// THE USER PATH, in mini-dom, the way tournament_prizes_cards_test.js does it:
// every phone ARRIVES at ?tourney=CODE, the record goes to the page's own value
// listener, the organizer signs in through the page's own auth listener, and a
// tap runs the onclick the page itself rendered. No render function is called
// by name. Section A is the DEFAULT STATE: no rule saved, the screen exactly as
// it was, and the new card offering "Places only" as what is on.
//
// THE FIXTURE is helpers/prize-fixtures.js starkey() (two rounds, A and B
// flights, 8 golfers) with handicaps that make gross and net differ:
// Ana 8, Sam 0, Joe 2, Mia 1, Lee 0, Dana 6, Kim 10, Ray 3.
//
// WHAT MINI-DOM CANNOT PROVE: layout; the owner's typed place amounts (value=""
// is not parsed - sections that need the owner's rows seed the boxes and say
// so); rendered text in a real browser. tools/place-rules-check.js arrives cold
// in Chrome, reads innerText, calls no page function, and writes the screenshots.
//
// BASELINE (final file, 20 tests) against main 2cc44b4d (tournament.html sha
// 6c47220d6b0e..., tournament-prizes.js 5e642e7d830e..., swapped in and restored by sha
// from saved copies): 1 PASS / 19 FAIL. The 1 that passes is A1 (no rule saved:
// the screen as it was, true there by definition). E2 fails there because the
// functions it calls do not exist. 1 + 19 = 20.
// After the build: 20 PASS / 0 FAIL.
// NEGATIVE CONTROLS on this final file (each mutated in place, restored by
// copying the saved file back; tournament-prizes.js d125fa964781 and tournament.html
// 2659c1342f52 printed beside RESTORED-OK):
//   1. placeGroups never takes the ruled path     -> 13 fail (A3, C1-C8, D1-D3, E1;
//      the B taps and F1's line do not compute places, so they stay green, rightly)
//   2. 'larger' treated as gross first            -> 1 fail, C3
//   3. 'full' ties fall back to split             -> 1 fail, C4
//   4. 'dollar' rounding not applied              -> 1 fail, C5
//   5. edits not applied to rows                  -> 2 fail, D2 D3
//   6. a flight's own amounts ignored             -> 1 fail, C6
//   7. the golfer's line ignores a flight's own amounts (tournament.html) -> 1 fail, F1
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const HC = { pA: '8', pS: '0', pJ: '2', pM: '1', pL: '0', pD: '6', pK: '10', pR: '3' };
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
function rec(places, extra) {
    const r = F.starkey(extra);
    Object.keys(r.players).forEach((k) => { r.players[k].handicap = HC[k]; });
    if (places) r.prizeSettings = Object.assign({}, r.prizeSettings || {}, { places });
    return r;
}
function arrive(r, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.fire = (x) => sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => plain(x), exists: () => true }));
    sb.fire(r);
    if (user) sb.__auth.setUser(user);
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const results = (sb) => text(html(sb, 'payout-results')).replace(/ pro shop credit/g, '');
// the text of one table, from its heading to the next heading
function table(sb, name) {
    const t = results(sb);
    const i = t.indexOf(name + ' ');
    assert.ok(i !== -1, 'no table "' + name + '" in: ' + t.slice(0, 300));
    const rest = t.slice(i + name.length + 1);
    const j = rest.search(/ [AB] Flight( ·|$| )/);
    return j === -1 ? rest : rest.slice(0, j);
}
// Tap the first rendered button in #id whose text is `label` (and whose onclick matches `re`, if given).
function tap(sb, id, label, re) {
    const rx = /<button([^>]*)onclick="([^"]+)"([^>]*)>([\s\S]*?)<\/button>/g;
    let m, hit = null;
    while ((m = rx.exec(html(sb, id)))) if (text(m[4]) === label && (!re || re.test(m[2] + m[1] + m[3]))) { hit = m; break; }
    assert.ok(hit, `no "${label}" button in #${id}`);
    const ds = {};
    (hit[1] + hit[3]).replace(/data-([a-z]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v.replace(/&amp;/g, '&'); });
    sb.__tapThis = { dataset: ds, value: '' };
    vm.runInContext(`(function () { ${hit[2]} }).call(__tapThis)`, sb);
}
const writes = (sb) => plain(sb.__dbWrites.filter((x) => /prizeSettings\/places/.test(x.path)));
const seedPlaces = (sb, list) => list.forEach((v, i) => { el(sb, 'payout-spot-' + i).value = String(v); });

describe('A. THE DEFAULT STATE: nothing saved, the screen as it was', () => {
    const BEFORE = 'A Flight 1st — Ana Diaz $100 2nd — Sam Ortiz $60 3rd — Joe Fox $20 3rd — Mia Chen $20 B Flight 1st — Lee Park $100 2nd — Dana Ruiz $50 2nd — Ray Diaz $50';
    test('A1 a golfer sees the places exactly as before (one table per flight, the event total, ties split)', () => {
        assert.equal(results(arrive(rec(null), null)), BEFORE);
    });
    test('A2 the organizer gets the "How places go" card: Places only is on, and every sentence says what is true today', () => {
        const sb = arrive(rec(null), F.OWNER);
        assert.equal(el(sb, 'prize-rules-card').style.display, 'block');
        const t = text(html(sb, 'prize-rules-card'));
        assert.match(html(sb, 'place-presets') || html(sb, 'prize-rules-card'), /class="pz-chip on" aria-pressed="true" data-p="simple"/);
        assert.match(t, /Places go by gross , as the event is scored\./);
        assert.match(t, /Places are for what Prizes go by says below\./);
        assert.match(t, /Ties split the places they fill\./);
        assert.match(t, /Shares go to the cent \./);
        assert.match(t, /A golfer can win more than one place\./);
    });
    test('A3 a rule node with nothing chosen gives the same amounts to the same golfers (ties now marked T)', () => {
        assert.equal(results(arrive(rec({ ties: 'split' }), null)), 'A Flight 1st — Ana Diaz $100 2nd — Sam Ortiz $60 T3rd — Joe Fox $20 T3rd — Mia Chen $20 B Flight 1st — Lee Park $100 T2nd — Dana Ruiz $50 T2nd — Ray Diaz $50');
    });
});

describe('B. THE ORGANIZER\'S TAPS write the rule, owner only', () => {
    test('B1 Start from: Gross and net writes the whole preset in one update', () => {
        const sb = arrive(rec(null), F.OWNER);
        tap(sb, 'prize-rules-card', 'Gross and net', /setPlacePreset/);
        assert.deepEqual(writes(sb), [{ path: 'tournaments/STK/prizeSettings/places', op: 'update', value: { on: 'both', scope: 'event', ties: 'split', rounding: 'cents', onePrize: 'gross', within: 'event' } }]);
    });
    test('B2 Change on each sentence opens its choices; a tap saves that one field', () => {
        const sb = arrive(rec({ ties: 'split' }), F.OWNER);
        const cases = [['ties', 'Each gets the full prize', 'ties', 'full'], ['rounding', 'Down to the dollar', 'rounding', 'dollar'],
            ['one', 'The larger prize', 'onePrize', 'larger'], ['scope', 'Each round', 'scope', 'round'], ['on', 'Gross and net', 'on', 'both']];
        cases.forEach(([sent, label, field, v]) => {
            tap(sb, 'prize-rules-card', 'Change', new RegExp(`togglePlaceRule\\('${sent}'\\)`));
            tap(sb, 'prize-rules-card', label, new RegExp(`setPlaceRule\\('${field}'`));
        });
        assert.deepEqual(writes(sb).map((w) => [w.path.replace('tournaments/STK/prizeSettings/places/', ''), w.op, w.value]),
            [['ties', 'set', 'full'], ['rounding', 'set', 'dollar'], ['onePrize', 'set', 'larger'], ['scope', 'set', 'round'], ['on', 'set', 'both']]);
    });
    test('B3 a flight goes by its own basis and amounts; Places only removes every rule', () => {
        const sb = arrive(rec({ ties: 'split' }), F.OWNER);
        tap(sb, 'prize-rules-card', 'Change', /togglePlaceRule\('amounts'\)/);
        tap(sb, 'prize-rules-card', 'Net', /setFlightPlaceOn\('fB'/);
        const m = /id="place-spots-fB"[^>]*onchange="([^"]+)"/.exec(html(sb, 'prize-rules-card'));
        assert.ok(m, 'positive: B Flight has its own amounts box');
        sb.__tapThis = { dataset: { f: 'fB' }, value: '$250, 200 150/100' };
        vm.runInContext(`(function () { ${m[1]} }).call(__tapThis)`, sb);
        tap(sb, 'prize-rules-card', 'Places only', /setPlacePreset/);
        assert.deepEqual(writes(sb).map((w) => [w.path.replace('tournaments/STK/prizeSettings/places', ''), w.op, w.value]),
            [['/flights/fB/on', 'set', 'net'], ['/flights/fB/spots', 'set', [250, 200, 150, 100]], ['', 'remove', null]]);
    });
});

describe('C. WHAT EVERY PHONE SHOWS, from the saved rule (a golfer\'s phone)', () => {
    test('C1 gross and net for each round: four tables per flight, named flight · basis · round', () => {
        const t = results(arrive(rec({ on: 'both', scope: 'round' }), null));
        ['A Flight · Gross · Cascade', 'A Flight · Net · Cascade', 'A Flight · Gross · Olympic', 'A Flight · Net · Olympic',
            'B Flight · Gross · Cascade', 'B Flight · Net · Cascade', 'B Flight · Gross · Olympic', 'B Flight · Net · Olympic'].forEach((n) => assert.ok(t.indexOf(n) !== -1, n));
        assert.doesNotMatch(t, /Event total/);
    });
    test('C2 one prize per golfer, gross first, in each round: Cascade\'s gross winners leave the Cascade net table', () => {
        const off = arrive(rec({ on: 'both', scope: 'round', onePrize: 'off' }), null);
        assert.equal(table(off, 'A Flight · Net · Cascade'), '1st — Ana Diaz $100 T2nd — Sam Ortiz $50 T2nd — Joe Fox $50', 'positive: without the rule they win both');
        const sb = arrive(rec({ on: 'both', scope: 'round', onePrize: 'gross', within: 'round' }), null);
        assert.equal(table(sb, 'A Flight · Gross · Cascade'), '1st — Ana Diaz $100 2nd — Sam Ortiz $60 3rd — Joe Fox $40');
        assert.equal(table(sb, 'A Flight · Net · Cascade'), '1st — Mia Chen $100');
    });
    test('C3 the larger prize: Joe\'s net share ($50) beats his gross 3rd ($40), so he leaves the gross table', () => {
        const sb = arrive(rec({ on: 'both', scope: 'round', onePrize: 'larger', within: 'round' }), null);
        assert.equal(table(sb, 'A Flight · Gross · Cascade'), '1st — Ana Diaz $100 2nd — Sam Ortiz $60');
        assert.equal(table(sb, 'A Flight · Net · Cascade'), '1st — Joe Fox $100 2nd — Mia Chen $60');
    });
    test('C4 each tied golfer gets the full prize: Dana and Ray tied 2nd take $60 each, not $50', () => {
        const split = arrive(rec({ on: 'gross', scope: 'round' }), null);
        assert.equal(table(split, 'B Flight · Gross · Olympic'), '1st — Lee Park $100 T2nd — Dana Ruiz $50 T2nd — Ray Diaz $50');
        const full = arrive(rec({ on: 'gross', scope: 'round', ties: 'full' }), null);
        assert.equal(table(full, 'B Flight · Gross · Olympic'), '1st — Lee Park $100 T2nd — Dana Ruiz $60 T2nd — Ray Diaz $60');
    });
    test('C5 down to the dollar: a three-way tie for 1st of $200 is $66 each, not $66.67', () => {
        assert.equal(table(arrive(rec({ on: 'gross', scope: 'round' }), null), 'B Flight · Gross · Cascade'), 'T1st — Lee Park $66.67 T1st — Dana Ruiz $66.67 T1st — Ray Diaz $66.67');
        assert.equal(table(arrive(rec({ on: 'gross', scope: 'round', rounding: 'dollar' }), null), 'B Flight · Gross · Cascade'), 'T1st — Lee Park $66 T1st — Dana Ruiz $66 T1st — Ray Diaz $66');
    });
    test('C6 a flight\'s own basis and amounts: B Flight net only, four places of its own', () => {
        const sb = arrive(rec({ on: 'both', scope: 'event', flights: { fB: { on: 'net', spots: [250, 200, 150, 100] } } }), null);
        const t = results(sb);
        assert.ok(t.indexOf('A Flight · Gross · Event total') !== -1 && t.indexOf('A Flight · Net · Event total') !== -1, 'positive: A Flight keeps both');
        assert.equal(t.indexOf('B Flight · Gross'), -1, 'B Flight has no gross table');
        assert.match(table(sb, 'B Flight · Net · Event total'), /^1st — Kim Vo \$250 /);
        assert.match(table(sb, 'B Flight · Net · Event total'), /\$100$/);
    });
    test('C7 event total and each round: three tables per basis per flight', () => {
        const t = results(arrive(rec({ on: 'gross', scope: 'both' }), null));
        assert.deepEqual(t.match(/A Flight · Gross · [A-Za-z ]+?(?= 1st| T1st)/g), ['A Flight · Gross · Event total', 'A Flight · Gross · Cascade', 'A Flight · Gross · Olympic']);
    });
    test('C8 net on a course with no real stroke index: the table says why, and lists no one', () => {
        const r = rec({ on: 'net', scope: 'round' });
        r.rounds.r1.courseIndexSynthetic = true;
        const t = results(arrive(r, null));
        assert.match(t, /A Flight · Net · Cascade Net places need a real scorecard \(a stroke index\) for this course\./);
        assert.match(table(arrive(r, null), 'A Flight · Net · Olympic'), /^1st — /, 'positive: the other round still lists');
    });
});

describe('D. ADJUST BEFORE POSTING (the owner\'s boxes seeded: mini-dom does not parse value="")', () => {
    const R = { on: 'gross', scope: 'round' };
    test('D1 Adjust opens an amount and a note; Save writes that one row\'s edit', () => {
        const sb = arrive(rec(R), F.OWNER);
        seedPlaces(sb, [100, 60, 40]); sb.fire(rec(R));
        tap(sb, 'payout-results', 'Adjust', /data-table="fA\|gross\|r2" data-key="pS"|openPlaceEdit/);
        assert.match(html(sb, 'payout-results'), /id="place-edit-amount"/);
        el(sb, 'place-edit-amount').value = '75'; el(sb, 'place-edit-note').value = 'committee call';
        tap(sb, 'payout-results', 'Save', /savePlaceEdit/);
        const w = writes(sb);
        assert.equal(w.length, 1);
        assert.match(w[0].path, /^tournaments\/STK\/prizeSettings\/places\/edits\/f[AB]\|gross\|r[12]\/p[A-Z]$/);
        assert.deepEqual(w[0].value, { amount: 75, note: 'committee call' });
    });
    test('D2 a saved edit shows on every phone with its note; the rest of the table is the rule\'s', () => {
        const r = rec(Object.assign({ edits: { 'fB|gross|r2': { pD: { amount: 60, note: 'committee call' } } } }, R));
        assert.equal(table(arrive(r, null), 'B Flight · Gross · Olympic'), '1st — Lee Park $100 T2nd — Dana Ruiz · set by the organizer: committee call $60 T2nd — Ray Diaz $50');
    });
    test('D3 Post results carries the edited row, marked set', () => {
        const r = rec(Object.assign({ edits: { 'fB|gross|r2': { pD: { amount: 60, note: 'committee call' } } } }, R));
        const sb = arrive(r, F.OWNER);
        seedPlaces(sb, [100, 60, 40]); sb.fire(r);
        vm.runInContext("document.getElementById('prize-post-btn') && postPrizeResults()", sb);
        const post = plain(sb.__dbWrites.filter((x) => x.path === 'tournaments/STK/prizeResults'))[0].value;
        const g = post.places.find((p) => p.flight === 'B Flight · Gross · Olympic');
        assert.ok(g, 'positive: the table is in the record under its name');
        assert.deepEqual(g.rows.find((x) => x.key === 'pD'), { rank: 2, key: 'pD', name: 'Dana Ruiz', amount: 60, toPar: g.rows.find((x) => x.key === 'pD').toPar, set: true, note: 'committee call' });
    });
});

describe('E. NOBODY ELSE', () => {
    test('E1 a golfer sees the tables but no card and no Adjust', () => {
        const sb = arrive(rec({ on: 'gross', scope: 'round' }), null);
        assert.equal(el(sb, 'prize-rules-card').style.display, 'none');
        assert.match(results(sb), /B Flight · Gross · Olympic/, 'positive: the tables are there');
        assert.doesNotMatch(html(sb, 'payout-results'), /Adjust/);
    });
    test('E2 a signed-in stranger: no card, and every rule write refuses them', () => {
        const sb = arrive(rec({ on: 'gross', scope: 'round' }), STRANGER);
        assert.equal(html(sb, 'prize-rules-card'), '');
        ["setPlaceRule('ties', 'full')", "setPlacePreset('both')", "setFlightPlaceOn('fB', 'net')", "setFlightPlaceSpots('fB', '1,2')", "clearPlaceEdit('fB|gross|r2', 'pD')"].forEach((c) => vm.runInContext(c, sb));
        assert.deepEqual(writes(sb), []);
    });
});

describe('F. THE GOLFER\'S AMOUNTS LINE TELLS THE TRUTH about a flight\'s own amounts', () => {
    test('F1 B Flight with its own amounts: the line names them, and the other flights\' separately', () => {
        const sb = arrive(rec({ on: 'both', scope: 'event', flights: { fB: { on: 'net', spots: [250, 200, 150, 100] } } }), null);
        assert.equal(text(html(sb, 'payout-public-amounts')).replace(/ pro shop credit/g, ''), 'B Flight: 1st $250 · 2nd $200 · 3rd $150 · 4th $100 Other flights: 1st $100 · 2nd $60 · 3rd $40');
        assert.equal(text(html(arrive(rec(null), null), 'payout-public-amounts')).replace(/ pro shop credit/g, ''), 'Each flight: 1st $100 · 2nd $60 · 3rd $40', 'positive: unchanged with no rule');
    });
});
