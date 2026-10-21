// ============================================================================
// URGENT-048 part 3 - hp-needs-account.js, its pure parts in a sandbox: when it
// asks (signed out + sign-in on the page + not yet this round for this feature),
// that it never asks with no sign-in on the page, the words, and the wiring.
// The sheet itself is checked in Chrome: urgent048_needs_account_chrome_test.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'hp-needs-account.js'));
const skip = ON ? false : 'Consumer tree: no hp-needs-account.js';

function store() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
function load(o) {
    const sb = { localStorage: (o && o.storage) || store() };
    sb.window = sb;
    if (!o || o.auth !== false) sb.HardPanAuth = { state: () => ({ signedIn: !!(o && o.signedIn), anonymous: !(o && o.signedIn) }), onChange: () => () => {} };
    if (!o || o.ui !== false) sb.HardPanAccountUI = { openSignIn() {}, openProfile() {} };
    vm.createContext(sb); vm.runInContext(read('hp-needs-account.js'), sb);
    return sb;
}

test('asks a signed-out phone; never a signed-in one', { skip }, () => {
    assert.equal(load().HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), true);
    assert.equal(load({ signedIn: true }).HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false);
});

test('no sign-in on the page (no HardPanAuth or no HardPanAccountUI): never asks - today, unchanged', { skip }, () => {
    assert.equal(load({ auth: false }).HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false);
    assert.equal(load({ ui: false }).HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false);
    const sb = load(); sb.HardPanAuth.state = () => { throw new Error('x'); };
    assert.equal(sb.HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false, 'a broken state() never walls');
});

test('at most once per round per feature, remembered on this phone', { skip }, () => {
    const storage = store();
    const sb = load({ storage });
    const N = sb.HardPanNeedsAccount;
    // Mark R1/venmo seen the way prompt() does (no DOM in the sandbox).
    storage.setItem('hardpan_needs_account', JSON.stringify({ 'R1|venmo': 1 }));
    assert.equal(N.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false);
    assert.equal(N.shouldPrompt({ feature: 'venmo', scope: 'R2' }), true, 'another round asks again');
    assert.equal(N.shouldPrompt({ feature: 'friends', scope: 'R1' }), true, 'another feature asks again');
    assert.equal(load({ storage }).HardPanNeedsAccount.shouldPrompt({ feature: 'venmo', scope: 'R1' }), false, 'after a restart too');
});

test('the words: no staking words anywhere in the sheet; the preview copy', { skip }, () => {
    const src = read('hp-needs-account.js').replace(/^\s*\/\/.*$/gm, '');
    const strings = (src.match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
    assert.ok(!/\bbets?\b|\bbetting\b|\bwagers?\b|\bgambl/i.test(strings), strings.match(/.*(bet|wager|gambl).*/i));
    assert.match(strings, /'Sign in to use '/);
    assert.match(strings, /So the money goes to the right person, and your friends see it’s really you\./);
    assert.match(strings, />Not now</);
    assert.match(strings, /keep working/);
    assert.ok(!/fetch\(|XMLHttpRequest|\.ref\(|geolocation/.test(src), 'no network, no database, no location');
});

test('wiring: Results page (GPS block, before venmo-pay.js), shell lists; venmo-pay asks only through shouldPrompt', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    const st = read('settlement.html');
    assert.ok(st.indexOf('<script src="hp-needs-account.js"></script>') > 0);
    assert.ok(st.indexOf('<script src="hp-needs-account.js"></script>') < st.indexOf('<script src="venmo-pay.js"></script>'));
    assert.ok(!/hp-needs-account/.test(flag.applyFlag(st, false)), 'HardPan only');
    assert.ok(read('sw.js').includes("'./hp-needs-account.js',"));
    assert.equal((read('sync-mobile-web.js').match(/'hp-needs-account\.js'/g) || []).length, 2);
    const v = read('venmo-pay.js');
    assert.match(v, /N\.shouldPrompt\(\{ feature: 'venmo', scope: S\.code \}\)/);
    assert.match(v, /if \(paid\) \{ if \(!!paidMark\(paid\) === was\) markPaid\(paid\); \}/);
});
