// URGENT-047 B - TYPE MY CARRIES (gps-bushnell.js; changed 8:15 AM: typed grid only, no
// import): My bag > "Type my carries", one row per club, "Update my bag" writes them into the
// EXISTING My bag with HardPanGpsBag.set (the same { set: { <club>: yd } } as a typed My bag
// number and as Range, 047 A). Yards only; nothing stored of its own, nothing sent, no sign-in.
'use strict';
const fs = require('fs'), path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree (GPS_ENABLED=0)';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function fresh() {
    const store = {};
    global.window = global;
    global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    delete require.cache[require.resolve('./gps-shots.js')];
    delete require.cache[require.resolve('./gps-bushnell.js')];
    delete window.HardPanGpsBag; delete window.HardPanLaunchEntry;
    require('./gps-shots.js'); require('./gps-bushnell.js');
    return { store, B: window.HardPanGpsBag, L: window.HardPanLaunchEntry };
}

test('parse: blank keeps, numbers kept as whole yards, meters converted, junk and out-of-range flagged', { skip }, () => {
    const { L } = fresh();
    assert.deepEqual(L.parse({ Dr: '245', '7i': ' 158 ', PW: '', SW: null }), { carries: { Dr: 245, '7i': 158 }, bad: [] });
    assert.deepEqual(L.parse({ '7i': '158.6', '8i': '147 yds' }).carries, { '7i': 159, '8i': 147 });
    assert.deepEqual(L.parse({ '7i': '137' }, true).carries, { '7i': 150 }, '137 m = 150 yds');
    const p = L.parse({ Dr: 'abc', '3w': '0', '5w': '-4', Hy: '500', '4i': '190' });
    assert.deepEqual(p.carries, { '4i': 190 });
    assert.deepEqual(p.bad.sort(), ['3w', '5w', 'Dr', 'Hy'].sort());
    assert.deepEqual(L.parse({ Putter: '5', XX: '100' }).carries, {}, 'only My bag clubs');
});

test('Update my bag: written with HardPanGpsBag.set - the shape My bag (and Range) uses; shows as "entered"', { skip }, () => {
    const { store, B, L } = fresh();
    B.add('Manny Orozco', '7i', 150); B.add('Manny Orozco', '7i', 152); B.add('Manny Orozco', '7i', 151);
    B.setup('Manny Orozco', { PW: 120 });
    const done = L.applyToBag(B, 'Manny Orozco', L.parse({ Dr: '248', '7i': '158', PW: '' }).carries);
    assert.deepEqual(done, { Dr: 248, '7i': 158 });
    const bag = B.bag('Manny Orozco');
    assert.equal(bag.Dr.yd, 248); assert.equal(bag['7i'].yd, 158); assert.equal(B.source(bag['7i']), 'entered');
    assert.equal(bag.PW.yd, 120, 'blank row: PW kept');
    const rec = JSON.parse(store.hardpan_bag_v1);
    assert.deepEqual(Object.keys(store), ['hardpan_bag_v1'], 'no storage of its own - My bag only');
    assert.deepEqual(rec.golfers['n:manny orozco'].set, { Dr: 248, '7i': 158 });
    assert.deepEqual(rec.golfers['n:manny orozco'].shots['7i'], [150, 152, 151], 'the marked shots are kept');
    // The account sync (clubsSync, off today) would carry exactly { shots, set, base }.
    assert.deepEqual(Object.keys(B.syncShape('Manny Orozco')).sort(), ['base', 'set', 'shots']);
    assert.deepEqual(B.syncShape('Manny Orozco').set, { Dr: 248, '7i': 158 });
    // Another golfer untouched.
    assert.deepEqual(B.bag('Joe Russo'), {});
});

test('privacy guard: no network, no database, no position, no sign-in', { skip }, () => {
    const src = read('gps-bushnell.js');
    const code = src.replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|\.ref\(|firebase|navigator\.geolocation|localStorage/, 'no network / db / location / own storage');
    assert.doesNotMatch(code, /password|sign in|log ?in|username|type="password"/i, 'never asks for credentials');
    assert.doesNotMatch(code, /\blat\b|\blng\b|latitude|longitude/);
    assert.match(code, /B\.set\(golfer, c, carries\[c\]\)/, 'writes through HardPanGpsBag.set');
});

test('gps-view wiring: the door in My bag (list view), lazy loaded, same golfer + bagSaved', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(v.indexOf('<button type="button" class="gps-bag-lm" data-feature="clubs">Type my carries</button>') !== -1, 'the door, "Type my carries", behind the clubs switch');
    assert.match(v, /loadScript\('gps-bushnell\.js', function \(\) \{ return !!window\.HardPanLaunchEntry; \}/);
    assert.match(v, /HardPanLaunchEntry\.open\(\{ el: S\.el, golfer: bagGolfer\(\), units: units, flash: flash, saved: bagSaved, openBag: openBag \}\)/);
    assert.match(v, /\.gps-bag\[data-bag-view="setup"\] \.gps-bag-lm\{display:none;\}/, 'not on the first-time setup');
    const sync = read('sync-mobile-web.js'), sw = read('sw.js');
    assert.equal((sync.match(/'gps-bushnell\.js'/g) || []).length, 2, 'CONSUMER_SHELL GPS block + GPS_SHELL');
    assert.ok(sw.indexOf("'./gps-bushnell.js'") !== -1, 'precached (works with no signal)');
    assert.doesNotMatch(read('index.html'), /gps-bushnell\.js/, 'not loaded at boot');
});

// 8:15 AM: the Bushnell import is dropped - "Type my carries" only, no brand names on screen.
// Every string literal in the sheet's code and in gps-view.js (comments skipped), except the
// file name 'gps-bushnell.js' itself, must be free of Bushnell / Launch Pro / Foresight.
const BRANDS = /bushnell|launch ?pro|foresight/i;
function uiStrings(src) {
    const out = [];
    src.split('\n').forEach((line) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        (line.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || []).forEach((q) => out.push(q));
    });
    return out;
}
test('renamed "Type my carries": title, door, and no Bushnell / Launch Pro / Foresight text in the UI strings', { skip }, () => {
    const { L } = fresh();
    assert.equal(L.TITLE, 'Type my carries');
    const src = read('gps-bushnell.js');
    assert.match(src, /gps-lm-title">' \+ TITLE/, 'the sheet title is TITLE');
    assert.match(src, /setAttribute\('aria-label', TITLE\)/);
    const bad = (f) => uiStrings(read(f)).filter((q) => BRANDS.test(q.replace(/gps-bushnell\.js/g, '')));
    assert.deepEqual(bad('gps-bushnell.js'), [], 'gps-bushnell.js UI strings');
    assert.deepEqual(bad('gps-view.js'), [], 'gps-view.js UI strings');
    assert.doesNotMatch(read('gps-view.js'), /Enter carries from my Bushnell/);
    // no import / screenshot reading left
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ''), /type="file"|FileReader|<canvas|getImageData|Tesseract|share ?sheet/i);
});
