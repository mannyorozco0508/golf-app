// ============================================================================
// URGENT-011 (sims bug 5, LOW): BACK FROM A ROUND IN PROGRESS GOES HOME.
//
// Measured by the nightly sims: Back mid-round went to "How are you joining
// this round?" (index.html?game=X, the entry before pickGroup added &group=N)
// and a second Back opened Round Setup (admin.html, START SCORING's page).
//
// front-door.js roundBackGuard (the app only - scorecard() runs it when the
// doors are on): the card sits on a guard entry; Back pops to the round's base
// entry and from there goes Home - history.back() when the card was opened
// from Home (no second Home stacked), location.replace('home.html') otherwise
// (the setup pages and the picker are never shown again).
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const GPS = fs.existsSync(path.join(REPO_ROOT, 'gps-view.js')) && fs.existsSync(path.join(REPO_ROOT, 'front-door.js'));
const GPS_ONLY = GPS ? {} : { skip: 'Consumer tree: GPS-only (front-door.js)' };

// A browser history: entries of { url, state }, one document per url; pushState /
// replaceState / back() as the spec has them (back() to an entry of the same document
// fires popstate; to another document it navigates).
function browser(stack, referrer) {
    const H = { entries: stack.map((u) => ({ url: u, state: null })), i: stack.length - 1, navigations: [], replaced: null };
    const listeners = [];
    const doc = { referrer: referrer || '', readyState: 'complete', addEventListener() {}, documentElement: { style: {} } };
    const sb = {
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: { onLine: true }, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
        console, JSON, Math, Date, Object, Array, Promise, URLSearchParams, String, RegExp,
        location: {
            get pathname() { return '/' + H.entries[H.i].url.split('?')[0]; }, search: '', hash: '',
            replace(u) { H.replaced = u; H.entries[H.i] = { url: u, state: null }; }
        },
        history: {
            get state() { return H.entries[H.i].state; },
            replaceState(s) { H.entries[H.i] = { url: H.entries[H.i].url, state: s }; },
            pushState(s) { H.entries = H.entries.slice(0, H.i + 1); H.entries.push({ url: H.entries[H.i].url, state: s }); H.i++; },
            back() {
                if (H.i === 0) return;
                const from = H.entries[H.i]; H.i--;
                const to = H.entries[H.i];
                if (to.url === from.url) listeners.forEach((f) => f({ state: to.state }));
                else H.navigations.push(to.url);
            }
        },
        addEventListener(t, f) { if (t === 'popstate') listeners.push(f); },
        document: doc
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('front-door.js'), sb, { filename: 'front-door.js' });
    return { sb, H, here: () => H.entries[H.i] };
}

describe('URGENT-011 bug 5: Back from a round in progress goes Home', GPS_ONLY, () => {
    test('from START SCORING (Round Setup) via the group picker: Back goes Home - never the picker, never Setup', () => {
        const b = browser(['home.html', 'admin.html?start=quick', 'admin.html?game=ABC123&eventType=quick', 'index.html?game=ABC123', 'index.html?game=ABC123&group=1'],
            'file:///app/index.html?game=ABC123');
        b.sb.HardPanDoors.roundBackGuard('ABC123');
        assert.equal(JSON.stringify(b.here().state), JSON.stringify({ hpRound: 'ABC123' }), 'the card sits on its guard entry');
        b.sb.history.back();
        assert.equal(b.H.replaced, 'home.html', 'Back: Home');
        assert.equal(b.H.navigations.length, 0, 'no history walk into the picker or Round Setup');
    });

    test('opened from Home (Resume / the GPS door): Back is the real history back to that Home', () => {
        const b = browser(['home.html', 'index.html?game=ABC123&group=1'], 'file:///app/home.html');
        b.sb.HardPanDoors.roundBackGuard('abc123');
        b.sb.history.back();
        assert.equal(b.H.replaced, null, 'no second Home stacked');
        assert.deepEqual(b.H.navigations, ['home.html']);
    });

    test('a reload on the card pushes no second guard; Back still goes Home', () => {
        const b = browser(['admin.html?game=ABC123', 'index.html?game=ABC123'], '');
        b.sb.HardPanDoors.roundBackGuard('ABC123');
        const n = b.H.entries.length;
        // the reload: a new document on the same (guard) entry
        const again = browser(['x'], '');
        again.H.entries = b.H.entries; again.H.i = b.H.i;
        again.sb.HardPanDoors.roundBackGuard('ABC123');
        assert.equal(again.H.entries.length, n);
        again.sb.history.back();
        assert.equal(again.H.replaced, 'home.html');
    });

    test('scorecard() arms it in the app, after the no-round / doors-off return', () => {
        const fd = read('front-door.js');
        const sc = fd.slice(fd.indexOf('function scorecard() {'), fd.indexOf('function scorecard() {') + 600);
        assert.ok(sc.indexOf("if (!code || !on()) return;") < sc.indexOf('roundBackGuard(code);') && sc.indexOf('roundBackGuard(code);') > 0);
    });
});
