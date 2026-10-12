// ============================================================================
// HARDPAN - PAY WITH VENMO + CHECK MY INDEX (gps-venmo)
//
// venmo-pay.js's pure parts in a sandbox (the username, the two links, who is
// whose), then the wiring: HardPan only, links only (no payment API, nothing about
// a payment written), Round Setup's Check my Index. tools/venmo-check.js drives
// the Results page and Round Setup in Chrome.
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
function V() { const sb = { encodeURIComponent, String, Number, Math, JSON, Object, Array, URLSearchParams, location: { search: '' } }; sb.window = sb; vm.createContext(sb); vm.runInContext(read('venmo-pay.js'), sb); return sb.HardPanVenmo; }

test('the username: a leading @ goes, anything that can’t be a Venmo username is refused', { skip }, () => {
    const v = V();
    assert.equal(v.cleanUser(' @Manny-Orozco '), 'Manny-Orozco');
    assert.equal(v.cleanUser('@@bob_1'), 'bob_1');
    ['', '@', 'has space', 'a/b', 'x', 'javascript:alert(1)', 'a'.repeat(31)].forEach((u) => assert.equal(v.cleanUser(u), null, JSON.stringify(u)));
    assert.equal(v.nameKey(' Ann  Able. '), 'ann able_');
});

test('the links: venmo.com/u/<user> (the app claims /u/*), account.venmo.com/pay as the web fallback; never venmo://paycharge', { skip }, () => {
    const v = V();
    const L = v.links('bob-baker-1', 12.5, 'HardPan · Myrtle Cup');
    assert.equal(L.app, 'https://venmo.com/u/bob-baker-1?txn=pay&amount=12.50&note=HardPan%20%C2%B7%20Myrtle%20Cup');
    assert.equal(L.web, 'https://account.venmo.com/pay?txn=pay&recipients=bob-baker-1&amount=12.50&note=HardPan%20%C2%B7%20Myrtle%20Cup');
    assert.equal(v.links('x1', 6, 'n').app, 'https://venmo.com/u/x1?txn=pay&amount=6&note=n');
    assert.ok(!/venmo:\/\//.test(read('venmo-pay.js').replace(/^\s*\/\/.*$/gm, '')), 'no venmo:// link in the code');
});

test('whose username: the trip’s list by name first, else the round’s by player id', { skip }, () => {
    const v = V();
    const ps = [{ id: 11, name: 'Ann Able' }, { id: 12, name: 'Bob Baker' }];
    assert.equal(v.userFor('Bob Baker', { tripVenmo: { 'bob baker': '@bob-b' }, roundVenmo: { 12: 'other' }, players: ps }), 'bob-b');
    assert.equal(v.userFor('bob baker ', { tripVenmo: {}, roundVenmo: { 12: 'bob-r' }, players: ps }), 'bob-r');
    assert.equal(v.userFor('Ann Able', { tripVenmo: {}, roundVenmo: {}, players: ps }), null);
});

test('links only: no payment API, nothing about a payment written; only the username and a phone-only Mark paid', { skip }, () => {
    const src = read('venmo-pay.js').replace(/^\s*\/\/.*$/gm, '');
    const writes = src.match(/\.(set|update|push|remove)\(/g) || [];
    assert.deepEqual(writes, ['.set('], 'one write: the golfer’s own username');
    assert.match(src, /var path = S\.tripCode \? 'trips\/' \+ S\.tripCode \+ '\/venmo\/' \+ nameKey\(m\.name\) : 'events\/' \+ S\.code \+ '\/venmo\/' \+ m\.id;/);
    assert.ok(!/fetch\(|XMLHttpRequest|api\.venmo|braintree/i.test(src), 'no payment API');
    assert.match(src, /W\.localStorage\.setItem\(k, '1'\)/, 'Mark paid is this phone only');
    assert.match(src, /if \(!m \|\| norm\(m\.name\) !== norm\(from\)/, 'shown only to the payer');
});

test('wiring: Results page + Round Setup + builder review, all in GPS blocks; Check my Index opens GHIN, stores nothing', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const st = read('settlement.html'), ad = read('admin.html');
    assert.ok(st.includes('<script src="venmo-pay.js"></script>'));
    assert.match(st, /window\.HardPanVenmo\.onRound\(db, currentMode, currentData\)/);
    assert.ok(!/HardPanVenmo|venmo-pay|vm-pay/.test(flag.applyFlag(st, false)), 'settlement: HardPan only');
    assert.match(ad, /a\.href = 'https:\/\/www\.ghin\.com\/overview\/';/);
    assert.ok(!/gpsGhinLink|ghin\.com/.test(flag.applyFlag(ad, false)), 'admin: HardPan only');
    const fn = ad.slice(ad.indexOf('function gpsGhinLink('), ad.indexOf('function exgReviewRow('));
    assert.ok(!/fetch|db\.ref|localStorage/.test(fn), 'GHIN: nothing fetched or stored');
    assert.match(read('trip-builder-ui.js'), /href="https:\/\/www\.ghin\.com\/overview\/" target="_blank" rel="noopener"/);
});
