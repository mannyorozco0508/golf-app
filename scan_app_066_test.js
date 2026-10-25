// URGENT-066 feature 2 (scorecard-scan-ai), THE APP PART - node checks.
//   plugin presence     the VisionKit document camera plugin is in the App target and registered
//   permission string   NSCameraUsageDescription in the GPS app, honest; none in the Consumer app
//   the request         exactly { image, round }; round is an allow-list - no coordinates, no
//                       location, no uid, no money - even when the round in memory carries them
//   not_configured      the inert server's answer becomes one plain sentence, and no retry button
//   limits              needs_pass / rate_limited / daily_limit / monthly_cap / busy / sign_in /
//                       offline / timeout - each a plain sentence
//   the grid's write    gps-scan-grid.js writes ONLY through saveScore (no db.ref, no firebase,
//                       no durableWrite) - the Chrome test proves it on the real card
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-scan-client.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const code = (f) => read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// A fresh copy of the client in this process, with a window of our own.
function client(win) {
    global.window = Object.assign({ navigator: { onLine: true }, document: { documentElement: { classList: { contains: () => false } } } }, win || {});
    delete require.cache[require.resolve('./gps-scan-client.js')];
    return require('./gps-scan-client.js');
}
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9], hcpIndex: ((i * 7) % 18) + 1, lat: 33.45 + i / 1000, lng: -111.9 - i / 1000, yards: 400, green: { c: [33.4, -111.9] } }));
// A round as it can sit in memory on a GPS phone: coordinates in places, a uid, money, a token.
const ROUND = {
    courseName: 'Test Scan Golf Club', courseData: CD, teeRating: { name: 'White', rating: 70.1, slope: 125 },
    players: [{ id: 101, name: 'Ann Alpha', hcp: '9', email: 'ann@example.com', uid: 'u-ann', lastLoc: { lat: 33.1, lng: -111.1 } }, { id: 102, name: 'Ben Bravo', hcp: '' }],
    ownerUid: 'owner-1', organizerToken: 'secret-token', skinsBuyIn: 20, scores: { p101_h1: 5 },
    gps: { here: [33.4561, -111.9481], accuracy: 4 }, location: { latitude: 33.4561, longitude: -111.9481 }, activeCourseKey: 'scan_test'
};

test('plugin presence: VisionKit document camera, in the App target, registered, sends and stores nothing', () => {
    const sw = read('gps-beta/ios/App/PhoneBridge/HardPanDocScanPlugin.swift');
    assert.match(sw, /import VisionKit/);
    assert.match(sw, /VNDocumentCameraViewController\.isSupported/);
    assert.match(sw, /CAPPluginMethod\(name: "available"/);
    assert.match(sw, /CAPPluginMethod\(name: "scan"/);
    assert.match(sw, /static let longEdge: CGFloat = 1800/, 'inside the 1600-2000 px long edge');
    assert.match(sw, /static let quality: CGFloat = 0\.8/);
    assert.match(sw, /imageOfPage\(at: 0\)/, 'the first page');
    assert.ok(!/URLSession|PHPhotoLibrary|UIImageWriteToSavedPhotosAlbum|write\(to:/.test(sw), 'no network, no Photos, no file');
    assert.match(read('gps-beta/ios/App/PhoneBridge/HardPanBridgeViewController.swift'), /bridge\?\.registerPluginInstance\(HardPanDocScanPlugin\(\)\)/);
    const pbx = read('gps-beta/ios/App/App.xcodeproj/project.pbxproj');
    assert.equal((pbx.match(/HardPanDocScanPlugin\.swift in Sources \*\/ = \{isa = PBXBuildFile/g) || []).length, 1);
    assert.equal((pbx.match(/AA0660000000000000000002 \/\* HardPanDocScanPlugin\.swift in Sources \*\/,/g) || []).length, 1, 'in exactly one Sources phase');
    const app = pbx.slice(pbx.indexOf('504EC3001FED79650016851F /* Sources */ = {'));
    assert.ok(app.slice(0, app.indexOf(');')).includes('HardPanDocScanPlugin.swift in Sources'), 'the App target compiles it');
    assert.match(code('gps-scan-client.js'), /Plugins\.HardPanDocScan/);
});

test('permission string: the GPS app says why it wants the camera; the Consumer app asks for nothing', () => {
    const gps = read('gps-beta/ios/App/App/Info.plist');
    const m = /<key>NSCameraUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(gps);
    assert.ok(m, 'NSCameraUsageDescription');
    assert.ok(m[1].length >= 60 && /scorecard/i.test(m[1]) && /only when you tap Scan scorecard/i.test(m[1]) && /before anything is saved/i.test(m[1]), m[1]);
    assert.ok(!/NSCameraUsageDescription/.test(read('ios/App/App/Info.plist')), 'Consumer Info.plist unchanged');
});

test('no coordinates or location in the request: the body is { image, round } and round is an allow-list', async () => {
    let sent = null;
    const C = client({
        firebase: { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('tok-123') } }) },
        fetch: (url, init) => { sent = { url, init }; return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('{"status":"not_configured"}') }); }
    });
    const ctx = C.roundContext(ROUND);
    assert.deepEqual(Object.keys(ctx).sort(), ['course', 'expectedHoles', 'holes', 'par', 'players', 'strokeIndex', 'tee']);
    assert.deepEqual(ctx.players, [{ name: 'Ann Alpha', handicap: 9 }, { name: 'Ben Bravo' }]);
    assert.equal(ctx.holes, 18);
    assert.equal(ctx.par.length, 18);
    await C.request('QUJD', ctx);
    assert.equal(sent.url, '/api/scorecard-scan');
    assert.equal(sent.init.method, 'POST');
    assert.equal(sent.init.headers.Authorization, 'Bearer tok-123');
    const body = JSON.parse(sent.init.body);
    assert.deepEqual(Object.keys(body).sort(), ['image', 'round']);
    assert.deepEqual(body.image, { data: 'QUJD', mimeType: 'image/jpeg' });
    const flat = JSON.stringify(body.round);
    ['lat', 'lng', 'latitude', 'longitude', 'location', 'lastLoc', 'gps', 'green', 'accuracy', 'coords', 'uid', 'email', 'ownerUid', 'organizerToken', 'secret-token', 'skinsBuyIn', 'scores', 'activeCourseKey', 'yards']
        .forEach((k) => assert.ok(!flat.includes(k), 'the request carries "' + k + '"'));
    assert.ok(!/33\.4|111\.9|33\.1|111\.1/.test(flat), 'no coordinate-looking number');
    // And the client code never reads a position.
    ['geolocation', 'watchPosition', 'getCurrentPosition', 'HardPanGps', 'here('].forEach((k) => assert.ok(!code('gps-scan-client.js').includes(k) && !code('gps-scan-grid.js').includes(k), k));
});

test('the native app calls the web origin; a 9-hole back-nine round says so', () => {
    const C = client({ document: { documentElement: { classList: { contains: (c) => c === 'is-native' } } } });
    assert.equal(C.apiBase(), 'https://golf-app-5a5.pages.dev');
    const back = C.roundContext({ courseData: CD.slice(9), players: [{ name: 'A' }] });
    assert.equal(back.holes, 9); assert.equal(back.startHole, 10); assert.deepEqual(back.expectedHoles, [10, 11, 12, 13, 14, 15, 16, 17, 18]);
    assert.equal(back.par[9], CD[9].par, 'par[hole-1]');
});

const answer = (status, body) => ({ fetch: () => Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(JSON.stringify(body)) }) });

test('not_configured: one plain sentence, and nothing to retry', async () => {
    const C = client(answer(503, { status: 'not_configured' }));
    const r = await C.request('QUJD', { holes: 18, par: [], players: [{ name: 'A' }] });
    assert.equal(r.ok, false); assert.equal(r.code, 'not_configured');
    assert.equal(r.message, 'Scorecard scan isn’t switched on yet. Type the scores in for now.');
    // The grid offers "Try again" for everything EXCEPT the answers a retry cannot change.
    assert.match(code('gps-scan-grid.js'), /\['not_configured', 'needs_pass', 'monthly_cap', 'daily_limit', 'sign_in'\]\.indexOf\(res\.code\) === -1/);
});

test('limits and errors: each in plain words', async () => {
    const cases = [
        [402, { status: 'refused', reason: 'needs_pass' }, 'needs_pass', /used your free scorecard scans.*host pass/],
        [429, { status: 'refused', reason: 'rate_limited' }, 'rate_limited', /Wait a minute/],
        [429, { status: 'refused', reason: 'daily_limit' }, 'daily_limit', /today’s scan limit/],
        [503, { status: 'refused', reason: 'monthly_cap' }, 'monthly_cap', /resting for now/],
        [401, { status: 'refused', reason: 'sign_in' }, 'sign_in', /Sign in first/],
        [503, { status: 'unavailable', reason: 'busy' }, 'busy', /busy right now/],
        [400, { status: 'unavailable', reason: 'bad_image' }, 'bad_image', /Lay the card flat/],
        [502, { status: 'unavailable', reason: 'upstream_error' }, 'server', /Something went wrong/],
        [504, { status: 'unavailable', reason: 'network' }, 'timeout', /took too long/],
        [500, null, 'server', /Something went wrong/],
        [200, { status: 'ok', result: { nope: 1 } }, 'unreadable', /couldn’t read the scores/],
    ];
    for (const [st, body, want, rx] of cases) {
        const C = client(answer(st, body));
        const r = await C.request('QUJD', { holes: 18, par: [], players: [{ name: 'A' }] });
        assert.equal(r.code, want, JSON.stringify(body)); assert.match(r.message, rx);
    }
    const left = await client(answer(402, { status: 'refused', reason: 'needs_pass', freeScansLeft: 0 })).request('QUJD', {});
    assert.equal(left.scansLeft, 0);
    let called = false;
    const off = client({ navigator: { onLine: false }, fetch: () => { called = true; } });
    const r = await off.request('QUJD', {});
    assert.equal(r.code, 'offline'); assert.match(r.message, /needs signal/); assert.equal(called, false, 'nothing sent with no signal');
    const ok = await client(answer(200, { status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: true, freeScansLeft: 2, result: { players: [] }, validation: { ok: true } })).request('QUJD', {});
    assert.equal(ok.ok, true); assert.deepEqual(ok.scan, { players: [] }); assert.equal(ok.scansLeft, 2);
});

test('the free-scan number is ONE constant, the shared validator\'s', () => {
    const V = require('./scorecard-validate.js');
    assert.equal(V.SCAN_FREE_LIMIT, 3);
    assert.ok(!/\b3 free\b|SCAN_FREE_LIMIT\s*=/.test(code('gps-scan-client.js') + code('gps-scan-grid.js')), 'no second copy of the number in the app');
});

test('the grid writes only through the card\'s own saveScore, after "Use these scores"', () => {
    const g = code('gps-scan-grid.js');
    ['db.ref', 'firebase', 'durableWrite', '.set(', '.update(', 'localStorage', 'sessionStorage', 'indexedDB'].forEach((k) => assert.ok(!g.includes(k), 'gps-scan-grid.js uses ' + k));
    const calls = g.match(/saveScore\(/g) || [];
    assert.equal(calls.length, 1, 'one saveScore call site');
    const at = g.indexOf('W.saveScore(w.playerId, w.hole, String(w.value))');
    assert.ok(at > g.indexOf('function write(list, locked)'), 'inside write()');
    // Through the registry the hand-off is ctx.proposeScores (the normal score sheet, pre-filled).
    assert.match(g, /f\.proposeScores\(props, \{ source: 'scan' \}\)/);
    assert.ok(g.indexOf('f.proposeScores(') < at, 'proposeScores is preferred; saveScore only without the registry');
    assert.ok(/data-hs="use"/.test(g) && /a === 'use'\) \{ st\.pad = null; use\(\)/.test(g), 'reached from the Use these scores button');
    // The validator is the shared one, not a copy.
    assert.match(g, /W\.ScorecardValidate/);
    assert.ok(!/function validateScan|function matchNames/.test(g + code('gps-scan-client.js')));
});

test('the scan button registers with customize-screen\'s feature registry (066-1 section 1)', () => {
    global.window = global; global.document = {};
    delete global.HardPanFeatureQueue; delete global.Capacitor;
    delete require.cache[require.resolve('./scorecard-validate.js')]; require('./scorecard-validate.js');
    delete require.cache[require.resolve('./gps-scan-client.js')]; require('./gps-scan-client.js');
    delete require.cache[require.resolve('./gps-scan-grid.js')]; require('./gps-scan-grid.js');
    const q = global.HardPanFeatureQueue;
    assert.ok(Array.isArray(q) && q.length === 1, 'ONE def pushed');
    const d = q[0];
    assert.equal(d.id, 'scan'); assert.match(d.id, /^[a-z][a-zA-Z0-9]{1,31}$/);
    assert.equal(d.kind, 'button'); assert.equal(d.slot, 'dock'); assert.deepEqual(d.screens, ['round']);
    assert.equal(d.defaultOn, false); assert.equal(d.tier, 'host'); assert.equal(d.isNew, true);
    assert.equal(d.freeUses, require('./scorecard-validate.js').SCAN_FREE_LIMIT, 'the validator\'s one constant');
    assert.equal(d.available(), false, 'no native plugin -> hidden (web, Consumer, the Simulator without the app)');
    global.Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'HardPanDocScan' };
    assert.equal(d.available(), true, 'the app with the plugin');
    // phone3: unlocked = the host pass only; the REAL registry lets a locked extra show while
    // free scans are left (the next test), so the Customize row shows the lock and its explainer.
    assert.equal(d.unlocked({ ent: { host: true }, usesLeft: () => 0 }), true);
    assert.equal(d.unlocked({ ent: { host: false }, usesLeft: () => 2 }), false);
    assert.equal(d.unlocked({ ent: { host: false }, usesLeft: () => 0 }), false);
    assert.equal(d.unit, 'scan', '"You have 3 free scans", "Try a free scan"');
    delete global.Capacitor; delete global.HardPanFeatureQueue; delete global.HardPanScan;
});

test('phone3: the scan def on the REAL feature registry - lock with free scans, shows when tried, hidden when used up', () => {
    const store = {};
    global.window = global; global.document = {};
    global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    global.addEventListener = global.addEventListener || function () {};
    global.HARDPAN_GPS_CONFIG = { features: {} };
    delete global.HardPanFeatures; delete global.HardPanFeatureQueue; delete global.HardPanScan;
    global.Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'HardPanDocScan' };
    for (const m of ['./feature-registry.js', './scorecard-validate.js', './gps-scan-client.js', './gps-scan-grid.js']) { delete require.cache[require.resolve(m)]; require(m); }
    const F = global.HardPanFeatures;
    assert.ok(F.list().some((x) => x.id === 'scan'), 'the queued def registered with the real registry');
    let x = F.effective().find((e) => e.id === 'scan');
    assert.equal(x.on, false, 'off by default'); assert.equal(x.locked, true, 'Host lock'); assert.equal(x.usesLeft, 3); assert.equal(x.shows, false);
    F.savePrefs({ order: ['scan'], on: { scan: true } });
    x = F.effective().find((e) => e.id === 'scan');
    assert.equal(x.shows, true, 'turned on with free scans left: the button shows');
    store.hardpan_feature_uses_v1 = JSON.stringify({ scan: 3 });
    x = F.effective().find((e) => e.id === 'scan');
    assert.equal(x.usesLeft, 0); assert.equal(x.shows, false, 'free scans used up: locked again');
    // The undeployed route (the live /api catch-all) is the plain "not switched on yet" answer.
    const C = global.HardPanScanClient;
    assert.equal(C.messageFor('no_such_route', 404), C.MESSAGES.not_configured);
    assert.equal(C.codeOf('no_such_route', 404), 'not_configured');
    for (const k of ['HardPanFeatures', 'HardPanFeatureQueue', 'HardPanScan', 'HardPanScanClient', 'Capacitor', 'HARDPAN_GPS_CONFIG', 'localStorage']) delete global[k];
});
