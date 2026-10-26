// ============================================================================
// 082 (2026-10-26): THE LEADERBOARD'S GROUPS ARE THE ROUND'S PAIRINGS
//
// On live round UCWZ8T the round held the real pairings - the players list in
// order plus groupSizeOverrides [4, 4, 3, 4, 3] - but the leaderboard's Groups
// view sliced the STANDINGS (sorted by score) at those positions, so "Group 1"
// was the four best scores and the groups reshuffled with every score.
//
//   1. Each group is the golfers the round put in it (players list + saved
//      sizes), ranked inside the group. Net and gross. 4/4/3/4/3.
//   2. The Groups button shows only when the round SAVED its group sizes
//      (grouping.js groupsWereSet). Game Day's automatic sizes count as set
//      (Manny). More than 4 golfers and nothing saved: hidden, All shown.
//   3. "+ New group" in the in-round Players sheet: a new last group a move or
//      an add can fill, written through the existing guarded whole write
//      (players + groupSizeOverrides). Left empty, nothing is written.
//
// Names are made up; the shape (18 golfers, 4/4/3/4/3, flights on) is UCWZ8T's.
// NEGATIVE CONTROL: run against origin/main 99748dd0, the group-membership and
// hidden-button cases fail (the standings were sliced; the button always showed).
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const NAMES = ['Abe', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gil', 'Hy', 'Ike', 'Jo', 'Kip', 'Lu', 'Mo', 'Ned', 'Oz', 'Pia', 'Quin', 'Roy'];
const HCPS = [2, 4, 9, 4, 3, 6, 5, 3, 12, 6, 6, 14, 13, 13, 9, 14, 13, 10];
const FL = HCPS.map(h => (h >= 9 ? 'B' : 'A'));
const SIZES = [4, 4, 3, 4, 3];

// Scores that put the field in an order that has nothing to do with the list:
// golfer i shoots par + ((i * 7) % 18 - 3) on hole 1 and par elsewhere, thru 9.
function scoresFor(players, thru) {
    const s = {};
    players.forEach((p, i) => CD.slice(0, thru || 9).forEach(h => {
        s[`p${p.id}_h${h.hole}`] = h.hole === 1 ? h.par + ((i * 7) % 18 - 3) : h.par;
    }));
    return s;
}
function ucwz(extra) {
    const players = makePlayers(NAMES, HCPS, 102, FL);
    return Object.assign({ eventName: 'Single Round', players, courseData: CD, scores: scoresFor(players), gameFormat: 'stroke',
        settlementMode: 'whole-dollar', handicapBasis: 'as-entered',
        flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' },
        groupSizeOverrides: SIZES.slice() }, extra || {});
}
// the expected groups: the players list cut 4/4/3/4/3
const EXPECTED = (() => { const out = []; let i = 0; SIZES.forEach(n => { out.push(NAMES.slice(i, i + n)); i += n; }); return out; })();

function board(data, opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = J(data);
    vm.runInContext(`currentMode = 'UC1'; currentBoardData = __d; activeView = 'individual'; activeScoring = '${o.scoring || 'net'}';`
        + (o.mode ? ` groupViewMode = '${o.mode}'; groupViewChosen = true;` : '')
        + ` renderBoard();`, sb);
    const id = x => sb.document.getElementById(x);
    const html = String(id('board-content').innerHTML || '');
    const byId = {}; data.players.forEach(p => { byId[String(p.id)] = p.name; });
    // each "👥 Group N" section -> the golfers' names, in the order the board shows them
    const sections = html.split('👥 Group ').slice(1).map(chunk => {
        const n = parseInt(chunk, 10);
        const ids = (chunk.match(/data-player-id="([^"]+)"/g) || []).map(m => m.slice(16, -1));
        return { n, names: ids.filter((x, i) => ids.indexOf(x) === i).map(x => byId[x]) };
    });
    return { sb, html, sections, pillGroup: id('pill-group-view').style.display, pillAll: id('pill-all-view').style.display,
        pillFlight: id('pill-flight-view').style.display, mode: vm.runInContext('groupViewMode', sb) };
}
const sorted = a => a.slice().sort();

describe('1. THE GROUPS VIEW IS THE ROUND\'S PAIRINGS (players list + saved sizes)', () => {
    for (const scoring of ['net', 'gross']) {
        test(`${scoring}: five groups 4/4/3/4/3, each exactly the golfers the round put in it`, () => {
            const r = board(ucwz(), { mode: 'group', scoring });
            assert.equal(r.mode, 'group');
            assert.deepEqual(r.sections.map(s => s.n), [1, 2, 3, 4, 5]);
            assert.deepEqual(r.sections.map(s => s.names.length), SIZES);
            r.sections.forEach((s, i) => assert.deepEqual(sorted(s.names), sorted(EXPECTED[i]), 'group ' + s.n));
        });
    }
    test('the fixture really scrambles the order: the standings cut 4/4/3/4/3 are NOT the pairings (so case 1 can fail)', () => {
        const r = board(ucwz(), { mode: 'all' });
        const order = (r.html.match(/data-player-id="([^"]+)"/g) || []).map(m => m.slice(16, -1)).filter((x, i, a) => a.indexOf(x) === i);
        const names = order.map(x => NAMES[Number(x) - 102]);
        assert.notDeepEqual(sorted(names.slice(0, 4)), sorted(EXPECTED[0]));
    });
    test('inside a group, golfers are ranked by score (net), not listed in roster order', () => {
        const d = ucwz();
        const r = board(d, { mode: 'group' });
        const g1 = r.sections[0].names;
        const toPar = n => { const i = NAMES.indexOf(n); return ((i * 7) % 18 - 3) - HCPS[i] / 2; };   // monotone with the net order on 9 holes
        const ranks = g1.map(toPar);
        assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b));
    });
    test('the groups do not change when a score changes (they used to reshuffle)', () => {
        const d = ucwz();
        d.scores['p102_h2'] = 9;   // the first golfer drops down the board
        const r = board(d, { mode: 'group' });
        r.sections.forEach((s, i) => assert.deepEqual(sorted(s.names), sorted(EXPECTED[i])));
    });
    test('saved sizes stored as an object (not an array) group the same way', () => {
        const r = board(ucwz({ groupSizeOverrides: { 0: 4, 1: 4, 2: 3, 3: 4, 4: 3 } }), { mode: 'group' });
        r.sections.forEach((s, i) => assert.deepEqual(sorted(s.names), sorted(EXPECTED[i])));
    });
    test('unflighted round: the same groups', () => {
        const r = board(ucwz({ flights: null }), { mode: 'group' });
        r.sections.forEach((s, i) => assert.deepEqual(sorted(s.names), sorted(EXPECTED[i])));
    });
});

describe('2. THE GROUPS BUTTON ONLY WHEN GROUPS WERE SET', () => {
    test('saved sizes (UCWZ8T): Groups shows, beside All and Flights', () => {
        const r = board(ucwz());
        assert.equal(r.pillGroup, ''); assert.equal(r.pillAll, ''); assert.equal(r.pillFlight, '');
    });
    test('more than 4 golfers and NO saved sizes: Groups hidden, All shown; a Groups choice falls back', () => {
        const d = ucwz(); delete d.groupSizeOverrides; d.flights = null;
        const r = board(d);
        assert.equal(r.pillGroup, 'none'); assert.equal(r.pillAll, '');
        assert.equal(r.sections.length, 0, 'no group cards');
        const chose = board(d, { mode: 'group' });
        assert.equal(chose.mode, 'all'); assert.equal(chose.pillGroup, 'none'); assert.equal(chose.sections.length, 0);
    });
    test('8 golfers, no saved sizes (the old 4/4 auto split): hidden too', () => {
        const d = ucwz(); delete d.groupSizeOverrides; d.flights = null; d.players = d.players.slice(0, 8);
        const r = board(d);
        assert.equal(r.pillGroup, 'none');
    });
    test('flighted, no saved sizes: Groups hidden, Flights and All still there', () => {
        const d = ucwz(); delete d.groupSizeOverrides;
        const r = board(d, { mode: 'group' });
        assert.equal(r.pillGroup, 'none'); assert.equal(r.pillFlight, ''); assert.equal(r.pillAll, '');
        assert.notEqual(r.mode, 'group');
    });
    test('GAME DAY\'S AUTOMATIC SIZES COUNT AS SET (admin.html writes 4 per group for "eight" / "big")', () => {
        const d = ucwz({ flights: null }); d.players = d.players.slice(0, 8); d.groupSizeOverrides = { 0: 4, 1: 4 };
        const r = board(d, { mode: 'group' });
        assert.equal(r.pillGroup, '');
        assert.deepEqual(r.sections.map(s => sorted(s.names)), [sorted(NAMES.slice(0, 4)), sorted(NAMES.slice(4, 8))]);
    });
    test('a single foursome: no Groups button (as before)', () => {
        const d = ucwz({ flights: null, groupSizeOverrides: { 0: 4 } }); d.players = d.players.slice(0, 4);
        assert.equal(board(d).pillGroup, 'none');
    });
    test('groupsWereSet: array, object, empty, zeros, junk', () => {
        const G = loadJsFile('grouping.js');
        const f = x => vm.runInContext('groupsWereSet(' + JSON.stringify(x) + ')', G);
        assert.equal(f([4, 4, 3, 4, 3]), true);
        assert.equal(f({ 0: 4, 1: 4 }), true);
        assert.equal(f({ 3: 5 }), true);
        assert.equal(f({}), false); assert.equal(f(null), false); assert.equal(f([]), false);
        assert.equal(f({ 0: 0 }), false); assert.equal(f({ 0: 'x' }), false);
    });
});

// ---------------------------------------------------------------------------
// 3. "+ NEW GROUP" - the Players sheet's builder (buildPlayersUpdate), the same
// harness players_sheet_test.js uses.
function page(data) {
    const sb = loadHtmlInlineScript('index.html', [], { search: '?game=ng1', beforeRun(sandbox) {
        const realDatabase = sandbox.firebase.database;
        sandbox.firebase.database = Object.assign(function () { const dbi = realDatabase(); const o = dbi.ref.bind(dbi);
            dbi.ref = (p) => { const r = o(p); if (p === 'events/NG1') r.once = () => Promise.resolve({ val: () => J(data), exists: () => true }); return r; }; return dbi; }, realDatabase);
    } });
    vm.runInContext("['players-sheet', 'players-sheet-body', 'players-sheet-money', 'players-sheet-warn'].forEach(function (id) { var e = document.getElementById(id); if (e) document.__mount(e); }); window.__alerts = []; alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert; navigator.onLine = true;", sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/NG1');
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
const buildU = (sb, draft) => J(vm.runInContext('buildPlayersUpdate(currentData, ' + JSON.stringify(draft) + ')', sb));
function draft(data, changes, added, newGroups) {
    const G = loadJsFile('grouping.js');
    G.__p = J(data.players); G.__o = J(data.groupSizeOverrides || {});
    const m = J(vm.runInContext('playerGroupMap(__p, __o)', G));
    const edits = data.players.map((p, i) => ({ idx: i, name: p.name, hcp: String(p.hcp || ''), flight: p.flight === 'B' ? 'B' : 'A', out: false, group: m[String(p.id)] }));
    (changes || []).forEach(c => Object.assign(edits[c.idx], c));
    return { edits, added: added || [], newGroups: newGroups || 0 };
}
function ngRound() { const d = ucwz(); d.ownerUid = 'anon-stub'; d.scores = {}; return d; }

describe('3. "+ NEW GROUP" IN THE PLAYERS SHEET', () => {
    test('a golfer moved into the new group 6: sizes 4/4/3/4/2/1, he is last, everyone else where they were; one whole write', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [{ idx: 17, group: 6 }], [], 1));
        assert.equal(u.refused, null); assert.equal(u.whole, true);
        assert.deepEqual(Object.keys(u.updates).sort(), ['groupSizeOverrides', 'players']);
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 4, 1: 4, 2: 3, 3: 4, 4: 2, 5: 1 });
        assert.deepEqual(u.updates.players.map(p => p.name), NAMES, 'the last golfer of group 5 is already last; order unchanged');
    });
    test('a golfer from group 1 moved into the new group: he goes to the end, groups 2-5 keep their golfers', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [{ idx: 0, group: 6 }], [], 1));
        assert.equal(u.refused, null);
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 3, 1: 4, 2: 3, 3: 4, 4: 3, 5: 1 });
        assert.deepEqual(u.updates.players.map(p => p.name), NAMES.slice(1).concat([NAMES[0]]));
    });
    test('a new golfer added into the new group: 4/4/3/4/3/1 and a fresh id', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [], [{ group: 6, name: 'Newt', hcp: '7', flight: 'A' }], 1));
        assert.equal(u.refused, null);
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 4, 1: 4, 2: 3, 3: 4, 4: 3, 5: 1 });
        const last = u.updates.players[u.updates.players.length - 1];
        assert.equal(last.name, 'Newt'); assert.equal(last.id, 120);
    });
    test('the new group left EMPTY: nothing changes, nothing written', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [], [], 1));
        assert.equal(u.changed, false); assert.equal(u.whole, false); assert.deepEqual(u.updates, {});
    });
    test('the new group left empty while a golfer moves between old groups: written as before, no 6th group', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [{ idx: 0, group: 3 }], [], 1));
        assert.equal(u.refused, null);
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 3, 1: 4, 2: 4, 3: 4, 4: 3 });
    });
    test('emptying group 5 into the new group 6 is refused (an empty group in the middle would renumber the links) - the existing rule', () => {
        const d = ngRound(); const sb = page(d);
        const u = buildU(sb, draft(d, [{ idx: 15, group: 6 }, { idx: 16, group: 6 }, { idx: 17, group: 6 }], [], 1));
        assert.match(String(u.refused), /Group 5 would be empty/);
    });
    test('the commit: the same guarded write path (re-read, then one update of players + groupSizeOverrides)', async () => {
        const d = ngRound(); const sb = page(d);
        vm.runInContext("psSnapshot = rosterSignature(currentData.players);", sb);
        const res = await vm.runInContext('commitPlayersDraft(' + JSON.stringify(draft(d, [{ idx: 0, group: 6 }], [], 1)) + ')', sb);
        assert.equal(res, 'written');
        const w = J(sb.__dbWrites).filter(x => x.path === 'events/NG1' && x.op === 'update');
        assert.equal(w.length, 1);
        assert.deepEqual(Object.keys(w[0].value).sort(), ['groupSizeOverrides', 'players']);
        assert.deepEqual(w[0].value.groupSizeOverrides, { 0: 3, 1: 4, 2: 3, 3: 4, 4: 3, 5: 1 });
    });
    test('the sheet: a "+ New group" button under the groups; a tap adds "Group 6 (new)" and G6 to every selector, once', () => {
        const d = ngRound(); const sb = page(d);
        vm.runInContext("canReachSetup = function () { return true; }; openPlayersSheet();", sb);
        const html = String(vm.runInContext("document.getElementById('players-sheet-body').innerHTML", sb));
        assert.match(html, /id="ps-new-group"[^>]*>\+ New group<\/button>/);
        assert.equal(vm.runInContext('psNewGroups', sb), 0);
        vm.runInContext('psAddNewGroup(); psAddNewGroup();', sb);
        assert.equal(vm.runInContext('psNewGroups', sb), 1, 'one new group per opening');
        assert.equal(vm.runInContext('collectPlayersSheet().newGroups', sb), 1);
        vm.runInContext('closePlayersSheet(); openPlayersSheet();', sb);
        assert.equal(vm.runInContext('psNewGroups', sb), 0, 'reopening starts clean');
    });
});

// ---------------------------------------------------------------------------
// CHROME: real taps on the organizer's sheet - "+ New group", "+ Add golfer"
// in it, type a name, Save. The recorded write is players + groupSizeOverrides.
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
describe('CHROME: real taps - + New group, add a golfer there, Save', () => {
    const d = ngRound(); d.ownerUid = 'anon-cold'; d.scores = scoresFor(d.players, 2);
    const DB = { events: { NG1: d }, global_courses: {}, trips: {}, tournaments: {} };
    let r;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=NG1'), db: DB, settleMs: 4000, steps: [
            { tap: '#group-pick-overlay [data-role="watching"]', nth: 0 }, { sleep: 250 },
            { tap: '#round-sheet-handle', nth: 0 }, { sleep: 500 },
            { tap: '.group-setup-btn', nth: 1 }, { sleep: 250 },
            { expression: "'OPEN:' + getComputedStyle(document.getElementById('players-sheet')).display" },
            { tap: '#ps-new-group', nth: 0 }, { sleep: 200 },
            { expression: "'HEAD:' + Array.prototype.map.call(document.querySelectorAll('#players-sheet-body .ps-group span'), function (s) { return s.innerText; }).join('|')" },
            { expression: "'OPTS:' + Array.prototype.map.call(document.querySelectorAll('#players-sheet-body .ps-row[data-idx=\"0\"] .ps-grp option'), function (o) { return o.value; }).join(',')" },
            { expression: "'BTN:' + getComputedStyle(document.getElementById('ps-new-group')).display" },
            { tap: '#players-sheet-body .ps-group-new .ps-add', nth: 0 }, { sleep: 200 },
            { tap: '#ps-adds-6 .ps-name', nth: 0 }, { sleep: 100 },
            { cdp: { method: 'Input.insertText', params: { text: 'Newt' } } }, { sleep: 150 },
            { tap: '#players-sheet-save', nth: 0 }, { sleep: 700 },
            { expression: "'W:' + JSON.stringify(window.__coldWrites.filter(function (w) { return w.path === 'events/NG1' && w.op === 'update'; }).map(function (w) { return { keys: Object.keys(w.value).sort(), sizes: w.value.groupSizeOverrides, last: (w.value.players || []).slice(-1).map(function (p) { return p.name; }) }; }))" },
            { expression: "'CLOSED:' + getComputedStyle(document.getElementById('players-sheet')).display" }
        ] });
    });
    const v = tag => { const hit = (r.value || []).find(x => typeof x === 'string' && x.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 800)); return hit.slice(tag.length + 1); };
    test('ran; the tap added "Group 6 (new)", G6 in the selectors, and hid the button', () => {
        assert.ok(r && r.ok, r && r.reason);
        assert.equal(v('OPEN'), 'flex');
        assert.match(v('HEAD'), /Group 5\|Group 6 \(new\)$/i);
        assert.equal(v('OPTS'), '1,2,3,4,5,6');
        assert.equal(v('BTN'), 'none');
    });
    test('Save wrote ONE update: players + groupSizeOverrides, Newt last, sizes 4/4/3/4/3/1; the sheet closed', () => {
        const w = JSON.parse(v('W'));
        assert.equal(w.length, 1);
        assert.deepEqual(w[0].keys, ['groupSizeOverrides', 'players']);
        assert.deepEqual(w[0].sizes, { 0: 4, 1: 4, 2: 3, 3: 4, 4: 3, 5: 1 });
        assert.deepEqual(w[0].last, ['Newt']);
        assert.equal(v('CLOSED'), 'none');
    });
});
