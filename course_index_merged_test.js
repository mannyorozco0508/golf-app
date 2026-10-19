// URGENT-006 (2026-10-18, Manny's OK): Dobson Ranch had two shared records - GolfAPI's
// gapi_0121324924309988 and GolfCourseAPI's gca_zgkynkan - and search showed two identical
// rows. The duplicate is marked mergedInto: 'gca_zgkynkan' (not deleted). This holds that a
// merged record is offered by NO picker (cold read, cached index, a newly seen key), that
// a round already on it still loads it by key, and that the index version moved so every
// device rebuilds once. Undo = remove the mergedInto field.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const IDX = require('./course-index.js');

const CARD = [{ hole: 1, par: 5 }];
const KEEP = { name: 'Dobson Ranch Golf Course', data: CARD, location: { city: 'Mesa' } };
const DUP = { name: 'Dobson Ranch Golf Course', data: CARD, location: { city: 'Mesa' }, mergedInto: 'gca_zgkynkan', mergedAt: 1, };
const ALL = { gca_zgkynkan: KEEP, gapi_0121324924309988: DUP, pebble: { name: 'Pebble Beach', data: CARD } };
function rig(o) {
    const store = { v: o.stored || null };
    const into = {};
    const loader = IDX.courseIndexLoader({
        into, databaseURL: 'https://x.firebaseio.com', now: () => 1000,
        readRecord: (k) => Promise.resolve(ALL[k] || null),
        readAll: () => Promise.resolve(ALL),
        fetchJson: () => Promise.resolve(o.shallow === undefined ? null : o.shallow),
        getItem: () => store.v, setItem: (k, v) => { store.v = v; },
    });
    return { loader, into, store };
}

test('the index version moved, so every cached picker rebuilds once', () => {
    assert.equal(IDX.COURSE_INDEX_VERSION, 2);
});
test('a cold read offers one Dobson Ranch (gca_zgkynkan) and never the merged one', async () => {
    const r = rig({});
    await r.loader.load();
    assert.deepEqual(Object.keys(r.into).sort(), ['gca_zgkynkan', 'pebble']);
    assert.ok(!/gapi_0121324924309988/.test(r.store.v), 'the merged key is in the saved name index');
});
test('a cached index that sees the merged key as NEW does not add it', async () => {
    const stored = JSON.stringify({ v: 2, at: 1000, names: { gca_zgkynkan: 'Dobson Ranch Golf Course', pebble: 'Pebble Beach' } });
    const r = rig({ stored, shallow: { gca_zgkynkan: true, gapi_0121324924309988: true, pebble: true } });
    await r.loader.load();
    assert.deepEqual(Object.keys(r.into).sort(), ['gca_zgkynkan', 'pebble']);
});
test('a round already on the merged record still loads its card by key (QJQHW7, 5APBCT)', async () => {
    const r = rig({});
    const rec = await r.loader.ensureCard('gapi_0121324924309988');
    assert.equal(rec.name, 'Dobson Ranch Golf Course');
    assert.deepEqual(rec.data, CARD);
});
test('the old cached index (version 1) is not trusted', () => {
    assert.equal(IDX.courseIndexParse(JSON.stringify({ v: 1, at: 1000, names: { gapi_0121324924309988: 'Dobson Ranch Golf Course' } }), 1000), null);
});
