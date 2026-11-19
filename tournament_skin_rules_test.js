// ============================================================================
// SKINS RULES - Starkey settings 8-11, layout B (Manny 2026-11-19: "then skins
// 8-11", "Net skins full handicap (editable)", "Preview only"). STRICT lane.
//
// THE USER PATH, in mini-dom (as tournament_place_rules_test.js): every phone
// arrives at ?tourney=STK, the record reaches the page's own listener, and taps
// run the onclick the page rendered. No render function is called by name.
// Section A is the DEFAULT STATE: no skins rule saved, the card as it was.
//
// THE FIXTURE: helpers/prize-fixtures.js starkey() (8 golfers, two rounds,
// carryover off here), handicaps Ana 8, Sam 0, Joe 2, Mia 1, Lee 0, Dana 6,
// Kim 10, Ray 3, and the course's stroke index = hole number. Worked by hand:
//   Cascade 8: Ana and Sam gross 4, the rest 5. Ana's 8 strokes fall on holes
//     1-8, so her net is 3: the only net skin there. At half handicap (4
//     strokes, holes 1-4) she is back to 4 and ties Sam: no net skin.
//   Cascade 15: Dana gross 2 wins gross AND net. With one skin per golfer per
//     hole she sits out the net skin; the rest tie, so nobody takes it.
//   Shares: Men (A Flight, gross and net) give out 18 skins, $1,000 / 18 =
//     $55.55, down to $55. Ladies (B Flight, gross) give out 2: $200 / 2 = $100.
//
// WHAT MINI-DOM CANNOT PROVE: layout, typed values (seeded where needed).
// tools/place-rules-check.js reads the card in cold Chrome.
//
// BASELINE (final file, 12 tests) against preview-starkey-places ee34111e (the
// places build, before skins: tournament.html, tournament-prizes.js and skins.js
// swapped in, restored by sha from saved copies): 0 PASS / 12 FAIL. Even A1 and
// A2 fail there: the card's sentence about where net is set did not exist.
// After the build: 12 PASS / 0 FAIL.
// NEGATIVE CONTROLS (each mutated in place, restored by copying the saved files
// back; e4d4a9d68587 fb20e55e82ea c3717ac75248 printed beside RESTORED-OK):
//   1. skinsSummary never takes the ruled path          -> 7 fail, C1-C7
//   2. the allowance ignored (always full)               -> 1 fail, C2
//   3. one skin per golfer per hole ignored              -> 1 fail, C4
//   4. a game's share ignored (the per-skin amount used) -> 2 fail, C5 C7
//   5. a game's flights ignored                          -> 2 fail, C5 C7
//   6. skins.js nets nothing (strokes ignored)           -> 5 fail, C1 C2 C4 C5 C7
//   7. Post results prices every skin at one amount      -> 1 fail, C7
// The B taps and D1 do not compute skins, so they rightly stay green under 1-7.
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
function rec(skins, extra) {
    const r = F.starkey(Object.assign({ prizeSettings: Object.assign({ perSkin: 20, carryover: false }, skins ? { skins } : {}) }, extra || {}));
    Object.keys(r.players).forEach((k) => { r.players[k].handicap = HC[k]; });
    return r;
}
function arrive(r, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => plain(r), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().replace(/ pro shop credit| credit/g, '');
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
function changeIn(sb, id, re, value, dataset) {
    const m = new RegExp(`<input[^>]*${re}[^>]*onchange="([^"]+)"`).exec(html(sb, id)) || new RegExp(`<input[^>]*onchange="([^"]+)"[^>]*${re}`).exec(html(sb, id));
    assert.ok(m, 'no input ' + re);
    sb.__tapThis = { dataset: dataset || {}, value: String(value) };
    vm.runInContext(`(function () { ${m[1]} }).call(__tapThis)`, sb);
}
const writes = (sb) => plain(sb.__dbWrites.filter((x) => /prizeSettings\/skins/.test(x.path))).map((w) => [w.path.replace('tournaments/STK/prizeSettings/skins', ''), w.op, w.value]);
// the organizer's Skins card, opened with its own Open button
function card(sb) { tap(sb, 'prize-card-skins', 'Open'); return text(html(sb, 'prize-card-skins')); }
function panel(t, name) {
    // the heading, not the summary line ("Net · Cascade 2 skins · ...")
    let i = t.indexOf(name + ' ', t.indexOf('above.') + 1);
    while (i !== -1 && /^\d+ skins? /.test(t.slice(i + name.length + 1))) i = t.indexOf(name + ' ', i + 1);
    assert.ok(i !== -1, 'no panel ' + name + ' in ' + t.slice(0, 300));
    const rest = t.slice(i + name.length + 1);
    const j = rest.search(/ (Men · |Ladies · |Gross · |Net · )[A-Z][a-z]+ |Skins total/);
    return j === -1 ? rest : rest.slice(0, j);
}
const G = (o) => Object.assign({ name: '', basis: 'gross', createdAt: 1 }, o);

describe('A. THE DEFAULT STATE: no skins rule, the card as it was', () => {
    test('A1 the Skins card is gross, one game, $20 a skin, and points to where net is set', () => {
        const t = card(arrive(rec(null), F.OWNER));
        assert.match(t, /^Skins · gross Close \$20 a skin · per round · carryover off/);
        assert.match(t, /Gross scores only\. Net skins are set in How prizes go above\./);
        assert.match(t, /Round 1 · Cascade 4 3 Ray Diaz par 4 \$20/, 'positive: today\'s round heading and rows');
    });
    test('A2 the card\'s Skins sentences say one game, the whole field, gross', () => {
        const t = text(html(arrive(rec(null), F.OWNER), 'prize-rules-card'));
        assert.match(t, /Skins Skins: one game for the whole field , gross \. Change/);
        assert.match(t, /Each skin is \$20 \(set in Skins below\)\./);
        assert.doesNotMatch(t, /Net skins use/, 'no net, no allowance sentence');
    });
});

describe('B. THE ORGANIZER\'S TAPS write the skins rule, owner only', () => {
    test('B1 + Add a game writes a gross game; its basis, flights, name and Remove each write one field', () => {
        const sb = arrive(rec({ games: { m: G({ name: 'Men', createdAt: 1 }) } }), F.OWNER);
        tap(sb, 'prize-rules-card', 'Change', /togglePlaceRule\('skins'\)/);
        tap(sb, 'prize-rules-card', '+ Add a game');
        tap(sb, 'prize-rules-card', 'Gross and net', /setSkinGame/);
        tap(sb, 'prize-rules-card', 'A Flight', /toggleSkinGameFlight/);
        changeIn(sb, 'prize-rules-card', 'placeholder="Game name', 'Ladies', { g: 'm' });
        tap(sb, 'prize-rules-card', 'Remove this game');
        const w = writes(sb);
        assert.match(w[0][0], /^\/games\/g[0-9a-z]+$/);
        assert.deepEqual(w[0].slice(1), ['set', { name: '', basis: 'gross', createdAt: { '.sv': 'timestamp' } }]);
        assert.deepEqual(w.slice(1), [['/games/m/basis', 'set', 'both'], ['/games/m/flights/fA', 'set', true], ['/games/m/name', 'set', 'Ladies'], ['/games/m', 'remove', null]]);
    });
    test('B2 value, share, allowance and one skin per hole each write their field', () => {
        const sb = arrive(rec({ games: { m: G({ name: 'Men', basis: 'both' }) } }), F.OWNER);
        tap(sb, 'prize-rules-card', 'Change', /togglePlaceRule\('skinvalue'\)/);
        tap(sb, 'prize-rules-card', 'Each game shares an amount');
        const sb2 = arrive(rec({ games: { m: G({ name: 'Men', basis: 'both' }) }, value: 'share' }), F.OWNER);
        tap(sb2, 'prize-rules-card', 'Change', /togglePlaceRule\('skinvalue'\)/);
        changeIn(sb2, 'prize-rules-card', 'inputmode="decimal"', '$4,692', { g: 'm' });
        tap(sb2, 'prize-rules-card', 'Change', /togglePlaceRule\('allowance'\)/);
        tap(sb2, 'prize-rules-card', '¾');
        tap(sb2, 'prize-rules-card', 'Change', /togglePlaceRule\('oneperhole'\)/);
        tap(sb2, 'prize-rules-card', 'One skin per golfer per hole');
        assert.deepEqual(writes(sb), [['/value', 'set', 'share']]);
        assert.deepEqual(writes(sb2), [['/games/m/share', 'set', 4692], ['/allowance', 'set', 0.75], ['/onePerHole', 'set', true]]);
    });
});

describe('C. WHAT THE CARD SHOWS from the saved rule', () => {
    test('C1 net skins, full handicap: Ana\'s stroke on Cascade 8 makes her net 3 the only skin there', () => {
        const t = card(arrive(rec({ games: { g: G({ basis: 'net' }) } }), F.OWNER));
        assert.match(panel(t, 'Net · Cascade'), /^8 3 Ana Diaz par 4 \$20 15 2 Dana Ruiz par 3 \$20 /);
    });
    test('C2 half handicap: Ana\'s strokes stop at hole 4, so Cascade 8 is a tie and no skin', () => {
        const t = card(arrive(rec({ games: { g: G({ basis: 'net' }) }, allowance: 0.5 }), F.OWNER));
        assert.match(panel(t, 'Net · Cascade'), /^9 4 Ana Diaz par 5 \$20 15 2 Dana Ruiz par 3 \$20 /);
        assert.match(text(html(arrive(rec({ games: { g: G({ basis: 'net' }) }, allowance: 0.5 }), F.OWNER), 'prize-rules-card')), /Net skins use ½ of each handicap \./);
    });
    test('C3 gross and net: both panels per round, and a golfer may take both on a hole (Dana, Cascade 15)', () => {
        const t = card(arrive(rec({ games: { g: G({ basis: 'both' }) } }), F.OWNER));
        assert.match(panel(t, 'Gross · Cascade'), /15 2 Dana Ruiz par 3 \$20/);
        assert.match(panel(t, 'Net · Cascade'), /15 2 Dana Ruiz par 3 \$20/);
    });
    test('C4 one skin per golfer per hole: Dana keeps the gross skin on 15; the net skin there goes to nobody (the rest tie)', () => {
        const t = card(arrive(rec({ games: { g: G({ basis: 'both' }) }, onePerHole: true }), F.OWNER));
        assert.match(panel(t, 'Gross · Cascade'), /15 2 Dana Ruiz par 3 \$20/);
        assert.equal(panel(t, 'Net · Cascade').indexOf('15 2 Dana'), -1);
        assert.match(panel(t, 'Net · Cascade'), /^8 3 Ana Diaz par 4 \$20 /, 'positive: the net panel still has Ana on 8');
    });
    test('C5 two games over flights, each sharing an amount: Men $1,000 over 18 skins = $55; Ladies $200 over 2 = $100', () => {
        const r = rec({ value: 'share', games: { m: G({ name: 'Men', flights: { fA: true }, basis: 'both', share: 1000, createdAt: 1 }), l: G({ name: 'Ladies', flights: { fB: true }, share: 200, createdAt: 2 }) } });
        const t = card(arrive(r, F.OWNER));
        assert.match(t, /^Skins Close Men: \$55 a skin · Ladies: \$100 a skin \(each game's share over its skins, down to the dollar\)/);
        assert.match(panel(t, 'Ladies · Cascade'), /^4 3 Ray Diaz par 4 \$100 15 2 Dana Ruiz par 3 \$100/);
        assert.doesNotMatch(panel(t, 'Men · Gross · Olympic'), /Ray|Dana|Lee|Kim/, 'B Flight is not in the Men game');
        assert.doesNotMatch(t, /A skin \$/, 'no per-skin box when games share an amount');
    });
    test('C6 net on a course with no real stroke index: the panel says why, the gross panel still counts', () => {
        const r = rec({ games: { g: G({ basis: 'both' }) } });
        r.rounds.r1.courseIndexSynthetic = true;
        const t = card(arrive(r, F.OWNER));
        assert.match(t, /Net · Cascade Net skins need a real scorecard \(a stroke index\) for this course\./);
        assert.match(panel(t, 'Gross · Cascade'), /^4 3 Ray Diaz/);
    });
    test('C7 Post results carries each panel and each skin at its game\'s value', () => {
        const r = rec({ value: 'share', games: { m: G({ name: 'Men', flights: { fA: true }, basis: 'both', share: 1000, createdAt: 1 }), l: G({ name: 'Ladies', flights: { fB: true }, share: 200, createdAt: 2 }) } });
        const sb = arrive(r, F.OWNER);
        vm.runInContext('postPrizeResults()', sb);
        const post = plain(sb.__dbWrites.filter((x) => x.path === 'tournaments/STK/prizeResults'))[0].value;
        const names = post.skins.rounds.map((x) => x.name);
        assert.deepEqual(names, ['Men · Gross · Cascade', 'Men · Net · Cascade', 'Men · Gross · Olympic', 'Men · Net · Olympic', 'Ladies · Cascade', 'Ladies · Olympic']);
        const lc = post.skins.rounds[4].won.map((x) => [x.hole, x.name, x.amount]);
        assert.deepEqual(lc, [[4, 'Ray Diaz', 100], [15, 'Dana Ruiz', 100]]);
        assert.equal(post.skins.total, 18 * 55 + 2 * 100);
    });
});

describe('D. NOBODY ELSE', () => {
    test('D1 a stranger: every skins rule write refuses them', () => {
        const sb = arrive(rec({ games: { m: G({ name: 'Men' }) } }), STRANGER);
        ["addSkinGame()", "setSkinGame('m', 'basis', 'net')", "setSkinRule('value', 'share')", "setSkinRule('allowance', '0.5')", "toggleSkinGameFlight('m', 'fA')", "removeSkinGame('m')"].forEach((c) => vm.runInContext(c, sb));
        assert.deepEqual(writes(sb), []);
    });
});
