// ============================================================================
// HARDPAN GPS LIVE - THE PHONE'S SIDE (gps-live.js, gps-match.js with OSM off)
//
// In a sandbox with a fake Firebase (auth + Realtime Database) and a fetch that
// records every request: a search sends the typed name and the ID token to OUR
// function - never GolfAPI, never a position; a course comes from gps_links /
// gps_courses with no function call; it is kept for no signal; the bundled file
// replacing window.HardPanGolfApi does not lose it; OpenStreetMap off means no
// Overpass request; build 10 (osm: true, live: false) is one setting away.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-live.js'));
const skip = ON ? false : 'Consumer tree: no GPS live';

const PW = '012141521086298986065';
const COURSE = { id: PW, club: 'Prestwick Golf Course', course: 'Prestwick', city: 'Myrtle Beach', state: 'SC', lat: 33.643, lng: -78.961, holes: 18,
    pars: Array(18).fill(4), hcp: [], tees: [], h: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), { g: { f: [33.64 + i / 1000, -78.9601], c: [33.64 + i / 1000, -78.96], b: [33.64 + i / 1000, -78.9599] }, t: { b: [33.645 + i / 1000, -78.96] } }])) };

function sandbox(opts) {
    const o = Object.assign({ cfg: { golfapi: true, osm: false, live: true, liveBase: 'https://us-central1-golfapp-9fb21.cloudfunctions.net', liveTest: true }, db: {}, user: { uid: 'uA' }, online: true, ls: {} }, opts || {});
    const reads = [], requests = [];
    const store = o.ls;
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const firebase = {
        auth: () => ({ currentUser: o.user ? { uid: o.user.uid, getIdToken: () => Promise.resolve('ID-TOKEN-' + o.user.uid) } : null }),
        database: () => ({ ref: (p) => ({ once: () => { reads.push(p); const v = p.split('/').reduce((a, k) => (a == null ? null : a[k]), o.db); return Promise.resolve({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) }); } }) }),
    };
    const sb = { localStorage, firebase, HARDPAN_GPS_CONFIG: o.cfg, navigator: { onLine: o.online }, setTimeout, clearTimeout, AbortController, Promise, JSON, Object, Date, Math, Number, String, RegExp,
        fetch: (url, init) => { requests.push({ url, init }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o.reply ? o.reply(url, JSON.parse(init.body)) : { result: { status: 'ok', results: [] } }) }); } };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-match.js'), sb);
    vm.runInContext(read('gps-live.js'), sb);
    return { sb, reads, requests, store };
}

test('off unless the app (or a test) and live: true - and build 10 is osm: true, live: false', { skip }, () => {
    assert.equal(sandbox().sb.HardPanGpsLive.on(), true);
    assert.equal(sandbox({ cfg: { golfapi: true, osm: false, live: true, liveBase: 'x' } }).sb.HardPanGpsLive.on(), false, 'the web: off (no native, no liveTest)');
    assert.equal(sandbox({ cfg: { golfapi: true, osm: true, live: false, liveBase: 'x', liveTest: true } }).sb.HardPanGpsLive.on(), false, 'build 10');
    assert.equal(sandbox({ cfg: { golfapi: false, live: true, liveBase: 'x', liveTest: true } }).sb.HardPanGpsLive.on(), false, 'the GolfAPI kill switch turns it off too');
});

test('a search: the typed name and the ID token to OUR function - never GolfAPI, never the golfer\'s position', { skip }, async () => {
    const t = sandbox({ reply: () => ({ result: { status: 'ok', results: [{ id: PW, name: 'Prestwick Golf Course (Prestwick)', gps: true, cached: false }] } }) });
    const r = await t.sb.HardPanGpsLive.search('  Prestwick ');
    assert.equal(r.status, 'ok'); assert.equal(r.results[0].id, PW);
    assert.equal(t.requests.length, 1);
    const q = t.requests[0];
    assert.equal(q.url, 'https://us-central1-golfapp-9fb21.cloudfunctions.net/gpsSearch');
    assert.equal(q.init.method, 'POST'); assert.equal(q.init.headers.Authorization, 'Bearer ID-TOKEN-uA');
    assert.deepEqual(JSON.parse(q.init.body), { data: { name: 'Prestwick' } }, 'the name, and nothing else');
    assert.ok(!/golfapi\.io/.test(read('gps-live.js').replace(/^\s*\/\/.*$/gm, '')), 'the phone never names GolfAPI\'s server');
    assert.ok(!/latitude|coords|geolocation|watchPosition/.test(read('gps-live.js').replace(/^\s*\/\/.*$/gm, '')), 'no position anywhere in it');
});

test('signed out, or no signal: no request, and a plain message', { skip }, async () => {
    const out = sandbox({ user: null });
    assert.equal((await out.sb.HardPanGpsLive.search('Prestwick')).status, 'signin'); assert.equal(out.requests.length, 0);
    const off = sandbox({ online: false });
    assert.equal((await off.sb.HardPanGpsLive.course(PW)).status, 'offline'); assert.equal(off.requests.length, 0);
    const L = sandbox().sb.HardPanGpsLive;
    assert.equal(L.message('soon'), 'GPS coming soon for this course');
    assert.match(L.message('limit'), /5 new GPS courses today/);
    assert.match(L.message('nogps'), /Tools › Set the green/);
    assert.match(L.message('whatever'), /not available right now/);
});

test('the round\'s course from Firebase with NO function call: gps_links -> gps_courses, then kept on the phone for no signal', { skip }, async () => {
    const t = sandbox({ db: { gps_links: { gca_123: PW }, gps_courses: { [PW]: COURSE } } });
    assert.equal(await t.sb.HardPanGpsLive.ensure('gca_123'), true);
    assert.deepEqual(t.reads, ['gps_links/gca_123', 'gps_courses/' + PW]);
    assert.equal(t.requests.length, 0, 'no function, no GolfAPI');
    assert.equal(t.sb.HardPanGolfApi.courses[PW].club, 'Prestwick Golf Course');
    assert.equal(t.sb.HardPanGolfApi.links.gca_123, PW);
    // A gapi_ key (a course the function made a card for) needs no link read.
    const g = sandbox({ db: { gps_courses: { [PW]: COURSE } } });
    assert.equal(await g.sb.HardPanGpsLive.ensure('gapi_' + PW), true);
    assert.deepEqual(g.reads, ['gps_courses/' + PW]);
    // Next launch, no signal: from the phone.
    const later = sandbox({ ls: t.store, online: false });
    assert.equal(await later.sb.HardPanGpsLive.ensure('gca_123'), true);
    assert.equal(later.reads.length, 0);
    // Nothing linked: false, quietly.
    assert.equal(await sandbox().sb.HardPanGpsLive.ensure('caledonia_nope'), false);
});

test('the bundled file REPLACES window.HardPanGolfApi when it loads; merge() puts the live courses back beside it', { skip }, async () => {
    const t = sandbox({ db: { gps_courses: { [PW]: COURSE } } });
    await t.sb.HardPanGpsLive.ensure('gapi_' + PW);
    t.sb.HardPanGolfApi = { v: 1, built: 'x', courses: { B1: { id: 'B1' } }, links: { caledonia: 'B1' } };   // the bundled file loads
    t.sb.HardPanGpsLive.merge();
    assert.deepEqual(Object.keys(t.sb.HardPanGolfApi.courses).sort(), [PW, 'B1'].sort());
    assert.equal(t.sb.HardPanGolfApi.links.caledonia, 'B1', 'a bundled link is never overwritten');
    const v = read('gps-view.js'), a = read('admin.html');
    assert.ok(/return !!\(window\.HardPanGolfApi && window\.HardPanGolfApi\.built\); \}, live\);/.test(v), 'the GPS screen loads the bundled file first, then merges');
    assert.ok(/!!\(window\.HardPanGolfApi && window\.HardPanGolfApi\.built\)\) : true\)[\s\S]{0,320}window\.HardPanGpsLive\.merge\(\)/.test(a), 'so does setup');
});

test('a course picked from the search: the function\'s answer is kept, linked under the card key, and found by the matcher', { skip }, async () => {
    const t = sandbox({ reply: (url, body) => ({ result: { status: 'ready', course: COURSE, cardKey: 'gapi_' + body.data.courseId } }) });
    const r = await t.sb.HardPanGpsLive.course(PW);
    assert.equal(r.status, 'ready');
    assert.deepEqual(JSON.parse(t.requests[0].init.body), { data: { courseId: PW } });
    const k = t.sb.HardPanGpsMatch.known('gapi_' + PW, 18, 'Prestwick Golf Course (Prestwick)');
    assert.deepEqual([k.source, k.status, k.n], ['golfapi', 'ready', 18]);
    // "Find GPS for this course": our key goes along, and is linked.
    const f = sandbox({ reply: () => ({ result: { status: 'ready', course: COURSE, cardKey: null } }) });
    await f.sb.HardPanGpsLive.course(PW, 'gca_777');
    assert.deepEqual(JSON.parse(f.requests[0].init.body), { data: { courseId: PW, ourKey: 'gca_777' } });
    assert.equal(f.sb.HardPanGpsLive.idFor('gca_777'), PW);
});

test('OpenStreetMap OFF: no bundle greens, no Overpass request - GolfAPI or "no GPS data"', { skip }, async () => {
    const t = sandbox();
    t.sb.HardPanGpsCourses = require('./gps-courses.js');
    assert.equal(t.sb.HardPanGpsMatch.known('pinehills', 18, 'Myrtlewood - Pine Hills'), null, 'the OSM bundle is not used');
    const r = await t.sb.HardPanGpsMatch.match({ key: 'gca_dobson', name: 'Dobson Ranch', loc: [33.38, -111.86], holes: 18, recheck: 'pick' });
    assert.equal(r.status, 'none'); assert.equal(r.how, 'no GPS data');
    assert.equal(t.requests.length, 0, 'no Overpass');
    // Build 10 is one setting away: the bundle answers again.
    const b10 = sandbox({ cfg: { golfapi: true, osm: true, live: false, liveBase: 'x', liveTest: true } });
    b10.sb.HardPanGpsCourses = require('./gps-courses.js');
    assert.equal(b10.sb.HardPanGpsMatch.known('pinehills', 18, 'Myrtlewood - Pine Hills').source, 'bundle');
});

test('the GPS screen and setup with OSM off: GolfAPI only, no lookup, Refresh re-reads Firebase; "Search online" asks GPS on the same tap', { skip }, () => {
    const v = read('gps-view.js'), a = read('admin.html');
    assert.ok(/if \(ga\) return ga;\s*\n\s*if \(!osmOn\(\)\) return null;/.test(v), 'osmRecord: GolfAPI or nothing');
    assert.ok(/if \(!osmOn\(\)\) \{\s*\n\s*var L = window\.HardPanGpsLive;\s*\n\s*if \(!liveOn\(\) \|\| !L\) \{ fin\(false\); return; \}/.test(v), 'no OpenStreetMap lookup');
    const run = a.slice(a.indexOf('async function runOnlineCourseSearch'), a.indexOf('function renderOnlineOutcome'));
    assert.ok(/\/\/ GPS:BEGIN[\s\S]{0,600}const gpsLive = scorecardsOnly \? Promise\.resolve\(null\) : gpsLiveSearch\(query\);[\s\S]{0,800}\/\/ GPS:END/.test(run), 'asked on the tap (GolfAPI first since gps-features)');
    assert.ok(/\/\/ GPS:BEGIN\s*\n\s*if \(!scorecardsOnly\) gpsLiveRender\(await gpsLive, query\);\s*\n\s*\/\/ GPS:END/.test(run), 'shown first, above the scorecard results (when GolfAPI had no GPS course)');
    assert.ok(!/gpsLive/.test(require('./tools/gps-flag.js').applyFlag(a, false)), 'none of it in the Consumer app');
    assert.ok(!/addEventListener\('input'[\s\S]{0,200}gpsLive/.test(a), 'never as you type');
});

// ---- BUILD 12: the array Firebase hands back ----------------------------------
const FB = Object.assign({}, COURSE, { h: [null].concat(Array.from({ length: 18 }, (_, i) => COURSE.h[String(i + 1)])) });

test('a course read from Firebase (holes as an ARRAY, [0] empty) is kept as an object, and the matcher and setup line do not throw', { skip }, async () => {
    const t = sandbox({ db: { gps_courses: { [PW]: FB } } });
    assert.equal(await t.sb.HardPanGpsLive.ensure('gapi_' + PW), true);
    const kept = t.sb.HardPanGolfApi.courses[PW];
    assert.ok(!Array.isArray(kept.h)); assert.equal(Object.keys(kept.h).length, 18);
    const k = t.sb.HardPanGpsMatch.known('gapi_' + PW, 18, 'Prestwick Golf Course (Prestwick)');
    assert.deepEqual([k.source, k.status, k.n], ['golfapi', 'ready', 18]);
    // A cached function answer has the same shape.
    const c = sandbox({ reply: () => ({ result: { status: 'ready', course: FB, cardKey: 'gapi_' + PW } }) });
    await c.sb.HardPanGpsLive.course(PW);
    assert.equal(c.sb.HardPanGpsMatch.known('gapi_' + PW, 18, 'x').n, 18);
    // A copy kept on the phone BEFORE this fix (an array) is repaired at load.
    const old = sandbox({ ls: { ['hardpan_gpslive_v1_' + PW]: JSON.stringify(FB) } });
    assert.ok(!Array.isArray(old.sb.HardPanGpsLive._store.courses[PW].h));
    // And gps-geo itself never trips on an empty slot.
    const G = require('./gps-geo.js');
    assert.equal(Object.keys(G.golfapiRecord([FB]).holes).length, 18);
});

test('setup after a pick: the card is read FRESH and put in hand before it is selected; GolfAPI courses are in the saved list (HardPan only)', { skip }, () => {
    const a = read('admin.html');
    const pick = a.slice(a.indexOf('async function gpsLivePick'), a.indexOf('async function gpsLiveFind'));
    assert.ok(/db\.ref\('global_courses\/' \+ r\.cardKey\)\.once\('value'\)[\s\S]{0,300}globalCourses\[r\.cardKey\] = rec;[\s\S]{0,200}selectCourse\(r\.cardKey, rec\.name\)/.test(pick), 'fresh read -> in hand -> selected');
    assert.ok(/k\.startsWith\('gapi_'\)/.test(a) && !/gapi_/.test(require('./tools/gps-flag.js').applyFlag(a, false)), 'gapi_ in the saved list, GPS build only');
});

// ---- FINDING AN OLD SAVED COURSE (gps-features) ---------------------------------
// GolfAPI's search is strict: "Legacy Golf Resort" finds nothing; GolfAPI calls it
// "The Legacy Golf Club" (Phoenix). There is also a "Legacy Golf Club" in Las Vegas.
const LEG = [{ id: '0121646345752376514', club: 'The Legacy Golf Club', course: '18-hole course', name: 'The Legacy Golf Club (18-hole course)', city: 'Phoenix', state: 'AZ', holes: 18, gps: true },
    { id: '0999000111', club: 'Legacy Golf Club', course: 'Legacy Golf Club', name: 'Legacy Golf Club', city: 'Henderson', state: 'NV', holes: 18, gps: true },
    { id: '0999000222', club: 'Legacy Ridge', course: 'Legacy Ridge', name: 'Legacy Ridge', city: 'Phoenix', state: 'AZ', holes: 9, gps: false }];
const byName = (url, body) => ({ result: { status: 'ok', results: /^legacy$/i.test(body.data.name) ? LEG : [] } });

test('find: the name in shorter forms until GolfAPI answers; the saved card\'s city + state pick ONE clear match', { skip }, async () => {
    const t = sandbox({ reply: byName });
    assert.deepEqual(t.sb.HardPanGpsLive.nameVariants('Legacy Golf Resort'), ['Legacy Golf Resort', 'legacy']);
    const r = await t.sb.HardPanGpsLive.find('Legacy Golf Resort', { city: 'Phoenix', state: 'Arizona' });
    assert.equal(r.status, 'ok'); assert.equal(r.query, 'legacy');
    assert.equal(r.clear && r.clear.id, '0121646345752376514', 'Phoenix, AZ - not Henderson, NV; never the 9-hole course with no GPS');
    assert.deepEqual(t.requests.map((q) => JSON.parse(q.init.body).data.name), ['Legacy Golf Resort', 'legacy'], 'two searches (cached for everyone after)');
});

test('find: no city / state stored -> no guess, the golfer chooses; nothing anywhere -> "none" with what was tried', { skip }, async () => {
    const t = sandbox({ reply: byName });
    const r = await t.sb.HardPanGpsLive.find('Legacy Golf Resort', null);
    assert.equal(r.status, 'ok'); assert.equal(r.clear, null);
    assert.deepEqual(r.matches.map((x) => x.state), ['AZ', 'NV'], 'GPS courses only');
    const n = sandbox({ reply: () => ({ result: { status: 'ok', results: [] } }) });
    const none = await n.sb.HardPanGpsLive.find('Nowhere Golf Club', { city: 'Tucson', state: 'AZ' });
    assert.equal(none.status, 'none'); assert.deepEqual(none.tried, ['Nowhere Golf Club', 'nowhere']);
    const wrongState = await sandbox({ reply: byName }).sb.HardPanGpsLive.find('Legacy Golf Resort', { city: 'Austin', state: 'TX' });
    assert.equal(wrongState.status, 'none', 'Phoenix and Henderson are not Texas: not offered as Austin\'s course');
});

test('setup: an old saved course with no GPS looks itself up ONCE on pick, links a clear match (gps_links, for everyone), never fails silently', { skip }, () => {
    const a = read('admin.html');
    assert.ok(/if \(!gpsFindTried\[key\] && navigator\.onLine !== false && !\/\^gapi_\/\.test\(key\)\) \{ gpsLiveFind\(key, name, \{ auto: true \}\); return; \}/.test(a), 'auto, once');
    const f = a.slice(a.indexOf('async function gpsLiveFind'), a.indexOf('// GPS:END', a.indexOf('async function gpsLiveFind')));
    assert.ok(/L\.find\(name, where\)/.test(f) && /L\.course\(x\.id, key\)/.test(f), 'the saved course key goes along: the function writes gps_links/<key>');
    assert.ok(/No GPS match for/.test(f) && /label: 'Search online'/.test(f) && /None of these (\u2014|\\u2014) Search online/.test(f), 'every outcome says something and offers Search online');
    assert.ok(/gpsCourseRowSub\(optionDiv, id\)/.test(a) && /gps-row-where/.test(a), 'city, state under each saved course');
});

// ---- GOLFAPI AS THE SCORECARD SOURCE (gps-features) ------------------------------
test('Search online asks GolfAPI first; with a GPS course the free GolfCourseAPI search is not spent; "Not listed?" runs it; ratings backup only when the card has none', { skip }, () => {
    const a = read('admin.html');
    const run = a.slice(a.indexOf('async function runOnlineCourseSearch'), a.indexOf('function renderOnlineOutcome'));
    const gpsFirst = run.indexOf('const g = await gpsLive;'), gcaFetch = run.indexOf("fetch(courseApiBase() + '/api/course-search");
    assert.ok(gpsFirst > 0 && gcaFetch > gpsFirst, 'GolfAPI is awaited BEFORE any GolfCourseAPI request');
    assert.ok(/\(g\.results \|\| \[\]\)\.some\(\(x\) => x\.gps\)\) \{[\s\S]{0,300}gpsScorecardOnlyRow\(query\);[\s\S]{0,120}return;/.test(run), 'GPS course found: show it, offer "Not listed?", return - no GolfCourseAPI');
    assert.ok(/runOnlineCourseSearch\(query, row, \{ scorecardsOnly: true \}\)/.test(a), '"Not listed?" = the old search');
    const pick = a.slice(a.indexOf('async function gpsLivePick'), a.indexOf('async function gpsLivePick') + 2500);
    assert.ok(/if \(!courseTeeChoices\(rec\)\.length\) gpsRatingsBackup\(r\.cardKey, x\);/.test(pick), 'backup only without rated tees');
    const bk = a.slice(a.indexOf('async function gpsRatingsBackup'), a.indexOf('let gpsLivePicking'));
    assert.ok(!/db\.ref|\.set\(|\.update\(/.test(bk), 'the backup writes nothing to Firebase');
    assert.ok(!/scorecardsOnly|gpsRatingsBackup/.test(require('./tools/gps-flag.js').applyFlag(a, false)), 'HardPan only');
});
