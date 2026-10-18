// ============================================================================
// HARDPAN GPS - MY CLUB DISTANCES + THE CLUB SUGGESTION (008, switch clubs)
//
// gps-shots.js HardPanGpsBag in a sandbox (the phone's storage only): the median of
// the last 10 per club with outliers dropped, the suggestion (the shortest club that
// still gets there, else the longest), per golfer, edit / reset - and how gps-view.js
// uses it (never in tournament mode, nothing leaves the phone).
// tools/gps-clubs-check.js marks a shot and reads the suggestion in headless Chrome.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-shots.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-shots.js'), sb);
    return { B: sb.HardPanGpsBag, store };
}

test('a club\'s number: the median of the last 10, outliers (outside 1.5 x IQR) dropped', { skip }, () => {
    const { B } = sandbox();
    assert.equal(B.clubAverage([]), null);
    assert.equal(B.clubAverage([158]).yd, 158);
    assert.equal(B.clubAverage([150, 160]).yd, 155, 'two: their middle');
    assert.deepEqual(JSON.parse(JSON.stringify(B.clubAverage([150, 152, 155, 158, 160, 300]))), { yd: 155, n: 5, of: 6 }, 'a 300-yard 7-iron (a flyer, a wrong club) is left out');
    assert.equal(B.clubAverage([60, 150, 152, 155, 158, 160]).yd, 155, 'a chunked one too');
    // The window is the last 10: an old, short season is forgotten.
    const old = [120, 120, 121, 122, 120];
    assert.equal(B.clubAverage(old.concat([150, 151, 152, 153, 154, 155, 156, 157, 158, 159])).yd, 155);
    assert.equal(B.clubAverage([150, 'x', -4, null, 160]).yd, 155, 'junk ignored');
});

test('the suggestion: the shortest club that gets there (>= the distance); none does - the longest; nothing in the bag - none', { skip }, () => {
    const { B } = sandbox();
    const bag = { '6i': { yd: 170 }, '7i': { yd: 158 }, '8i': { yd: 147 }, '9i': { yd: 136 } };
    assert.equal(B.suggestClub(bag, 150).club, '7i');
    assert.equal(B.suggestClub(bag, 158).club, '7i', 'exactly 158: the 7-iron');
    assert.equal(B.suggestClub(bag, 158.4).club, '6i');
    assert.equal(B.suggestClub(bag, 140).club, '8i');
    assert.equal(B.suggestClub(bag, 100).club, '9i', 'shorter than every club: the shortest');
    assert.equal(B.suggestClub(bag, 230).club, '6i', 'longer than every club: the closest (the longest)');
    assert.equal(B.suggestClub(bag, 150).name, '7-iron');
    assert.equal(B.suggestClub({}, 150), null);
    assert.equal(B.suggestClub(bag, null), null);
});

test('per golfer, on the phone only (yards, never a position): add, your own number wins, reset one, reset all', { skip }, () => {
    const { B, store } = sandbox();
    [150, 160, 158].forEach((y) => B.add('Manny Orozco', '7i', y));
    B.add('Joe Russo', '7i', 140);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, 158);
    assert.equal(B.bag('manny  orozco')['7i'].n, 3, 'the same golfer, however the name is spaced');
    assert.equal(B.bag('Joe Russo')['7i'].yd, 140, 'each golfer their own bag');
    assert.equal(B.add('Manny Orozco', 'Putter', 30), false, 'not a club in the bag');
    assert.equal(B.add('Manny Orozco', '7i', 900), false, 'not a golf shot');
    B.set('Manny Orozco', '7i', 162);
    assert.deepEqual(JSON.parse(JSON.stringify(B.bag('Manny Orozco')['7i'])), { yd: 162, n: 3, set: true });
    B.set('Manny Orozco', '5w', 210);
    assert.equal(B.bag('Manny Orozco')['5w'].yd, 210, 'a club with no shots can be typed in');
    B.set('Manny Orozco', '7i', null);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, 158, 'cleared: back to the shots');
    B.reset('Manny Orozco', '7i');
    assert.equal(B.bag('Manny Orozco')['7i'], undefined);
    B.resetAll('Manny Orozco');
    assert.deepEqual(Object.keys(B.bag('Manny Orozco')), []);
    assert.equal(B.bag('Joe Russo')['7i'].yd, 140, 'reset all is one golfer');
    assert.deepEqual(Object.keys(store), ['hardpan_bag_v1'], 'one key');
    assert.ok(!/lat|lng|\[\s*-?\d+\.\d{4,}/.test(store.hardpan_bag_v1), 'no coordinates stored: ' + store.hardpan_bag_v1);
});

test('gps-view: behind its switch; never in tournament mode; plays-like center, or the moved target; kept on the phone (no live rule)', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('clubs'\)/.test(v));
    ['gps-suggest gps-float" data-feature="clubs"', 'gps-bagask gps-float" data-feature="clubs"', 'gps-bag gps-float gps-scroll-ok" data-feature="clubs"', 'gps-my-bag" data-feature="clubs"']
        .forEach((m) => assert.ok(v.indexOf(m) !== -1, m));
    assert.ok(/if \(!bagSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="clubs"\]'\)/.test(v), 'switch off: removed');
    assert.ok(/if \(!S \|\| !bagSwitch\(\) \|\| tournament\(\)/.test(v), 'no "Which club?" in tournament mode');
    assert.ok(/if \(bagSwitch\(\) && !tournament\(\) && S\.pro/.test(v), 'no suggestion in tournament mode');
    assert.ok(/var moved = !!\(S\.targetMoved && S\.target\), to = moved \? S\.target : aimAt\(r\);/.test(v) && /playsTo\(moved \? S\.target : null\)/.test(v), 'plays-like to the center, or to the moved target');
    assert.ok(/'Suggested: ' \+ sg\.name \+ ' \(your ' \+ bagShown\(sg\.yd\) \+ '\)'/.test(v), '"Suggested: 7-iron (your 158)"');
    assert.ok(/bagAsk\(m \/ G\.M_PER_YD\);/.test(v), 'asked after the measured shot');
    const sec = v.slice(v.indexOf('// ---- MY CLUB DISTANCES'), v.indexOf('// ONE TAP (gps-features): the shot, here'));
    assert.ok(sec.length > 500 && !/\.ref\(|\.set\(|\.update\(|fetch\(/.test(sec.replace(/B\.set\(/g, '')), 'nothing written to the database or sent');
    // The live rules have no per-golfer path a phone may write this to (pushPrefs/<uid> takes bets / hype only).
    const rules = JSON.parse(read('database.rules.json')).rules;
    assert.equal(rules.pushPrefs.$uid.$other['.validate'], false);
    assert.ok(!rules.player_clubs && !rules.users, 'no per-user path for a bag in the live rules (the report names the rule needed)');
});

// ---- 009 PART B: FIRST-TIME SETUP, ENTERED vs LEARNED, ACCOUNT SYNC (switched off) ----
function sandbox2(cfg) {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, Promise, HARDPAN_GPS_CONFIG: cfg || {} };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-shots.js'), sb);
    return { B: sb.HardPanGpsBag, store, sb };
}
// A stand-in Realtime Database: one tree shared by every "phone"; set() stores what Firebase
// would (an array becomes { 0: .., 1: .. }); every write is logged.
function fakeFirebase() {
    const tree = {}, writes = [], reads = [];
    const fb = (v) => (Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [String(i), fb(x)])) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fb(x)])) : v);
    return { tree, writes, reads, db: { ref: (p) => ({
        set: (v) => { writes.push([p, JSON.parse(JSON.stringify(v))]); tree[p] = fb(JSON.parse(JSON.stringify(v))); return Promise.resolve(); },
        once: () => { reads.push(p); return Promise.resolve({ val: () => (p in tree ? JSON.parse(JSON.stringify(tree[p])) : null) }); }
    }) } };
}

test('the setup\'s starting carries: a table by handicap (scratch / 10 / 20 / 30), straight-line between, a mid default', { skip }, () => {
    const { B } = sandbox2();
    assert.deepEqual(JSON.parse(JSON.stringify(B.DEFAULT_HCPS)), [0, 10, 20, 30]);
    assert.deepEqual(Array.from(B.BAG), Object.keys(B.DEFAULT_CARRY), 'a row for every club in the bag, in bag order');
    Object.keys(B.DEFAULT_CARRY).forEach((c) => { const v = B.DEFAULT_CARRY[c]; assert.ok(v[0] > v[1] && v[1] > v[2] && v[2] > v[3], c + ': shorter as the handicap goes up'); });
    for (let i = 1; i < B.BAG.length; i++) assert.ok(B.DEFAULT_CARRY[B.BAG[i - 1]][1] > B.DEFAULT_CARRY[B.BAG[i]][1], 'each club shorter than the one before: ' + B.BAG[i]);
    assert.equal(B.defaultCarries(0)['7i'], 170);
    assert.equal(B.defaultCarries(10)['7i'], 150);
    assert.equal(B.defaultCarries(15)['7i'], 142, 'halfway between 10 (150) and 20 (134)');
    assert.equal(B.defaultCarries(-3)['Dr'], 260, 'a plus handicap: scratch');
    assert.equal(B.defaultCarries(40)['Dr'], 185, 'over 30: 30');
    assert.deepEqual(JSON.parse(JSON.stringify(B.defaultCarries(null))), JSON.parse(JSON.stringify(B.defaultCarries(B.MID_HCP))), 'unknown: the mid default');
    assert.equal(B.MID_HCP, 15);
    assert.deepEqual(JSON.parse(JSON.stringify(B.defaultCarries('x'))), JSON.parse(JSON.stringify(B.defaultCarries(15))));
});

test('setup: entered carries are the starting point; a club\'s own marked shots take over at 3 ("learned"); a typed number still wins', { skip }, () => {
    const { B } = sandbox2();
    assert.equal(B.needsSetup('Manny Orozco'), true, 'a new golfer: setup is due');
    B.setup('Manny Orozco', Object.assign(B.defaultCarries(9), { LW: '', '4i': 0 }));
    assert.equal(B.needsSetup('Manny Orozco'), false, 'done: not asked again');
    const b0 = B.bag('Manny Orozco');
    assert.equal(b0['7i'].yd, B.defaultCarries(9)['7i']);
    assert.equal(B.source(b0['7i']), 'entered');
    assert.equal(b0.LW, undefined, 'a cleared club is not in the bag');
    assert.equal(b0['4i'], undefined);
    B.add('Manny Orozco', '7i', 160); B.add('Manny Orozco', '7i', 162);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, B.defaultCarries(9)['7i'], 'two shots: still the entered carry');
    assert.equal(B.bag('Manny Orozco')['7i'].n, 2);
    B.add('Manny Orozco', '7i', 164);
    const b3 = B.bag('Manny Orozco')['7i'];
    assert.equal(b3.yd, 162, 'three of its own: the median of the marked shots');
    assert.equal(B.source(b3), 'learned');
    B.set('Manny Orozco', '7i', 155);
    assert.equal(B.bag('Manny Orozco')['7i'].yd, 155, 'typed in My bag: wins (as in 008)');
    assert.equal(B.source(B.bag('Manny Orozco')['7i']), 'entered');
    B.reset('Manny Orozco', '7i');
    assert.equal(B.bag('Manny Orozco')['7i'], undefined, 'reset: the club is empty (its setup carry too)');
    B.resetAll('Manny Orozco');
    assert.equal(B.needsSetup('Manny Orozco'), true, 'reset all: start over');
    const s2 = sandbox2();
    s2.B.skipSetup('Joe Russo');
    assert.equal(s2.B.needsSetup('Joe Russo'), false, '"Not now": not asked again');
    s2.B.add('Ann Lee', '8i', 140);
    assert.equal(s2.B.needsSetup('Ann Lee'), false, 'a golfer who already has numbers is not asked');
    assert.equal(s2.B.source(s2.B.bag('Ann Lee')['8i']), 'learned', 'no setup carry: one shot is the number (as in 008)');
    assert.ok(!/lat|lng|\[\s*-?\d+\.\d{4,}/.test(s2.store.hardpan_bag_v1), 'still yards only');
});

test('account sync ON (stand-in Firebase): player_clubs/<uid>/me, exactly { shots, set, base }; another phone loads it; own uid only', { skip }, async () => {
    const F = fakeFirebase();
    const a = sandbox2({ clubsSync: true });
    a.B.setup('Manny Orozco', { Dr: 240, '7i': 150 });
    [158, 160, 300].forEach((y) => a.B.add('Manny Orozco', '7i', y));
    a.B.set('Manny Orozco', 'PW', 121);
    assert.equal(await a.B.syncSave(F.db, 'uidManny', 'Manny Orozco'), true);
    assert.equal(F.writes.length, 1);
    assert.equal(F.writes[0][0], 'player_clubs/uidManny/me', 'the signed-in golfer\'s own uid, golferKey "me"');
    assert.deepEqual(F.writes[0][1], { shots: { '7i': [158, 160, 300] }, set: { PW: 121 }, base: { Dr: 240, '7i': 150 } });
    const json = JSON.stringify(F.tree);
    assert.ok(!/setupAt|lat|lng|name|orozco/i.test(json), 'yards only - no name, no position, no local flags: ' + json);
    // The rule's limits: clubs from the bag, yards 1-449, at most 10 shots.
    Object.values(F.tree['player_clubs/uidManny/me'].shots).forEach((m) => { const ks = Object.keys(m); assert.ok(ks.length <= 10 && ks.every((k) => /^[0-9]$/.test(k))); Object.values(m).forEach((y) => assert.ok(Number.isInteger(y) && y >= 1 && y <= 449)); });
    // ANOTHER PHONE: empty - it loads the account's bag.
    const b = sandbox2({ clubsSync: true });
    assert.equal(b.B.needsSetup('Manny O'), true);
    assert.equal(await b.B.syncLoad(F.db, 'uidManny', 'Manny O'), true);
    assert.deepEqual(F.reads, ['player_clubs/uidManny/me']);
    const bb = b.B.bag('Manny O');
    assert.equal(bb.PW.yd, 121); assert.equal(bb.Dr.yd, 240); assert.equal(bb['7i'].yd, 160, '3 shots of its own: learned (the median of 158, 160, 300)');
    assert.equal(b.B.needsSetup('Manny O'), false, 'the account\'s setup counts on this phone');
    // A phone with its own number for a club keeps it; the account fills only what it lacks.
    const c = sandbox2({ clubsSync: true });
    c.B.set('Me', 'PW', 118);
    await c.B.syncLoad(F.db, 'uidManny', 'Me');
    assert.equal(c.B.bag('Me').PW.yd, 118); assert.equal(c.B.bag('Me').Dr.yd, 240);
    // Nothing for a bad uid; nothing without a database.
    assert.equal(await a.B.syncSave(F.db, '../other', 'Manny Orozco'), false);
    assert.equal(await a.B.syncSave(null, 'uidManny', 'Manny Orozco'), false);
    assert.equal(F.writes.length, 1);
});

test('account sync OFF (as it ships): no read, no write - the bag stays on the phone', { skip }, async () => {
    const F = fakeFirebase();
    for (const cfg of [{}, { clubsSync: false }, { clubsSync: 'true' }]) {
        const a = sandbox2(cfg);
        a.B.add('Manny Orozco', '7i', 158);
        assert.equal(a.B.syncOn(), false);
        assert.equal(await a.B.syncSave(F.db, 'uidManny', 'Manny Orozco'), false);
        assert.equal(await a.B.syncLoad(F.db, 'uidManny', 'Manny Orozco'), false);
    }
    assert.equal(F.writes.length + F.reads.length, 0, 'not one database call');
    assert.match(read('gps-config.js'), /\n    clubsSync: false,\n/);
});

test('gps-view: setup behind bagSetup; sync only for the signed-in golfer\'s own bag (resolvedMeId + a real sign-in), after every change', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('bagSetup'\)/.test(v));
    assert.ok(/if \(!setupSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="bagSetup"\]'\)/.test(v), 'switch off: removed');
    assert.ok(/if \(setupSwitch\(\) && B\.needsSetup\(bagGolfer\(\)\)\) fillSetup\(\); else fillBag\(\);/.test(v), 'My bag opens on the setup the first time');
    assert.ok(/'Enter your carry for each club\. '/.test(v));
    assert.ok(/B\.defaultCarries\(hcp\)/.test(v) && /I\.current\(\)/.test(v), 'from the round\'s handicap, else the HardPan Index');
    assert.ok(/u && !u\.isAnonymous && u\.uid/.test(v) && /String\(w\.id\) === String\(me\)/.test(v), 'own bag, real sign-in');
    assert.ok(/function bagSyncCan\(B\) \{ return !!\(B && B\.syncOn\(\)/.test(v), 'behind clubsSync');
    assert.equal((v.match(/bagSaved\(\);/g) || []).length, 5, 'saved after a club pick, a typed number, a reset, reset all and the setup');
    assert.ok(/'learned \\u00b7 '/.test(v) && /'entered'/.test(v), 'learned vs entered in My bag');
});

test('gps-view: the plays-like line - behind playsBreakdown, never in tournament mode, the club for the PLAYS-LIKE number, crosswind = aim-off', { skip }, () => {
    const v = read('gps-view.js');
    const sec = v.slice(v.indexOf('function syncBreakdown('), v.indexOf('// ---- THE PAYWALL AND THE GATE'));
    assert.ok(/HardPanFeature\('playsBreakdown'\)/.test(v));
    assert.ok(/if \(!plSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="playsBreakdown"\]'\)/.test(v), 'switch off: removed');
    assert.ok(/if \(plSwitch\(\) && !tournament\(\) && S\.pro && S\.mode === 'measure'/.test(sec), 'never in tournament mode');
    assert.ok(/G\.playsParts\(pl, has \? w\.mph : null, units\(\)\)/.test(sec) && /'Plays ' \+/.test(sec));
    assert.ok(/B\.suggestClub\(B\.bag\(bagGolfer\(\)\), pl\.exact\)/.test(sec), 'the club for the plays-like distance');
    assert.ok(/bagSwitch\(\) && B && o\.from === 'me'/.test(sec), 'the club only with the clubs switch on, from the golfer');
    assert.ok(/G\.windAim\(D, rel\.cross\)/.test(sec), 'crosswind: the aim-off');
    assert.ok(/if \(S\.plClub\) text = '';/.test(v), 'the plain Suggested line steps aside');
    assert.ok(/syncBreakdown\(r, o, nums\);\s*\n\s*syncSuggest\(r, o, nums\);/.test(v), 'worked out before the plain suggestion');
    assert.ok(!/\.ref\(|fetch\(/.test(sec), 'nothing sent');
});

test('009 TOURNAMENT MODE (Rules of Golf 4.3): no plays-like, no club suggestion, no elevation fetch - every way in is shut', { skip }, () => {
    const v = read('gps-view.js');
    const fn = (name) => { const i = v.indexOf('function ' + name + '('); assert.ok(i > 0, name); return v.slice(i, v.indexOf('\n    }\n', i)); };
    // 1. No plays-like: the one function every plays-like number comes from says null first.
    assert.ok(/function playsTo\(targetPt\) \{\s*if \(tournament\(\)\) return null;/.test(v), 'playsTo: null in tournament mode');
    assert.ok(/if \(plSwitch\(\) && !tournament\(\)/.test(fn('syncBreakdown')), 'the plays-like line');
    assert.ok(/if \(tournament\(\)\) return \{ yd: yd \};/.test(fn('shotDetails')), 'a marked shot keeps its yards only');
    // 2. No club suggestion, no "Which club?".
    assert.ok(/if \(bagSwitch\(\) && !tournament\(\) && S\.pro/.test(fn('syncSuggest')));
    assert.ok(/if \(!S \|\| !bagSwitch\(\) \|\| tournament\(\)/.test(fn('bagAsk')));
    // 3. No elevation fetch: neither the whole-course prefetch nor the per-hole one.
    assert.ok(/if \(!S \|\| !S\.pro \|\| S\.elevPrefetch \|\| cfg\(\)\.elevOnTee !== false \|\| tournament\(\)\) return;/.test(fn('prefetchCourseElevs')));
    assert.ok(/if \(tournament\(\)\) return;/.test(fn('fetchElevs')));
    // ...and no other place in gps-view asks gps-offline for heights.
    assert.equal((v.match(/prefetchElevations\(/g) || []).length, 1, 'one call, the gated one');
    assert.equal((v.match(/fetch\(epqsUrl\(/g) || []).length, 1, 'one EPQS fetch, the gated one');
    // tools/gps-playslike-check.js arm 7 plays it: tournament on - no line, no suggestion, no EPQS request.
    assert.ok(/7: tournament/.test(read('tools/gps-playslike-check.js')));
});

test('009: "How plays-like works" - the (i) on the plays-like line, plain words, the very numbers the formula uses; behind playsInfo', { skip }, () => {
    const v = read('gps-view.js'), g = read('gps-geo.js');
    const a = v.indexOf('<div class="gps-plinfo'), sheet = v.slice(a, v.indexOf("+ '</div>'", a));
    assert.ok(a > 0 && /data-feature="playsInfo"/.test(sheet));
    assert.ok(/class="gps-pl-info" data-feature="playsInfo" aria-label="How plays-like works"/.test(v), 'the (i) on the line');
    assert.ok(/if \(!plInfoSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="playsInfo"\]'\)/.test(v), 'switch off: removed');
    // The words match the formula (gps-geo playsLike / windAim).
    assert.ok(/1 yard for every 3 feet/.test(sheet) && /terms\.elev = \(o\.elevToFt - o\.elevFromFt\) \/ 3/.test(g));
    assert.ok(/1% longer for every mph of headwind/.test(sheet) && /D \* 0\.01 \* head/.test(g));
    assert.ok(/0\.5% shorter for every mph of tailwind/.test(sheet) && /D \* 0\.005 \* head/.test(g));
    assert.ok(/Crosswind:<\/b> no change in distance - aim off/.test(sheet) && /about 0\.5% of the distance for every mph across/.test(sheet) && /var AIM_PER_MPH = 0\.005;/.test(g));
    assert.ok(/1 yard for every 10\\u00b0F per 100 yards/.test(sheet) && /D \* 0\.001 \* \(70 - o\.tempF\)/.test(g));
    assert.ok(/only on US courses/.test(sheet) && /estimate/.test(sheet) && /never your position/.test(sheet) && /Tournament mode turns all of it off/.test(sheet));
});
