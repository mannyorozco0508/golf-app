// ============================================================================
// feature-registry.js (URGENT-066 #1) - the registry, the layout store and the
// "never customized = today's screen" promise, without a browser.
// ============================================================================
'use strict';
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function fresh(opts) {
    const o = opts || {};
    const store = Object.assign({}, o.store || {});
    const writes = [];
    global.window = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        addEventListener() {}, innerHeight: 852,
        HARDPAN_GPS_CONFIG: o.config || { features: {} },
        firebase: o.firebase || undefined,
        HardPanFeatureQueue: o.queue,
        HardPanGpsStats: o.noStats ? undefined : { quick: {} }
    };
    global.document = {};
    delete require.cache[require.resolve('./feature-registry.js')];
    const F = require('./feature-registry.js');
    return { F, store, writes, W: global.window };
}
const btn = (id, extra) => Object.assign({ id, label: id, slot: 'dock', kind: 'button', mount: () => ({}) }, extra || {});

describe('feature registry', () => {
    test('three built-in extras, all OFF by default: a golfer who never customizes gets nothing new', () => {
        const { F } = fresh();
        assert.deepEqual(F.list().map((d) => d.id), ['ticker', 'leaderboard', 'stats']);
        const eff = F.effective();
        assert.ok(eff.length >= 2);
        assert.ok(eff.every((x) => x.on === false && x.shows === false), JSON.stringify(eff));
    });

    test('a feature that loads BEFORE the registry (the queue) and one AFTER both register', () => {
        const { F, W } = fresh({ queue: [btn('scan', { tier: 'host', freeUses: 3 })] });
        W.HardPanFeatureQueue.push(btn('voice'));
        assert.deepEqual(F.list().map((d) => d.id).slice(-2), ['scan', 'voice']);
    });

    test('bad definitions are refused, never thrown', () => {
        const { F } = fresh();
        assert.equal(F.register({ id: 'Bad Id', label: 'x', slot: 'dock', mount() {} }), false);
        assert.equal(F.register({ id: 'okid', label: 'x', slot: 'nowhere', mount() {} }), false);
        assert.equal(F.register({ id: 'okid', label: 'x', slot: 'dock' }), false, 'no mount');
        assert.equal(F.register({ id: 'ticker', label: 'x', slot: 'dock', mount() {} }), false, 'duplicate');
        assert.equal(F.register({ id: 'okid', label: 'x', slot: 'dock', tier: 'gold', mount() {} }), false, 'unknown tier');
        assert.equal(F.register(btn('okid')), true);
    });

    test('toggle + reorder persist on the phone, and come back in that order', () => {
        let { F, store } = fresh();
        F.savePrefs({ order: ['stats', 'ticker', 'leaderboard'], on: { ticker: true, stats: true } });
        assert.ok(store['hardpan_layout_v1']);
        ({ F } = fresh({ store }));
        const eff = F.effective();
        assert.deepEqual(eff.map((x) => x.id), ['stats', 'ticker', 'leaderboard']);
        assert.deepEqual(eff.filter((x) => x.shows).map((x) => x.id), ['stats', 'ticker']);
    });

    test('a feature the saved layout has never seen lands at the END and OFF (unless its default says on for the role)', () => {
        const { F } = fresh({ store: { hardpan_layout_v1: JSON.stringify({ v: 1, order: ['ticker'], on: { ticker: true }, at: 5 }) } });
        F.register(btn('voice'));
        F.register(btn('scorekeeperthing', { defaultOn: { scorekeeper: true }, slot: 'side' }));
        const eff = F.effective();
        assert.equal(eff[0].id, 'ticker');
        assert.equal(eff.find((x) => x.id === 'voice').on, false);
        assert.equal(eff.find((x) => x.id === 'scorekeeperthing').on, false, 'no host -> role watching -> off');
    });

    test('unknown / removed ids are ignored; junk in storage is "never customized"', () => {
        let { F } = fresh({ store: { hardpan_layout_v1: '{"v":1,"order":["gone","ticker"],"on":{"gone":true,"ticker":true},"at":1}' } });
        assert.deepEqual(F.effective().filter((x) => x.shows).map((x) => x.id), ['ticker']);
        ({ F } = fresh({ store: { hardpan_layout_v1: 'not json' } }));
        assert.ok(F.effective().every((x) => !x.on));
        assert.deepEqual(F.normalise({ order: 'x', on: [1], at: -4 }), { v: 1, order: [], on: {}, at: 0 });
    });

    test('a paid extra shows a lock; free tries let it show; used-up tries lock it again', () => {
        const { F, store } = fresh();
        F.register(btn('scan', { tier: 'host', freeUses: 3, isNew: true }));
        F.savePrefs({ order: ['scan'], on: { scan: true } });
        let x = F.effective().find((e) => e.id === 'scan');
        assert.equal(x.locked, true); assert.equal(x.usesLeft, 3); assert.equal(x.shows, true);
        store['hardpan_feature_uses_v1'] = JSON.stringify({ scan: 3 });
        x = F.effective().find((e) => e.id === 'scan');
        assert.equal(x.usesLeft, 0); assert.equal(x.shows, false);
    });

    test('available() false hides a feature everywhere (no native plugin, kill switch)', () => {
        const { F } = fresh();
        F.register(btn('voice', { available: () => false }));
        assert.equal(F.effective().find((x) => x.id === 'voice'), undefined);
    });

    test('NO DATABASE unless features.layoutSync is on (the rules are a proposal)', () => {
        const calls = [];
        const fb = { auth: () => ({ currentUser: { uid: 'u1', isAnonymous: false } }), database: () => ({ ref: (p) => ({ set: (v) => { calls.push(['set', p, v]); return Promise.resolve(); }, once: () => { calls.push(['once', p]); return Promise.resolve({ val: () => null }); } }) }) };
        let { F } = fresh({ firebase: fb });
        F.savePrefs({ order: ['ticker'], on: { ticker: true } }); F.effective();
        assert.deepEqual(calls, [], 'layoutSync off: nothing read or written');
        ({ F } = fresh({ firebase: fb, config: { features: { layoutSync: true } } }));
        F.savePrefs({ order: ['ticker'], on: { ticker: true } });
        assert.equal(calls[0][0], 'set'); assert.equal(calls[0][1], 'layoutPrefs/u1');
        assert.deepEqual(Object.keys(calls[0][2]).sort(), ['at', 'on', 'order', 'v']);
    });

    test('an anonymous golfer is never synced, even with layoutSync on', () => {
        const calls = [];
        const fb = { auth: () => ({ currentUser: { uid: 'a1', isAnonymous: true } }), database: () => ({ ref: (p) => ({ set: () => { calls.push(p); return Promise.resolve(); } }) }) };
        const { F } = fresh({ firebase: fb, config: { features: { layoutSync: true } } });
        F.savePrefs({ order: ['ticker'], on: {} });
        assert.deepEqual(calls, []);
    });

    test('Back to simple = everything off', () => {
        const { F } = fresh();
        F.savePrefs({ order: ['ticker'], on: { ticker: true } });
        F.resetPrefs();
        assert.ok(F.effective().every((x) => !x.on));
    });

    test('policy: the registry adds no score or money arithmetic and never writes a score itself', () => {
        const src = fs.readFileSync(path.join(__dirname, 'feature-registry.js'), 'utf8');
        assert.ok(!/(^|[^.])saveScore\(|\.scores\[[^\]]+\]\s*=|ref\(['"]events/.test(src), 'no direct score write');
        assert.ok(!/calculate[A-Z]\w*\(/.test(src), 'no money engine call');
        // phone3: h = the mounted GPS host, or (no GPS screen: Siri / voice on the card) pageHost - the same card save.
        assert.ok(/var h = host \|\| pageHost\(\);/.test(src) && /h\.saveScore\(/.test(src), 'scores go through the card\'s own save, from the host');
        assert.ok(/saveScore: function \(pid, hole, v\) \{ gpsSheetHole\(Number\(hole\)\)\.save\(pid, v\); \}/.test(src), 'the page fallback is the card\'s own save (gpsSheetHole(n).save)');
        assert.ok(!/geolocation|getCurrentPosition|watchPosition/.test(src), 'no location');
    });

    test('wired: index.html loads it after gps-stats.js, and it ships in the GPS app and the offline shell', () => {
        const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        assert.ok(idx.indexOf('src="feature-registry.js"') > idx.indexOf('src="gps-stats.js"'));
        assert.ok(/'feature-registry\.js'/.test(fs.readFileSync(path.join(__dirname, 'sync-mobile-web.js'), 'utf8')));
        assert.ok(/'\.\/feature-registry\.js'/.test(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')));
        const gv = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
        assert.ok(/data-ts-cust/.test(gv), 'Tools > Customize your screen');
        assert.ok(/function syncExtras\(/.test(gv));
    });
});
