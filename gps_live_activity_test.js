// 022 (1) - THE LOCK SCREEN / DYNAMIC ISLAND BRIDGE (gps-live-activity.js), pure:
//   throttle (a hole change at once; else 10 s, or 5+ on the middle number), start once per round,
//   end when the GPS closes or the page goes, the Tools switch, and nothing at all on the web.
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-live-activity.js'))) { console.log('Consumer tree: no Live Activity - skipped.'); process.exit(0); }
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

function load(opts) {
    const o = opts || {};
    const store = {};
    const listeners = {};
    global.window = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        document: { visibilityState: o.hidden ? 'hidden' : 'visible' },
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        Capacitor: o.web ? undefined : { isNativePlatform: () => true },
        HardPanGps: { isMounted: () => (o.mounted ? o.mounted() : true) }
    };
    delete require.cache[require.resolve('./gps-live-activity.js')];
    require('./gps-live-activity.js');
    const LA = global.window.HardPanLiveActivity;
    const calls = [];
    const plugin = {
        available: () => Promise.resolve({ available: o.available !== false }),
        start: (p) => { calls.push(['start', p.hole, p.mid]); return Promise.resolve({ started: true }); },
        update: (p) => { calls.push(['update', p.hole, p.mid]); return Promise.resolve(); },
        end: () => { calls.push(['end']); return Promise.resolve(); }
    };
    if (!o.web) LA._plugin(plugin);
    return { LA, calls, store, listeners };
}
const P = (hole, mid, extra) => Object.assign({ round: 'R1', course: 'Papago', hole, par: 5, front: mid - 15, mid, back: mid + 15, unit: 'y', playsDelta: 0, fromTee: false, thru: 'Thru 0 · E', money: null, green: { f: [33.4, -111.9], c: [33.4, -111.9], b: [33.4, -111.9] } }, extra || {});
const tick = () => new Promise((r) => setImmediate(r));

test('starts ONE activity for the round, then throttles: a hole change at once, 5+ yards after 2 s, else every 10 s', async () => {
    mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1000000 });
    try {
        const { LA, calls } = load();
        assert.equal(LA.sync(P(1, 520)), true);
        await tick(); await tick();
        assert.deepEqual(calls, [['start', 1, 520]]);
        assert.equal(LA.running(), true);
        // 1 s later, 2 yards closer: held.
        mock.timers.tick(1000);
        assert.equal(LA.sync(P(1, 518)), false);
        // 3 s in, 10 yards closer: goes (moved 5+, 2 s gap).
        mock.timers.tick(2000);
        assert.equal(LA.sync(P(1, 508)), true);
        assert.deepEqual(calls.slice(-1), [['update', 1, 508]]);
        // a small change waits for the 10 s, then the NEWEST numbers go by themselves
        mock.timers.tick(1000);
        LA.sync(P(1, 506)); mock.timers.tick(500); LA.sync(P(1, 505));
        assert.equal(calls.length, 2);
        mock.timers.tick(10000);
        assert.deepEqual(calls.slice(-1), [['update', 1, 505]]);
        // a new hole: at once
        assert.equal(LA.sync(P(2, 400)), true);
        assert.deepEqual(calls.slice(-1), [['update', 2, 400]]);
        // the same numbers again: nothing
        mock.timers.tick(20000);
        assert.equal(LA.sync(P(2, 400)), false);
    } finally { mock.timers.reset(); }
});

test('ends when the GPS closes (unmounted), when the page goes, and on a new round; a hidden page sends nothing', async () => {
    mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 2000000 });
    try {
        let mounted = true;
        const { LA, calls, listeners } = load({ mounted: () => mounted });
        LA.sync(P(1, 300)); await tick(); await tick();
        mounted = false;
        mock.timers.tick(15000);
        assert.deepEqual(calls.slice(-1), [['end']]);
        assert.equal(LA.running(), false);
        mounted = true;
        LA.sync(P(1, 300)); await tick(); await tick();
        listeners.pagehide.forEach((f) => f());
        assert.deepEqual(calls.slice(-1), [['end']]);
        LA.sync(P(1, 300)); await tick(); await tick();
        LA.sync(P(1, 300, { round: 'R2' })); await tick(); await tick();
        assert.deepEqual(calls.slice(-3).map((c) => c[0]), ['start', 'end', 'start'], 'a new round: the old one ends, a new one starts');
        assert.equal(calls.filter((c) => c[0] === 'start').length, 4, 'R1, R1 after the map came back, R1 after the page came back, R2');
    } finally { mock.timers.reset(); }
    const h = load({ hidden: true });
    h.LA.sync(P(1, 300)); await tick(); await tick();
    h.LA.sync(P(2, 200));
    assert.deepEqual(h.calls.map((c) => c[0]), ['start'], 'a hidden page: the native side keeps the numbers going');
});

test('the Tools switch: off ends it and nothing starts; on again starts on the next numbers', async () => {
    const { LA, calls, store } = load();
    LA.sync(P(1, 300)); await tick(); await tick();
    assert.equal(LA.setOn(false), false);
    assert.equal(store.hardpan_live_activity, 'off');
    assert.deepEqual(calls.slice(-1), [['end']]);
    assert.equal(LA.sync(P(1, 290)), false);
    assert.equal(calls.filter((c) => c[0] === 'start').length, 1);
    assert.equal(LA.setOn(true), true);
    LA.sync(P(1, 280)); await tick(); await tick();
    assert.equal(calls.filter((c) => c[0] === 'start').length, 2);
});

test('the web, or iOS without Live Activities: nothing at all', async () => {
    const web = load({ web: true });
    assert.equal(web.LA.sync(P(1, 300)), false);
    assert.equal(web.LA.running(), false);
    const off = load({ available: false });
    off.LA.sync(P(1, 300)); await tick(); await tick();
    assert.deepEqual(off.calls, []);
    assert.equal(off.LA.running(), false);
});
