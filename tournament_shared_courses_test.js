// SHARED COURSES IN THE COURSE DROPDOWN (bug hunt #11, option A; Manny
// 2026-11-12). A course imported for an earlier event sits in the shared
// list with its real card, and the picker now lists it first, by the start of
// its name's words, with the hole count; a 27-hole record asks which two
// nines the event plays before Save. Reached the way the organizer reaches
// it: arrive cold (tools/lib/cold-arrival.js) at 390x844 signed in, type in
// the course box, tap rows; no page function is called.
//
//  1 typing "enca": "From the shared list" with "Encanto Park · 9 holes ·
//    imported Oct 3" and no "No courses found" note; tapping it fills the box
//    and the key and the green note says it is from the shared list, 9 holes;
//    nothing written
//  2 typing "wigw": the 27-hole record is listed; tapping it shows the nines
//    chooser with the three pairs and an amber note; Save before a pair is
//    picked refuses with a sentence and writes nothing
//  3 the first pair + Save: the record's courseData is 18 holes numbered 1..18
//    with srcHole 1..18 and courseNines 'A+B'; the second pair gives srcHole
//    1..9, 19..27 and 'A+C'; the stroke index is re-ranked 1..18 in the
//    record's order, so the event is not flagged synthetic
//  4 bug #1 stays: typing "boul" and tapping The Boulders (North) does not
//    take a shared "Troon North Monument"; the shared group does not list it
//    for "boul" either
//  5 money = base
//
// Baseline against main 0f11073c (the page swapped in by cp, restored by sha):
// all 5 tests: 2 PASS / 3 FAIL (tests 4 and 5). With the build: 5 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PARS18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = (n, pars) => Array.from({ length: n }, (_, i) => ({ hole: i + 1, par: pars[i % pars.length], hcpIndex: i + 1 }));
const SHARED = {
    gca_enc: { name: 'Encanto Park', data: holes(9, [4, 3, 4, 5, 4, 3, 4, 4, 5]), source: { provider: 'golfcourseapi', importedAt: Date.UTC(2026, 9, 3, 18) } },
    gca_wig: { name: 'Wigwam (Gold)', data: holes(27, PARS18), source: { provider: 'golfcourseapi', importedAt: Date.UTC(2026, 8, 21, 18) } },
    gca_pap: { name: 'Papago Golf Course', data: holes(18, PARS18) },
    gca_troon: { name: 'Troon North Monument', data: holes(18, PARS18) }
};
const db = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: JSON.parse(JSON.stringify(SHARED)) });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var rows = Array.prototype.map.call(document.querySelectorAll('#course-dropdown > *'), function (r) { return r.className.replace('custom-select-', '') + ':' + (r.innerText || '').replace(/\\s+/g, ' ').trim(); });
  return { box: ($('#course-search-input') || {}).value || '', key: ($('#course-key') || {}).value || '', note: t('#course-note'), noteOk: !!($('#course-note') && $('#course-note').classList.contains('ok')),
    dropdown: shown($('#course-dropdown')), rows: rows, nines: shown($('#course-nines')), ninesText: t('#course-nines'),
    pairs: Array.prototype.map.call(document.querySelectorAll('#course-nines .course-nines-btn'), function (b) { return b.dataset.pair + (b.classList.contains('on') ? '*' : ''); }),
    writes: (window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const typeCourse = (text) => [{ expression: "document.getElementById('course-search-input').value = '', 1" }, { tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text } } }, { sleep: 300 }];
const FILL = { expression: `(function () { document.getElementById('t-name').value = 'Hope Foundation Scramble';
    var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); if (!p) return 'no team input'; p.value = 'Al Lopez'; return 'filled'; })()` };
const CARRY = `(function () { try {
    var saved = JSON.parse(sessionStorage.getItem('__cpw') || '[]');
    saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
    window.__coldWrites = [];
    window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__cpw', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
} catch (e) {} })();`;
const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__cpw') || '[]'), search: location.search }); } catch (e) { return 'no storage'; } })()` };
const SAVE = [FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }];
const go = async (steps, pre) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: db(), auth: OWNER, settleMs: 3000, preScript: pre, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const createdRecord = (c) => {
    const create = c.carried.find((w) => w.op === 'update' && w.path === '' && Object.keys(w.value).some((k) => /^tournaments\/[A-Z2-9]{6}$/.test(k)));
    assert.ok(create, 'the creating write: ' + JSON.stringify(c.carried.map((w) => w.path)));
    return create.value[Object.keys(create.value).find((k) => /^tournaments\//.test(k))];
};

test('1 "enca": the shared 9-hole record is listed with its count and date; a tap selects it, green note, nothing written', async () => {
    const [list, picked] = await go(typeCourse('enca').concat([READ, { tap: '#course-dropdown .course-shared-row[data-key="gca_enc"]' }, { sleep: 400 }, READ]));
    assert.equal(list.dropdown, true, 'positive: the list opened');
    assert.deepEqual(list.rows.slice(0, 2), ['group:FROM THE SHARED LIST', 'option course-shared-row:Encanto Park · 9 holes · imported Oct 3']);
    assert.ok(!list.rows.some((r) => /No courses found/.test(r)), 'no "No courses found" beside a shared match: ' + JSON.stringify(list.rows));
    assert.equal(picked.box, 'Encanto Park'); assert.equal(picked.key, 'gca_enc');
    assert.equal(picked.note, 'Scorecard: Encanto Park, 9 holes, from the shared course list.'); assert.equal(picked.noteOk, true);
    assert.equal(picked.dropdown, false); assert.equal(picked.nines, false);
    assert.deepEqual(picked.writes, []);
});

test('2 "wigw": the 27-hole record; the nines chooser; Save before a pair refuses and writes nothing', async () => {
    const [list, picked, refused] = await go(typeCourse('wigw').concat([READ, { tap: '#course-dropdown .course-shared-row[data-key="gca_wig"]' }, { sleep: 400 }, READ], SAVE, [READ]));
    assert.ok(list.rows.some((r) => /^option course-shared-row:Wigwam \(Gold\) · 27 holes · imported Sep 21$/.test(r)), JSON.stringify(list.rows));
    assert.equal(picked.key, 'gca_wig'); assert.equal(picked.box, 'Wigwam (Gold)');
    assert.equal(picked.nines, true);
    assert.match(picked.ninesText, /^Wigwam \(Gold\) · 27 holes Which two nines does the event play\? 1–9 \+ 10–18 1–9 \+ 19–27 10–18 \+ 19–27$/);
    assert.deepEqual(picked.pairs, ['A+B', 'A+C', 'B+C'], 'no pair chosen yet');
    assert.equal(picked.note, 'Wigwam (Gold) has 27 holes: pick which two nines the event plays.'); assert.equal(picked.noteOk, false);
    assert.equal(refused.note, 'Pick which two nines the event plays.');
    assert.deepEqual(refused.writes, [], 'Save refused: nothing written');
});

test('3 a pair + Save: 18 holes renumbered 1..18 with srcHole, courseNines on the record', async () => {
    for (const [pair, src] of [['A+B', Array.from({ length: 18 }, (_, i) => i + 1)], ['A+C', [1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 20, 21, 22, 23, 24, 25, 26, 27]]]) {
        const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: db(), auth: OWNER, settleMs: 3000, preScript: CARRY,
            steps: typeCourse('wigw').concat([{ tap: '#course-dropdown .course-shared-row[data-key="gca_wig"]' }, { sleep: 400 }, { tap: `#course-nines .course-nines-btn[data-pair="${pair}"]` }, { sleep: 200 }, READ], SAVE, [CARRIED]) });
        assert.ok(r.ok, r.reason);
        const objs = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
        const chosen = objs[0], c = objs[objs.length - 1];
        assert.ok(chosen.pairs.includes(pair + '*'), 'the pair is marked: ' + JSON.stringify(chosen.pairs));
        assert.match(chosen.note, /^Scorecard: Wigwam \(Gold\), nines /); assert.equal(chosen.noteOk, true);
        assert.match(c.search, /^\?tourney=[A-Z2-9]{6}&app=1$/, 'moved to the new event: ' + c.search);
        const rec = createdRecord(c);
        assert.equal(rec.courseName, 'Wigwam (Gold)'); assert.equal(rec.activeCourseKey, 'gca_wig'); assert.equal(rec.courseNines, pair);
        assert.deepEqual(rec.courseData.map((h) => h.hole), Array.from({ length: 18 }, (_, i) => i + 1));
        assert.deepEqual(rec.courseData.map((h) => h.srcHole), src);
        assert.deepEqual(rec.courseData.map((h) => h.par), src.map((n) => PARS18[(n - 1) % 18]));
        assert.deepEqual(rec.courseData.map((h) => h.hcpIndex), Array.from({ length: 18 }, (_, i) => i + 1), 'the stroke index re-ranked 1..18 in the record\'s order');
        assert.equal(rec.courseIndexSynthetic, false);
    }
});

test('4 bug #1 stays: "boul" lists no shared Troon, and The Boulders (North) does not take it', async () => {
    const [list, picked] = await go(typeCourse('boul').concat([READ, { tap: '#course-dropdown .custom-select-option' }, { sleep: 900 }, READ]),
        `(function () { window.fetch = function () { return Promise.resolve(new Response(JSON.stringify({ status: 'unavailable', reason: 'not_configured' }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }; })();`);
    assert.ok(list.rows.some((r) => /Boulders \(North\)/.test(r)), 'positive: the directory row is there');
    assert.ok(!list.rows.some((r) => /shared|Troon/i.test(r)), 'no shared group for "boul": ' + JSON.stringify(list.rows));
    assert.equal(picked.box, 'The Boulders (North)');
    assert.notEqual(picked.key, 'gca_troon');
});

test('5 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
