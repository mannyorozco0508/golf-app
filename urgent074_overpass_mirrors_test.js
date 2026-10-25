// ============================================================================
// 074 PART 2 - OVERPASS MIRRORS, ONE RETRY, THEN "MAP DATA SERVER BUSY" (in memory, no network)
//
// Manny: "If Overpass fails on a first load: try 1-2 other public Overpass mirrors, then retry once, then
// show 'Map data server busy, try again.'" gps-match.js's lookup runs in a vm with a stood-in fetch:
//   1  every server fails: VK Maps, overpass-api.de, Private.coffee in that order, then ONE retry of the
//      first - then the lookup is 'could not be reached' (the app's busy line), 4 calls, no more;
//   2  the first server 504s, the next answers: holes in, 2 calls for the first query;
//   3  071's remark rule: an overloaded 200 + error remark moves on to the next mirror (not "no data");
//   4  a CLEAN empty answer is a real "nothing there": 1 call, no mirror hopping, 1-day mark (071) kept;
//   5  the course's location is the only point sent (never the golfer's).
// Run against dfcf6f48 (071) as the negative control: 1 and 3 fail there (2 servers, no retry; the
// remark ended the lookup on the first server).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = process.env.HP074_DIR || __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const PT = [43.1789, -124.394];
const COURSE = { elements: [{ type: 'way', id: 1540940976, tags: { leisure: 'golf_course', name: 'Shortys' }, center: { lat: PT[0], lon: PT[1] } }] };
function holesAnswer() {
    const el = [];
    for (let n = 1; n <= 3; n++) {
        const la = PT[0] + n * 0.0015, lo = PT[1], g = la + 0.0008, d = 0.00012;
        el.push({ type: 'way', id: 900 + n, tags: { golf: 'hole', ref: String(n), par: '3' }, geometry: [{ lat: la, lon: lo }, { lat: la + 0.0008, lon: lo }] });
        el.push({ type: 'way', id: 950 + n, tags: { golf: 'green' }, geometry: [{ lat: g - d, lon: lo - d }, { lat: g - d, lon: lo + d }, { lat: g + d, lon: lo + d }, { lat: g + d, lon: lo - d }, { lat: g - d, lon: lo - d }] });
    }
    return { osm3s: { timestamp_osm_base: '2026-10-25T00:00:00Z' }, elements: el };
}
// plan(url, query, callNo) -> 'ok' | 504 | 'remark' | 'empty'
function page(plan) {
    const mem = new Map(), calls = [];
    const sb = { console, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), clearTimeout, Promise, JSON, Math, Date, Object, Array, AbortController,
        navigator: { onLine: true }, HARDPAN_GPS_CONFIG: { osm: false, live: true },
        localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
    sb.fetch = (u, init) => {
        const q = decodeURIComponent(String(init.body).replace(/^data=/, ''));
        calls.push({ u: String(u), q: /leisure/.test(q) ? 'courses' : 'holes', body: q });
        const what = plan(String(u), calls[calls.length - 1].q, calls.length);
        if (typeof what === 'number') return Promise.resolve({ ok: false, status: what, json: () => Promise.reject(new Error('html')) });
        const j = what === 'remark' ? { elements: [], remark: 'runtime error: Query timed out in query at line 1 after 26 seconds.' }
            : what === 'empty' ? { elements: [] } : calls[calls.length - 1].q === 'courses' ? COURSE : holesAnswer();
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(j) });
    };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb, { filename: 'gps-geo.js' });
    vm.runInContext(read('gps-match.js'), sb, { filename: 'gps-match.js' });
    const go = () => sb.HardPanGpsMatch.match({ key: 'osm_w1540940976', name: 'Shortys', loc: PT, holes: 18 });
    return { go, calls, mem };
}
const host = (u) => new URL(u).hostname;

test('every server fails: VK Maps, overpass-api.de, Private.coffee, then ONE retry of the first - then "could not be reached"', async () => {
    const p = page(() => 504);
    const r = await p.go();
    assert.deepEqual(p.calls.map((c) => host(c.u)), ['maps.mail.ru', 'overpass-api.de', 'overpass.private.coffee', 'maps.mail.ru'], 'mirrors in order, then one retry');
    assert.equal(r.status, 'none');
    assert.equal(r.kept, false);
    assert.match(r.how, /could not be reached/, 'the app shows the busy line for this');
    const mark = JSON.parse(p.mem.get('hardpan_osm_v1_tried_osm_w1540940976'));
    assert.equal(mark.none, false);
    const left = 3600 * 1000 - (Date.now() - mark.at);
    assert.ok(left > 9 * 60 * 1000 && left <= 10 * 60 * 1000 + 1000, '071: asked again after 10 min: ' + left);
});

test('the first server 504s, the next answers: holes in (2 calls for the courses query)', async () => {
    const p = page((u, q, n) => (n === 1 ? 504 : 'ok'));
    const r = await p.go();
    assert.equal(r.status, 'partial'); assert.equal(r.n, 3);
    assert.deepEqual(p.calls.map((c) => host(c.u) + ':' + c.q), ['maps.mail.ru:courses', 'overpass-api.de:courses', 'maps.mail.ru:holes']);
});

test("071's remark rule: an overloaded answer (200, error remark) moves on to the next mirror, not 'no data'", async () => {
    const p = page((u, q, n) => (n <= 2 ? 'remark' : 'ok'));
    const r = await p.go();
    assert.equal(r.status, 'partial', JSON.stringify(r));
    assert.deepEqual(p.calls.slice(0, 3).map((c) => host(c.u)), ['maps.mail.ru', 'overpass-api.de', 'overpass.private.coffee']);
    const q = page(() => 'remark'); const r2 = await q.go();
    assert.match(r2.how, /could not be reached/); assert.equal(q.calls.length, 4);
});

test('a clean empty answer is a real "nothing there": 1 call, no mirror hopping, kept 1 day (071), "Tap the middle of the green"', async () => {
    const p = page(() => 'empty');
    const r = await p.go();
    assert.equal(p.calls.length, 1);
    assert.equal(r.status, 'none'); assert.notEqual(r.kept, false);
    const mark = JSON.parse(p.mem.get('hardpan_osm_v1_tried_osm_w1540940976'));
    assert.equal(mark.none, true);
});

test("only the course's own point is sent - never the golfer's", async () => {
    const p = page(() => 'ok');
    await p.go();
    const b = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(p.calls[0].body).slice(1).map(Number);
    assert.ok(b[0] < PT[0] && PT[0] < b[2] && b[1] < PT[1] && PT[1] < b[3], 'the box is around the COURSE point: ' + b);
    assert.ok(p.calls.every((c) => !/33\.45|-111\.95/.test(c.body)), 'no other point');
});
