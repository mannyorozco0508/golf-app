// ============================================================================
// 088-3 (080): "📷 Scan the scorecard" for a COURSE card - node checks, fake server answers only
// (no Gemini, no network, no database).
//   the request      exactly { mode:'course', image, course:{ name, holes } } - no location, no names
//   fake answers     good / amber (a failed check) / retry (Pro read) / out of free scans / offline /
//                    the server switch off - each to the right result or plain words
//   on this phone    Ladies' HCP only when it checks out; tee yards ONLY when the course has no tees;
//                    never a rating or slope
//   shared publish   features.courseScanShare OFF (the shipped config) -> NOTHING read or written
//   only add         the score request is unchanged; the typed pars path is still there
//   negative control a card the validator must refuse cannot be "used"
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-course-scan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const V = require('./course-card-validate.js');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const PAR = [4, 5, 3, 4, 4, 3, 4, 4, 5, 4, 4, 3, 5, 4, 3, 4, 4, 5];
const MEN = [7, 1, 15, 11, 3, 17, 9, 5, 13, 8, 2, 16, 4, 6, 18, 12, 14, 10];
const LADIES = [5, 1, 17, 9, 3, 15, 11, 7, 13, 6, 2, 18, 4, 8, 16, 12, 14, 10];
const BLUE = [402, 538, 176, 365, 421, 158, 389, 430, 512, 395, 441, 187, 545, 378, 166, 410, 388, 520];
const tee = (name, yards) => ({ name, yards, written: { out: sum(yards.slice(0, 9)), in: sum(yards.slice(9)), total: sum(yards) } });
function card(mut) {
    const c = { course_name: 'Mesa Verde Links', holes: 18, par: PAR.slice(), par_written: { out: sum(PAR.slice(0, 9)), in: sum(PAR.slice(9)), total: sum(PAR) },
        hcp_men: MEN.slice(), hcp_ladies: LADIES.slice(), tees: [tee('Blue', BLUE.slice())], unsure: [], notes: '' };
    if (mut) mut(c);
    return c;
}
const okBody = (c, extra) => Object.assign({ status: 'ok', mode: 'course', model: 'gemini-3.8-flash', retried: false, paid: false, courseScansLeft: 2,
    result: V.parseCourseOutput(JSON.stringify(c)).value, validation: V.validateCourse(V.parseCourseOutput(JSON.stringify(c)), { holes: 18 }) }, extra || {});

// A fresh copy of the client with a window of our own.
function client(win) {
    global.window = Object.assign({ navigator: { onLine: true }, document: { documentElement: { classList: { contains: () => false } } } }, win || {});
    delete require.cache[require.resolve('./gps-scan-client.js')];
    return require('./gps-scan-client.js');
}
const answer = (status, body, spy) => ({ fetch: (url, init) => { if (spy) spy.push({ url, init }); return Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(JSON.stringify(body)) }); } });

test('the request: exactly { mode, image, course:{ name, holes } } - no location, no names, no scores', async () => {
    const sent = [];
    const C = client(answer(200, okBody(card()), sent));
    const r = await C.requestCourse('QUJD', { name: 'Mesa Verde Links', holes: 18, lat: 33.4, lng: -111.9, location: { latitude: 1 }, players: ['Ann'] });
    assert.equal(r.ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, '/api/scorecard-scan');
    const body = JSON.parse(sent[0].init.body);
    assert.deepEqual(Object.keys(body).sort(), ['course', 'image', 'mode']);
    assert.equal(body.mode, 'course');
    assert.deepEqual(body.course, { holes: 18, name: 'Mesa Verde Links' });
    assert.deepEqual(body.image, { data: 'QUJD', mimeType: 'image/jpeg' });
    assert.ok(!/lat|lng|location|players|uid/.test(sent[0].init.body));
    assert.equal(C.buildCourseBody('x', { holes: 12 }).course.holes, 18, 'only 9 or 18');
});

test('fake answers: GOOD -> the card + "2 left"; AMBER -> the card with its failed checks; RETRY -> the Pro read', async () => {
    const good = await client(answer(200, okBody(card()))).requestCourse('QUJD', { holes: 18 });
    assert.equal(good.ok, true); assert.equal(good.courseScansLeft, 2); assert.deepEqual(good.card.par, PAR);
    const bad = card((c) => { c.par[6] = 8; c.hcp_men[12] = 11; });
    const amber = await client(answer(200, okBody(bad))).requestCourse('QUJD', { holes: 18 });
    assert.equal(amber.ok, true, 'an amber card still comes back for the golfer to fix');
    assert.deepEqual([...new Set(amber.validation.hard.map((h) => h.code))].sort(), ['hcp_men', 'par_range', 'par_total', 'par_written']);
    const retry = await client(answer(200, okBody(card(), { retried: true, model: 'gemini-3.1-pro-preview' }))).requestCourse('QUJD', { holes: 18 });
    assert.equal(retry.ok, true); assert.equal(retry.retried, true); assert.equal(retry.model, 'gemini-3.1-pro-preview');
});

test('fake answers: OUT OF FREE SCANS / OFFLINE / switch off / a score answer - plain words, nothing sent where it should not be', async () => {
    const out = await client(answer(402, { status: 'refused', reason: 'needs_pass' })).requestCourse('QUJD', { holes: 18 });
    assert.deepEqual([out.ok, out.code], [false, 'needs_pass']);
    assert.match(out.message, /used your free course scans\. Type the pars and indexes instead\./);
    let called = false;
    const off = await client({ navigator: { onLine: false }, fetch: () => { called = true; } }).requestCourse('QUJD', { holes: 18 });
    assert.deepEqual([off.ok, off.code, called], [false, 'offline', false]);
    assert.match(off.message, /Scanning needs signal/);
    // the app (native) with features.scanServer not true: the plain words, no request, no photo leaves
    called = false;
    const nat = await client({ Capacitor: { isNativePlatform: () => true }, HARDPAN_GPS_CONFIG: { features: {} }, fetch: () => { called = true; } }).requestCourse('QUJD', { holes: 18 });
    assert.deepEqual([nat.code, called], ['not_configured', false]);
    assert.match(nat.message, /Course card scan isn.t switched on yet/);
    // a SCORE answer to a course request is not a card
    const score = await client(answer(200, { status: 'ok', result: { players: [] } })).requestCourse('QUJD', { holes: 18 });
    assert.equal(score.code, 'unreadable');
});

test('only add: the score request is still exactly { image, round }', () => {
    const C = client({});
    assert.deepEqual(Object.keys(C.buildBody('x', { holes: 18 })).sort(), ['image', 'round']);
    const src = read('gps-scan-client.js');
    assert.match(src, /return \{ image: \{ data: String\(image \|\| ''\), mimeType: 'image\/jpeg' \}, round: ctx \};/);
});

test('the course validator in the app is the server\'s, byte for byte (course-card-validate.js)', () => {
    const app = read('course-card-validate.js');
    assert.match(app, /COURSE_SCAN_FREE_LIMIT = 3/);
    // pinned to the server branch's copy (080-course-scan 6b691124): change both together, or neither
    const sha = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'course-card-validate.js'))).digest('hex');
    assert.equal(sha, 'a5f4f232ed1a3e1ae1d6839b01fde2cb6f850a29fc208d1fd6f943e3934f2961');
    assert.ok(!/rating|slope/i.test(JSON.stringify(V.responseSchema())), 'no rating / slope field in the schema');
});

// ---- the UI module's phone + shared parts, in a small window --------------------------------------------
function scanModule(cfg) {
    const store = new Map();
    const win = { HARDPAN_GPS_CONFIG: cfg || { features: { courseScanShare: false } },
        localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
    win.window = win;
    const ctx = vm.createContext(win);
    vm.runInContext(read('course-card-validate.js'), ctx);
    vm.runInContext(read('gps-course-scan.js'), ctx);
    return { H: win.HardPanCourseScan, store };
}
const USED = { holes: 18, par: PAR, hcpMen: MEN, hcpLadies: LADIES, tees: [{ name: 'Blue', yards: BLUE }] };

test('on this phone: Ladies\' HCP + tee yards; yards ONLY when the course has no tees; never a rating or slope', () => {
    const { H, store } = scanModule();
    const e = H.keepOnPhone('osm_w1', 'Mesa Verde Links', USED, { name: 'x', data: [] });
    assert.equal(JSON.stringify(e.hcpLadies), JSON.stringify(LADIES));
    assert.equal(e.tees.male.length, 1);
    const t = e.tees.male[0];
    assert.equal(Object.keys(t).sort().join(), 'holes,name,source,totalYards');
    assert.equal(t.totalYards, sum(BLUE)); assert.equal(t.source, 'scan');
    assert.ok(!/rating|slope/i.test(store.get(H.STORE)), 'no rating / slope stored');
    // a course that HAS tees: the yards are not kept
    const has = H.keepOnPhone('gapi_2', 'Rated CC', USED, { tees: { male: [{ name: 'Gold', rating: 71, slope: 128 }] } });
    assert.equal(has.tees, undefined, 'tees kept only when the course has none');
    assert.equal(JSON.stringify(has.hcpLadies), JSON.stringify(LADIES));
    // a second scan never replaces the first scan's tees
    const again = H.keepOnPhone('osm_w1', 'Mesa Verde Links', Object.assign({}, USED, { tees: [{ name: 'Red', yards: BLUE.map((y) => y - 50) }] }), {});
    assert.equal(again.tees.male[0].name, 'Blue');
    // Ladies' not read right -> not kept
    const nol = H.keepOnPhone('osm_w3', 'C3', Object.assign({}, USED, { hcpLadies: null }), {});
    assert.equal(nol.hcpLadies, undefined);
});

test('SHARED PUBLISH OFF (the shipped config): nothing read or written', async () => {
    const sb = { window: null }; sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-config.js'), sb);
    assert.strictEqual(sb.HARDPAN_GPS_CONFIG.features.courseScanShare, false, 'ships OFF');
    const { H } = scanModule(sb.HARDPAN_GPS_CONFIG);
    const touched = [];
    const db = { ref: (p) => { touched.push(p); return { update: (v) => { touched.push(['update', p, v]); return Promise.resolve(); }, set: (v) => { touched.push(['set', p, v]); return Promise.resolve(); }, once: () => { touched.push(['read', p]); return Promise.resolve({ val: () => null }); } }; } };
    const r = await H.publishShared(db, 'osm_w1', 'Mesa Verde Links', USED, {});
    assert.equal(JSON.stringify(r), '{"skipped":"off"}');
    assert.deepEqual(touched, [], 'no shared write');
    // absent = off too
    const { H: H2 } = scanModule({ features: {} });
    assert.equal(JSON.stringify(await H2.publishShared(db, 'osm_w1', 'x', USED, {})), '{"skipped":"off"}');
    assert.deepEqual(touched, []);
    // NEGATIVE CONTROL: switch ON -> one .update() (never .set) with name + data (+ tees only when none), no rating / slope
    const { H: on } = scanModule({ features: { courseScanShare: true } });
    const w = await on.publishShared(db, 'comm_mesa', 'Mesa Verde Links', USED, {});
    assert.equal(JSON.stringify(w.published), '["name","data","tees"]');
    assert.equal(touched.filter((t) => t[0] === 'set').length, 0);
    const up = touched.filter((t) => t[0] === 'update')[0];
    assert.equal(up[1], 'global_courses/comm_mesa');
    assert.equal(JSON.stringify(up[2].data[0]), '{"hole":1,"par":4,"hcpIndex":7}');
    assert.ok(!/rating|slope/i.test(JSON.stringify(up[2])));
    const w2 = await on.publishShared(db, 'gapi_9', 'Rated', USED, { tees: { male: [{ name: 'Gold', rating: 70, slope: 120 }] } });
    assert.equal(JSON.stringify(w2.published), '["name","data"]', 'a course with tees never gets its tees replaced');
});

test('wired where the golfer types the pars (only add): the 071b sheet and Round Setup\'s Add a course grid', () => {
    const sf = read('simple-flow.js');
    assert.match(sf, /W\.HardPanCourseScan \? W\.HardPanCourseScan\.buttonHtml\('pars'\)/);
    // the typed rows and buttons are all still there
    ['data-sf-par="', 'data-sf-si="', 'data-sf="parssave"', 'data-sf="parscancel"', 'Save and start', 'Not now'].forEach((k) => assert.ok(sf.includes(k), k));
    // the scan only fills the typed boxes; the save stays parsSave
    assert.match(sf, /b\.p\[i\] = String\(card\.par\[i - 1\]\); b\.si\[i\] = String\(card\.hcpMen\[i - 1\]\);/);
    assert.match(sf, /if \(a\.scanned\) scanKeep\(a, r, data\);/);
    const ad = read('admin.html');
    assert.match(ad, /<!-- GPS:BEGIN -->\s*<!-- 088-3[^\n]*-->\s*<div id="hcs-admin-slot"><\/div>\s*<!-- GPS:END -->/);
    assert.match(ad, /<script src="course-card-validate\.js"><\/script>\s*<script src="gps-scan-client\.js"><\/script>\s*<script src="gps-course-scan\.js"><\/script>/);
    ['id="c-par-1"', 'id="c-hcp-18"', 'validateCourseGrid()', 'onclick="submitNewCourseName()"'].forEach((k) => assert.ok(ad.includes(k), k));
});

test('the camera only from the tap: nothing in the module opens it on load', () => {
    const src = read('gps-course-scan.js');
    const caps = src.match(/\.capture\(\)/g) || [];
    assert.equal(caps.length, 1, 'one capture call');
    const at = src.indexOf('cl.capture()');
    assert.ok(at > src.indexOf('function start(opts)') && at < src.indexOf('function refreshLeft()'), 'inside start(), which only the scan button calls');
    assert.ok(!/getUserMedia|<input[^>]*capture/.test(src));
});

test('NEGATIVE CONTROL: the validator refuses each bad card the grid must block', () => {
    const check = (c) => V.validateCourse(V.parseCourseOutput(JSON.stringify(c)), { holes: 18 }).hard.map((h) => h.code);
    assert.deepEqual(check(card()), []);
    assert.ok(check(card((c) => { c.par[0] = 7; c.par_written = { out: null, in: null, total: null }; })).includes('par_range'));
    assert.ok(check(card((c) => { c.hcp_men[1] = 7; })).includes('hcp_men'));
    assert.ok(check(card((c) => { c.par = c.par.map(() => 5); c.par_written = { out: null, in: null, total: null }; })).includes('par_total'));
    assert.ok(check(card((c) => { c.par_written.out = 30; })).includes('par_written'));
    assert.ok(check(card((c) => { c.tees[0].written.out += 10; })).includes('tee_written'), 'tee totals: a HARD check, as built');
    assert.ok(check(card((c) => { c.hcp_ladies[0] = 2; })).includes('hcp_ladies'));
});
