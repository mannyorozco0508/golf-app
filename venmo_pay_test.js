// ============================================================================
// HARDPAN - SETTLE UP WITH VENMO / CASH APP (2.1 part D; from parked gps-venmo)
//
// venmo-pay.js's pure parts in a sandbox (usernames, the three links, the note,
// the fewest payments read from the page's own lines), the words on the screen,
// links only (no payment API), the LIVE rules (organizer only) and the PROPOSED
// rules (the group) for exactly the writes it makes (targaryen, in memory),
// and the wiring (Results page, HardPan only, the switch).
// tools/venmo-check.js drives the Results page in Chrome.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'venmo-pay.js'));
const skip = ON ? false : 'Consumer tree: no Venmo';
function V() {
    const sb = { encodeURIComponent, String, Number, Math, JSON, Object, Array, Date, URLSearchParams, Promise, isNaN, location: { search: '' } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('venmo-pay.js'), sb); return sb.HardPanVenmo;
}
const code = () => read('venmo-pay.js').replace(/^\s*\/\/.*$/gm, '');

test('usernames: a leading @ / $ goes; anything that cannot be a Venmo username or cashtag is refused', { skip }, () => {
    const v = V();
    assert.equal(v.cleanUser(' @Manny-Orozco '), 'Manny-Orozco');
    assert.equal(v.cleanUser('@@bob_1'), 'bob_1');
    ['', '@', 'has space', 'a/b', 'x', 'javascript:alert(1)', 'a'.repeat(31)].forEach((u) => assert.equal(v.cleanUser(u), null, JSON.stringify(u)));
    assert.equal(v.cleanCash(' $Manny22 '), 'Manny22');
    ['', '$', '12345', 'has space', 'a'.repeat(21), '$a/b'].forEach((u) => assert.equal(v.cleanCash(u), null, JSON.stringify(u)));
    assert.equal(v.nameKey(' Ann  Able. '), 'ann able_');
});

test('the links: Venmo pay / request (venmo.com/u/, the app claims /u/*) and Cash App; never venmo://', { skip }, () => {
    const v = V();
    const note = 'HardPan · Dobson Ranch Oct 20';
    assert.equal(v.venmoLink('bob-baker-1', 12.5, note, false), 'https://venmo.com/u/bob-baker-1?txn=pay&amount=12.50&note=HardPan%20%C2%B7%20Dobson%20Ranch%20Oct%2020');
    assert.equal(v.venmoLink('bob-baker-1', 25, note, true), 'https://venmo.com/u/bob-baker-1?txn=charge&amount=25&note=HardPan%20%C2%B7%20Dobson%20Ranch%20Oct%2020');
    assert.equal(v.cashLink('Skeens', 25), 'https://cash.app/$Skeens/25');
    assert.equal(v.cashLink('Skeens', 7.5), 'https://cash.app/$Skeens/7.50');
    assert.ok(!/venmo:\/\//.test(code()), 'no venmo:// link in the code');
});

test('the note: "HardPan · <course> <date>" - the round date, else when it was made', { skip }, () => {
    const v = V();
    assert.equal(v.noteFor({ courseName: 'Dobson Ranch', date: '2026-10-20' }), 'HardPan · Dobson Ranch Oct 20');
    assert.equal(v.noteFor({ courseName: 'Papago', createdAt: new Date(2026, 9, 18, 9).getTime() }), 'HardPan · Papago Oct 18');
    assert.equal(v.noteFor({}, new Date(2026, 0, 2).getTime()), 'HardPan · Golf Jan 2');
});

test('fewest payments: Who Pays Who alone is used EXACTLY as the page shows it', { skip }, () => {
    const v = V();
    const wpw = [{ from: 'Ann', to: 'Bob', amount: 25, src: 'wpw' }, { from: 'Cal', to: 'Bob', amount: 5, src: 'wpw' }, { from: 'Cal', to: 'Dee', amount: 10, src: 'wpw' }];
    assert.deepEqual(JSON.parse(JSON.stringify(v.fewest(wpw))), wpw.map(({ from, to, amount }) => ({ from, to, amount })));
});

test('BBB / Vegas lines stay SEPARATE (URGENT-045 default): never netted into Who Pays Who, each under its game, own tick key', { skip }, () => {
    const v = V();
    const lines = [
        { from: 'Ann', to: 'Bob', amount: 25, src: 'wpw' }, { from: 'Cal', to: 'Dee', amount: 10, src: 'wpw' },
        { from: 'Bob', to: 'Cal', amount: 7, src: 'exg', game: 'bbb', gameLabel: '🟢 Bingo Bango Bongo' },
        { from: 'Bob', to: 'Ann', amount: 25, src: 'exg', game: 'vegas', gameLabel: '🔢 Vegas' },
    ];
    const out = JSON.parse(JSON.stringify(v.fewest(lines)));
    assert.equal(out.length, lines.length, 'one payment per line, nothing combined');
    assert.deepEqual(out.slice(0, 2), [{ from: 'Ann', to: 'Bob', amount: 25 }, { from: 'Cal', to: 'Dee', amount: 10 }]);
    assert.deepEqual(out[2], { from: 'Bob', to: 'Cal', amount: 7, game: 'bbb', gameLabel: '🟢 Bingo Bango Bongo' });
    assert.deepEqual(out[3], { from: 'Bob', to: 'Ann', amount: 25, game: 'vegas', gameLabel: '🔢 Vegas' });
    // Lines that would cancel are still two payments: each game is settled on its own.
    assert.equal(v.fewest([{ from: 'A', to: 'B', amount: 5, src: 'wpw' }, { from: 'B', to: 'A', amount: 5, src: 'exg', game: 'bbb', gameLabel: 'BBB' }]).length, 2);
    assert.equal(v.keyOf(out[0]), 'ann~bob~2500');
    assert.equal(v.keyOf(out[2]), 'bbb~bob~cal~700');
    assert.notEqual(v.keyOf({ from: 'Ann', to: 'Bob', amount: 25 }), v.keyOf({ from: 'Ann', to: 'Bob', amount: 25, game: 'vegas' }));
    assert.ok(!/net\[f\]|largest-to-largest/.test(code()), 'no netting code left');
});

test('whose usernames: the trip’s by name first, else the round’s by player id', { skip }, () => {
    const v = V();
    const ps = [{ id: 11, name: 'Ann Able' }, { id: 12, name: 'Bob Baker' }];
    const h = v.handlesFor('Bob Baker', { tripVenmo: { 'bob baker': '@bob-b' }, tripCash: {}, roundVenmo: { 12: 'other' }, roundCash: { 12: '$BobCash' }, players: ps });
    assert.equal(h.venmo, 'bob-b'); assert.equal(h.cashapp, 'BobCash');
    assert.equal(v.userFor('bob baker ', { tripVenmo: {}, roundVenmo: { 12: 'bob-r' }, players: ps }), 'bob-r');
    assert.equal(v.userFor('Ann Able', { tripVenmo: {}, roundVenmo: {}, players: ps }), null);
});

test('the words: Settle up / Square up only - never "bet" or "wager" on the payment screen or in the note', { skip }, () => {
    const strings = (code().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
    assert.ok(!/\bbets?\b|\bbetting\b|\bwagers?\b|\bgambl/i.test(strings), strings.match(/.*(bet|wager|gambl).*/i));
    assert.match(strings, /Settle up/);
    assert.match(strings, /No money passes through HardPan/);
});

test('links only: no payment API; the only writes are the golfer’s own usernames and the group’s paid tick', { skip }, () => {
    const src = code();
    assert.ok(!/fetch\(|XMLHttpRequest|api\.venmo|braintree|squareup\.com|cash\.app\/api/i.test(src), 'no payment API');
    const refs = (src.match(/S\.db\.ref\(([^)]*)\)\.(set|update|push|remove)\(/g) || []).map((s) => s.replace(/\s+/g, ' '));
    assert.deepEqual(refs, ["S.db.ref(P.venmo).set(", "S.db.ref(P.cashapp).set(", "S.db.ref(P.venmo).set(", "S.db.ref(P.cashapp).set(", "S.db.ref('events/' + S.code + '/settleUp/' + k).set("]);
    assert.match(src, /venmo: 'trips\/' \+ S\.tripCode \+ '\/venmo\/' \+ nameKey\(m\.name\), cashapp: 'trips\/' \+ S\.tripCode \+ '\/cashapp\/' \+ nameKey\(m\.name\)/);
    assert.match(src, /venmo: 'events\/' \+ S\.code \+ '\/venmo\/' \+ m\.id, cashapp: 'events\/' \+ S\.code \+ '\/cashapp\/' \+ m\.id/);
    assert.match(src, /var v = cur \? null : \{ by: String\(m\.id\), at: Date\.now\(\) \};/, 'the tick: who and when, nothing else');
    assert.ok(!/geolocation|coords|latitude|lat:|lng:/i.test(src), 'no location');
});

// URGENT-045: database.rules.json in the repo is NOT what is live. These two tests use
// the LIVE rules as read from /.settings/rules on 2026-10-20 (read only; also the
// rollback copy) and the PROPOSED rules (live + 5 additive children). Nothing is published.
const LIVE = 'docs/045-venmo-rules-ROLLBACK-live-2026-10-20.json', PROPOSED = 'docs/045-venmo-rules-PROPOSED.json';
function rulesDb(file) {
    const targaryen = require('targaryen');
    const rules = JSON.parse(read(file));
    const data = {
        events: { R1: { ownerUid: 'org', courseName: 'Dobson Ranch', players: { 0: { id: 11, name: 'Ann' } }, scores: { p11_h1: 4 } } },
        trips: { T1: { ownerUid: 'org', tripName: 'Trip', rounds: { R1: { label: 'Sun' } } } },
    };
    return (uid) => targaryen.database(rules, data).as(uid ? { uid, provider: 'anonymous' } : null);
}
const WRITES = (NOW) => [
    ['/events/R1/venmo/11', 'ann-able'], ['/events/R1/cashapp/11', 'AnnCash'], ['/events/R1/venmo/11', null],
    ['/events/R1/settleUp/ann~bob~2500', { by: '11', at: NOW - 1 }], ['/events/R1/settleUp/bbb~ann~bob~700', { by: '11', at: NOW - 1 }],
    ['/events/R1/settleUp/ann~bob~2500', null], ['/trips/T1/venmo/ann', 'ann-able'], ['/trips/T1/cashapp/ann', 'AnnCash'],
];

test('LIVE rules today: the organizer’s phone can write every Settle up path; another golfer’s phone is refused (why the proposal exists)', { skip }, () => {
    const as = rulesDb(LIVE), NOW = Date.now();
    WRITES(NOW).forEach(([p, v]) => {
        assert.ok(as('org').write(p, v, NOW).allowed, 'organizer ' + p);
        assert.ok(!as('golfer').write(p, v, NOW).allowed, 'golfer refused today ' + p);
    });
    assert.ok(as('golfer').read('/events/R1/settleUp').allowed, 'the group reads the ticks');
});

test('PROPOSED rules: only 5 additive children; any signed-in golfer can write the Settle up paths, values checked, nothing else loosened', { skip }, () => {
    const live = JSON.parse(read(LIVE)), prop = JSON.parse(read(PROPOSED));
    const e = prop.rules.events.$eventCode, t = prop.rules.trips.$tripCode;
    ['venmo', 'cashapp', 'settleUp'].forEach((k) => delete e[k]); ['venmo', 'cashapp'].forEach((k) => delete t[k]);
    assert.deepEqual(prop, live, 'proposed = live + events/venmo, cashapp, settleUp + trips/venmo, cashapp');
    const as = rulesDb(PROPOSED), NOW = Date.now();
    WRITES(NOW).forEach(([p, v]) => {
        assert.ok(as('golfer').write(p, v, NOW).allowed, 'golfer ' + p);
        assert.ok(!as(null).write(p, v, NOW).allowed, 'signed out ' + p);
    });
    [['/events/NOPE/settleUp/a~b~1', { by: '1', at: NOW - 1 }], ['/trips/NOPE/venmo/ann', 'ann-able'], ['/events/R1/venmo/11', 'has space'],
        ['/events/R1/cashapp/11', 'a'.repeat(21)], ['/events/R1/settleUp/ann~bob~2500', { by: '11', at: NOW - 1, amount: 5 }],
        ['/events/R1/settleUp/hello', { by: '11', at: NOW - 1 }], ['/events/R1/courseName', 'X'], ['/events/R1/ownerUid', 'golfer'], ['/trips/T1/tripName', 'X'],
    ].forEach(([p, v]) => assert.ok(!as('golfer').write(p, v, NOW).allowed, 'still refused ' + p));
});

test('wiring: the Results page, in GPS blocks (HardPan only), its own mount; the switch; the shell lists', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const st = read('settlement.html');
    assert.ok(st.includes('<script src="venmo-pay.js"></script>'));
    assert.match(st, /window\.HardPanVenmo\.onRound\(db, currentMode, currentData\)/);
    assert.ok(!/HardPanVenmo|venmo-pay/.test(flag.applyFlag(st, false)), 'settlement: HardPan only');
    assert.match(read('gps-config.js'), /\n\s*venmo: true,\n/);
    assert.match(code(), /function enabled\(\) \{ var c = W\.HARDPAN_GPS_CONFIG; return !\(c && c\.venmo === false\); \}/);
    assert.ok(read('sw.js').includes("'./venmo-pay.js',"));
    assert.equal((read('sync-mobile-web.js').match(/'venmo-pay\.js'/g) || []).length, 2);
    assert.ok(!/combined-settlement-summary'\)\.innerHTML|insertAdjacentHTML/.test(code()), 'never writes into a Results section');
});
