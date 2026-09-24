// ============================================================================
// v213 — THE PLAYERS SHEET'S HANDICAP BOX IS THE INDEX ON A GHIN ROUND.
//
// THE PROBLEM v212 LEFT OPEN, in its own report: the sheet's box edited the
// PLAYING handicap while the label beside it named a GHIN Index and a Course
// Handicap. Typing 12 into it wrote hcp 12 and left handicapIndex 18 standing -
// so the stored Index described a number no longer derived from it, and the
// label was then a lie. Marty's group follows GHIN, so the box must be the
// Index.
//
// WHAT THE BOX MEANS NOW, by the round's own basis (handicapBasis, default
// 'ghin-index' - see handicap-labels.js handicapBasisOf):
//   GHIN round         the box is the golfer's Handicap Index. A typed number
//                      re-runs handicap.js's convertHandicapIndex against the
//                      round's teeRating and writes handicapIndex,
//                      courseHandicap and hcp TOGETHER - never hcp alone.
//   as-entered round   unchanged: the box is the Playing Handicap, and hcp is
//                      the only key written.
//   GHIN, no tee rating  the Index is still stored, hcp takes the typed number
//                      and handicapUnconverted marks it, so every screen says
//                      so rather than inventing a Course Handicap.
// A golfer ADDED from the sheet goes through the same conversion.
//
// THIS IS MONEY-ADJACENT: hcp is what every net and every dollar is computed
// from. So the proof here is behavioural, through the sheet's own
// collect -> buildPlayersUpdate -> commitPlayersDraft path and the write that
// comes out of it - never a source pin.
//
// NO PROTECTED FILE. The conversion is handicap.js's convertHandicapIndex and
// playerHandicapFields, called and not edited; this suite pins handicap.js's
// sha to prove it.
//
// THE BRIEF'S ARITHMETIC, CORRECTED. The brief said "typed 18 off a 131/73.4/72
// tee -> index 18, course 22.73, hcp 22". Two different indexes are mixed
// there. handicap.js's own numbers, off that tee:
//     typed 18    course 22.26725663716815  ("22.27")  playing 22
//     typed 18.4  course 22.730973451327436 ("22.73")  playing 23
// 22.73 is the 18.4 case, and its playing handicap is 23, not 22. Both are
// tested below, with the numbers the engine actually produces.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 16);
const J = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const run = (sb, c) => vm.runInContext(c, sb);
const CD = makeCourseData(18);
const TEE = { teeKey: 'white', teeName: 'White', slope: 131, courseRating: 73.4, par: 72, allowance: 100 };
const COURSE_18 = 18 * (131 / 113) + (73.4 - 72);          // 22.26725663716815
const COURSE_184 = 18.4 * (131 / 113) + (73.4 - 72);        // 22.730973451327436

// Ann already converted (index 18), Ben converted (index 4.5), Cal legacy with
// no index at all, Dee with an index but saved off an unrated tee.
function round(extra) {
    // The stored hcp on each converted golfer is what their index ACTUALLY
    // converts to off this tee - 18 plays 22, 4.5 plays 7. A fixture whose stored
    // playing handicap does not match its own index is a round the app cannot
    // produce, and it made the note below look wrong when it was right.
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], ['22', '7', '9', '12'], 101);
    players[0].handicapIndex = '18';  players[0].courseHandicap = COURSE_18;
    players[1].handicapIndex = '4.5'; players[1].courseHandicap = 4.5 * (131 / 113) + 1.4;
    players[3].handicapIndex = '12';  players[3].handicapUnconverted = true;
    const scores = {};
    players.forEach(p => { for (let h = 1; h <= 9; h++) scores['p' + p.id + '_h' + h] = 5; });
    return Object.assign({
        eventName: 'monday', roundDay: 'monday', gameFormat: 'stroke', ownerUid: 'anon-stub',
        activeCourseKey: 'tst', courseName: 'Test Links', courseData: CD, players, scores,
        groupSizeOverrides: { 0: 4 }, settlementMode: 'whole-dollar', teeRating: TEE
    }, extra || {});
}

// The page, with the sheet's mounts in the tree (mini-dom parses no markup) and
// the round delivered through the page's own value listener.
function page(data) {
    const sb = loadHtmlInlineScript('index.html', [], {
        search: '?game=PSI1',
        beforeRun(sandbox) {
            const realDatabase = sandbox.firebase.database;
            sandbox.firebase.database = Object.assign(function () {
                const dbi = realDatabase();
                const o = dbi.ref.bind(dbi);
                dbi.ref = (p) => { const r = o(p); if (p === 'events/PSI1') r.once = () => Promise.resolve({ val: () => J(sandbox.__fresh || data), exists: () => true }); return r; };
                return dbi;
            }, realDatabase);
        }
    });
    run(sb, "['players-sheet', 'players-sheet-body', 'players-sheet-money', 'players-sheet-warn', 'group-filter-container', 'game-setup-mount']"
        + ".forEach(function (id) { var el = document.getElementById(id); if (el) document.__mount(el); });");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/PSI1');
    assert.ok(h, 'the page subscribed to its own round');
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
// WHAT THE HARNESS CAN AND CANNOT DO HERE, because it decided the shape of this
// file. mini-dom's innerHTML is a STRING - no child nodes are parsed from it - so
// `#players-sheet-body .ps-row` is always empty and neither collectPlayersSheet()
// nor psHcpBoxInput() can be driven through the rendered sheet. So:
//   RENDER      asserted on the markup the sheet emits, row by row, below.
//   THE WRITE   asserted through buildPlayersUpdate and commitPlayersDraft with a
//               draft object of exactly the shape collectPlayersSheet returns -
//               the same way players_sheet_test.js has always done it.
//   THE LIVE NOTE  the builder is unit-tested here and the oninput wire is pinned;
//               that typing actually moves the line is measured in a real browser
//               by tools/handicap-legibility-check.js, which types into the box.
const sheetHtml = (sb) => { run(sb, 'renderPlayersSheet(currentData);'); return String(run(sb, "document.getElementById('players-sheet-body').innerHTML")); };
// One entry per rendered row, in order.
const rowsOf = (html) => html.split('<div class="ps-row').slice(1);
const boxValues = (sb) => rowsOf(sheetHtml(sb)).map(r => { const m = r.match(/class="ps-hcp"[^>]*value="([^"]*)"/); return m ? m[1] : null; });
const notes = (sb) => rowsOf(sheetHtml(sb)).map(r => { const m = r.match(/class="ps-hcp-note">([^<]*)</); return m ? m[1] : null; });
const build = (sb, draft) => J(run(sb, 'buildPlayersUpdate(currentData, ' + JSON.stringify(draft) + ')'));
// A draft of the shape collectPlayersSheet() returns: every golfer as the box
// shows them, with the typed changes applied. `typed` is keyed by roster index.
function draftFromSheet(sb, data, typed, added) {
    const shown = (p) => J(run(sb, 'psShownHandicap(' + JSON.stringify(p) + ', currentData)'));
    const edits = (data.players || []).map((p, i) => ({
        idx: i, name: p.name, hcp: (typed && typed[i] !== undefined) ? String(typed[i]) : shown(p),
        flight: p.flight === 'B' ? 'B' : 'A', out: p.out === true, group: 1
    }));
    return { edits, added: (added || []).map(a => ({ group: a.group || 1, name: a.name, hcp: String(a.hcp), flight: 'A' })) };
}

// ---------------------------------------------------------------------------
describe('1. NO MATH MOVED', () => {
    test('handicap.js is byte-for-byte unchanged', () => {
        assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b8', 'handicap.js changed: ' + sha('handicap.js'));
    });
    test('and the conversion this suite expects IS handicap.js\'s own', () => {
        const H = loadJsFile('handicap.js');
        const c = H.convertHandicapIndex('18', TEE);
        assert.equal(c.indexText, '18');
        assert.ok(Math.abs(c.course - COURSE_18) < 1e-12, 'course ' + c.course);
        assert.equal(c.playingText, '22');
        const d = H.convertHandicapIndex('18.4', TEE);
        assert.ok(Math.abs(d.course - COURSE_184) < 1e-12, 'course ' + d.course);
        assert.equal(d.playingText, '23', 'the brief\'s 22.73 is the 18.4 case, and it plays off 23');
    });
});

// ---------------------------------------------------------------------------
describe('2. THE BOX SHOWS THE INDEX, AND SAYS SO', () => {
    test('a GHIN round: each converted golfer\'s box holds their INDEX, not their playing handicap', () => {
        const sb = page(round());
        const boxes = boxValues(sb);
        assert.equal(boxes.length, 4, 'four rows rendered: ' + JSON.stringify(boxes));
        // Ann plays off 22 and is off 18; the box must say 18.
        assert.deepEqual(boxes, ['18', '4.5', '9', '12'], 'boxes: ' + JSON.stringify(boxes));
    });
    test('and the box is labelled Index', () => {
        const sb = page(round());
        const html = sheetHtml(sb);
        assert.match(html, /class="ps-hcp"[^>]*placeholder="Index"/, 'the box says Index');
        assert.ok(!/class="ps-hcp"[^>]*placeholder="HCP"/.test(html), 'and not HCP on a GHIN round');
    });
    test('an AS-ENTERED round: the box holds the playing handicap and is labelled HCP', () => {
        const sb = page(round({ handicapBasis: 'as-entered' }));
        assert.deepEqual(boxValues(sb), ['22', '7', '9', '12'], 'boxes: ' + JSON.stringify(boxValues(sb)));
        assert.match(sheetHtml(sb), /class="ps-hcp"[^>]*placeholder="HCP"/);
    });
    test('the note names the DERIVED Course number beside the box', () => {
        const sb = page(round());
        const n = notes(sb);
        assert.match(n[0], /Course 22\.27/, 'Ann: ' + n[0]);
        assert.match(n[0], /22/, 'and what she plays off');
        // Cal has no stored Index and Dee's was stored without a tee rating.
        // Neither is rewritten by a save that does not touch their box, so neither
        // note may promise a Course Handicap - it says what to do instead.
        assert.equal(n[2], 'Not yet converted — retype to convert', 'Cal: ' + n[2]);
        assert.equal(n[3], 'Not yet converted — retype to convert', 'Dee: ' + n[3]);
    });
});

// ---------------------------------------------------------------------------
describe('3. TYPING AN INDEX REWRITES ALL THREE KEYS', () => {
    test('GHIN, typed 18.4 over Ann\'s 18: index, course AND hcp, together', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '18.4' }));
        assert.equal(u.changed, true);
        assert.equal(u.whole, false, 'still a narrow write');
        assert.equal(u.updates['players/0/handicapIndex'], '18.4');
        assert.ok(Math.abs(u.updates['players/0/courseHandicap'] - COURSE_184) < 1e-9, 'course: ' + u.updates['players/0/courseHandicap']);
        assert.equal(u.updates['players/0/hcp'], '23', 'and the playing handicap follows: ' + u.updates['players/0/hcp']);
        assert.deepEqual(Object.keys(u.updates).sort(),
            ['players/0/courseHandicap', 'players/0/handicapIndex', 'players/0/hcp'],
            'exactly those three keys: ' + JSON.stringify(u.updates));
    });
    test('THE CONTROL THE BRIEF ASKED FOR: hcp is never written alone on a GHIN round', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '18.4' }));
        const keys = Object.keys(u.updates);
        assert.ok(keys.indexOf('players/0/hcp') > -1, 'hcp is written');
        assert.ok(keys.indexOf('players/0/handicapIndex') > -1, 'and never without the Index it came from: ' + JSON.stringify(keys));
        assert.ok(keys.indexOf('players/0/courseHandicap') > -1, 'nor without the Course Handicap: ' + JSON.stringify(keys));
    });
    test('and the roster it would leave carries all three on that golfer', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '18.4' }));
        const ann = u.after.players[0];
        assert.equal(ann.handicapIndex, '18.4');
        assert.equal(ann.hcp, '23');
        assert.ok(Math.abs(ann.courseHandicap - COURSE_184) < 1e-9);
    });
    test('a golfer with NO index (Cal, legacy): the typed number is read as an Index and converted', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 2: '18' }));
        assert.equal(u.updates['players/2/handicapIndex'], '18');
        assert.equal(u.updates['players/2/hcp'], '22');
        assert.ok(Math.abs(u.updates['players/2/courseHandicap'] - COURSE_18) < 1e-9);
    });
    test('the SAME index typed back is not a change - no write at all', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '18' }));
        assert.equal(u.changed, false, 'nothing changed: ' + JSON.stringify(u.updates));
        assert.deepEqual(u.updates, {});
    });
    test('an AS-ENTERED round writes hcp and NOTHING else', () => {
        const data = round({ handicapBasis: 'as-entered' });
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '19' }));
        assert.deepEqual(u.updates, { 'players/0/hcp': '19' }, JSON.stringify(u.updates));
    });
    test('GHIN with NO TEE RATING: the Index is stored, hcp takes the typed number, and it is marked unconverted', () => {
        const data = round({ teeRating: null });
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '18.4' }));
        assert.equal(u.updates['players/0/handicapIndex'], '18.4');
        assert.equal(u.updates['players/0/hcp'], '18.4', 'the typed number stands');
        assert.equal(u.updates['players/0/handicapUnconverted'], true);
        assert.equal(u.updates['players/0/courseHandicap'], null, 'and any stale Course Handicap is deleted, not left to lie');
    });
    test('an emptied box clears the golfer\'s handicap and its derived keys', () => {
        const data = round();
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, { 0: '' }));
        assert.equal(u.updates['players/0/hcp'], '');
        assert.equal(u.updates['players/0/handicapIndex'], null);
        assert.equal(u.updates['players/0/courseHandicap'], null);
    });
});

// ---------------------------------------------------------------------------
describe('4. A GOLFER ADDED FROM THE SHEET IS CONVERTED THE SAME WAY', () => {
    test('GHIN: the new golfer carries index, course and hcp', () => {
        const data = round();
        const sb = page(data);
        const draft = draftFromSheet(sb, data, {}, [{ group: 1, name: 'Ivy', hcp: '18' }]);
        assert.equal(draft.added.length, 1, 'the sheet collected the addition: ' + JSON.stringify(draft.added));
        const u = build(sb, draft);
        assert.equal(u.whole, true, 'an addition writes the whole roster');
        const ivy = u.after.players.find(p => p.name === 'Ivy');
        assert.ok(ivy, 'Ivy is on the roster: ' + JSON.stringify(u.after.players.map(p => p.name)));
        assert.equal(ivy.handicapIndex, '18');
        assert.equal(ivy.hcp, '22');
        assert.ok(Math.abs(ivy.courseHandicap - COURSE_18) < 1e-9, 'course: ' + ivy.courseHandicap);
    });
    test('AS ENTERED: the new golfer carries the typed number as hcp and no Index', () => {
        const data = round({ handicapBasis: 'as-entered' });
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, {}, [{ group: 1, name: 'Ivy', hcp: '18' }]));
        const ivy = u.after.players.find(p => p.name === 'Ivy');
        assert.equal(ivy.hcp, '18');
        assert.ok(!('handicapIndex' in ivy), JSON.stringify(ivy));
        assert.ok(!('courseHandicap' in ivy), JSON.stringify(ivy));
    });
    test('GHIN with no tee rating: the new golfer keeps the typed number and is marked unconverted', () => {
        const data = round({ teeRating: null });
        const sb = page(data);
        const u = build(sb, draftFromSheet(sb, data, {}, [{ group: 1, name: 'Ivy', hcp: '18' }]));
        const ivy = u.after.players.find(p => p.name === 'Ivy');
        assert.equal(ivy.hcp, '18');
        assert.equal(ivy.handicapIndex, '18');
        assert.equal(ivy.handicapUnconverted, true);
    });
});

// ---------------------------------------------------------------------------
describe('5. THROUGH THE SHEET\'S OWN SAVE PATH, to the write', () => {
    test('the write carries the three keys, with update(), after the re-read matched', async () => {
        const data = round();
        const sb = page(data);
        run(sb, 'psSnapshot = rosterSignature(currentData.players);');
        sb.__draft = draftFromSheet(sb, data, { 0: '18.4' });
        const result = await run(sb, 'commitPlayersDraft(__draft)');
        assert.equal(result, 'written', 'the commit went through');
        const w = J(sb.__dbWrites).filter(x => x.path === 'events/PSI1');
        assert.equal(w.length, 1);
        assert.equal(w[0].op, 'update');
        assert.deepEqual(Object.keys(w[0].value).sort(),
            ['players/0/courseHandicap', 'players/0/handicapIndex', 'players/0/hcp'], JSON.stringify(w[0].value));
        assert.equal(w[0].value['players/0/hcp'], '23');
        assert.equal(w[0].value['players/0/handicapIndex'], '18.4');
    });
    test('SAVE IS WHAT THE BUTTON CALLS, so the path above is the golfer\'s tap', () => {
        const html = read('index.html');
        const m = html.match(/<button[^>]*id="players-sheet-save"[^>]*onclick="([^"]+)"/);
        assert.ok(m, 'the save button is still #players-sheet-save with an inline onclick');
        assert.match(m[1], /savePlayersSheet\(\)/);
        // and savePlayersSheet is what reaches commitPlayersDraft.
        const at = html.indexOf('function savePlayersSheet(');
        assert.match(html.slice(at, at + 400), /commitPlayersDraft\(draft\)/);
    });
});

// ---------------------------------------------------------------------------
describe('6. THE NOTE THAT MOVES AS THEY TYPE', () => {
    const L = loadJsFile('handicap-labels.js', ['handicap.js']);
    const G = round();
    test('the builder: a typed index gives the Course number and what it plays off', () => {
        assert.match(L.handicapBoxNote('18', G, null), /^Course 22\.27 · plays 22$/);
        assert.match(L.handicapBoxNote('4.5', G, null), /^Course 6\.62 · plays 7$/);
        assert.match(L.handicapBoxNote('18.4', G, null), /^Course 22\.73 · plays 23$/);
    });
    test('an emptied box has no note, so no stale Course number can stand', () => {
        assert.equal(L.handicapBoxNote('', G, null), null);
        assert.equal(L.handicapBoxNote(null, G, null), null);
    });
    test('no tee rating: it says so instead of a number', () => {
        assert.equal(L.handicapBoxNote('18', round({ teeRating: null }), null), 'No tee rating \u2014 used as entered');
    });
    test('an AS-ENTERED round has no note at all - the box is already the playing handicap', () => {
        assert.equal(L.handicapBoxNote('18', round({ handicapBasis: 'as-entered' }), null), null);
        const sb = page(round({ handicapBasis: 'as-entered' }));
        assert.deepEqual(notes(sb), [null, null, null, null], JSON.stringify(notes(sb)));
    });
    test('a golfer with no COMPLETED conversion is told what to do rather than promised a number', () => {
        // Dee: index 12, handicapUnconverted, and this round's tee IS rated. Her
        // box is untouched, so the save will not rewrite her - a note reading
        // "Course 15.31" would promise exactly what the save declines to do.
        const dee = G.players[3];
        assert.equal(L.handicapBoxNote('12', G, dee), 'Not yet converted — retype to convert', 'Dee');
        assert.equal(L.handicapBoxNote('9', G, G.players[2]), 'Not yet converted — retype to convert', 'Cal, who has no stored index at all');
        // And once it IS retyped, the derived number appears.
        assert.match(L.handicapBoxNote('12.5', G, dee), /^Course 15\.89 · plays 16$/);
        assert.match(L.handicapBoxNote('9.5', G, G.players[2]), /^Course 12\.41 · plays 12$/);
        // A golfer WITH a completed conversion is described, not nagged.
        assert.match(L.handicapBoxNote('18', G, G.players[0]), /^Course 22\.27 · plays 22$/);
    });
    test('THE WIRE: every box the sheet renders carries the oninput that moves it', () => {
        const html = sheetHtml(page(round()));
        const boxes = rowsOf(html).map(r => /class="ps-hcp"[^>]*oninput="psHcpBoxInput\(this\)"/.test(r));
        assert.equal(boxes.length, 4);
        assert.deepEqual(boxes, [true, true, true, true], 'every row is wired: ' + JSON.stringify(boxes));
        // and a golfer ADDED from the sheet gets a wired box too.
        assert.match(read('index.html').slice(read('index.html').indexOf('function psAddRow')), /class="ps-hcp"[\s\S]{0,200}?oninput="psHcpBoxInput\(this\)"/);
    });
});
