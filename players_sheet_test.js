// ============================================================================
// THE PLAYERS SHEET (2026-09-22, v195) — organizer only, from the scorecard
//
// Rename / handicap / flight / Out, and a golfer added to a group, without the
// wizard. WHAT IT WRITES (index.html buildPlayersUpdate, commitPlayersDraft):
//   narrow edits -> ONE update of the changed keys only (players/<i>/name,
//   /hcp, /flight, /playingForMoney + /out). Never the whole array.
//   an added golfer -> the whole players node + groupSizeOverrides in ONE
//   atomic update, guarded: events/CODE is re-read first and the write refused
//   when the roster's ids/names differ from what the sheet displayed.
// Out keeps his scores (keyed by id, never touched) and drops him from the pot
// and every field payout: pool-engine.js and settlement-engine.js already read
// playingForMoney - the engine numbers are asserted against a round without
// him. New id = max(roster ids, score-key ids) + 1. The money line reads
// "Pot $920 → $880 · Flight B 11 → 10" (+ the recompute note once any score is
// in). The KP warning names a leader being marked Out.
// Non-organizers see no pill and cannot open the sheet.
//
// mini-dom: the sheet's inputs are strings once rendered, so the DRAFT (what
// collectPlayersSheet reads off real inputs) is handed to the builder and the
// commit directly; the Chrome case below taps the real thing.
// ============================================================================

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
const CD = makeCourseData(18);

// 23 golfers, 12 A / 11 B, $20 in, KP $40, net $200, skins the rest; thru 9,
// with an orphaned score under id 900 (a roster rebuilt once already).
function round(o) {
    const r = wizardSavedRound({ code: 'PS1', courseData: CD, thru: (o && o.thru !== undefined) ? o.thru : 9, ownerUid: 'anon-stub',
        overrides: { additionalGames: {}, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' } } });
    r.scores['p900_h1'] = 4;
    r.kpLeaders = { h3: { playerId: String(r.players[9].id), playerName: r.players[9].name, group: 3, distanceInches: 60, updatedAt: 1 } };
    r.kpWinners = { h3: String(r.players[9].id) };
    return r;
}
function page(data, search, opts) {
    const sb = loadHtmlInlineScript('index.html', [], { search: search || '?game=ps1', beforeRun(sandbox) {
        const realDatabase = sandbox.firebase.database;
        sandbox.firebase.database = Object.assign(function () { const dbi = realDatabase(); const o = dbi.ref.bind(dbi);
            dbi.ref = (p) => { const r = o(p); if (p === 'events/PS1') r.once = () => Promise.resolve({ val: () => J((opts && opts.fresh) || sandbox.__fresh || data), exists: () => true }); return r; }; return dbi; }, realDatabase);
    } });
    run(sb, "['players-sheet', 'players-sheet-body', 'players-sheet-money', 'players-sheet-warn', 'group-filter-container', 'game-setup-mount'].forEach(function (id) { var e = document.getElementById(id); if (e) document.__mount(e); }); window.__alerts = []; alert = function (m) { window.__alerts.push(String(m)); }; navigator.onLine = true;");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/PS1');
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
const build = (sb, draft) => J(run(sb, 'buildPlayersUpdate(currentData, ' + JSON.stringify(draft) + ')'));
const edit = (idx, fields) => Object.assign({ idx, name: '', hcp: undefined, flight: undefined, out: false }, fields);
// a draft from the record: every golfer as shown, then the changes
function draftFrom(data, changes, added) {
    const edits = data.players.map((p, i) => ({ idx: i, name: p.name, hcp: String(p.hcp || ''), flight: p.flight === 'B' ? 'B' : 'A', out: p.out === true }));
    (changes || []).forEach(c => Object.assign(edits[c.idx], c));
    return { edits, added: added || [] };
}
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const pool = d => { ENG.__d = J(d); return J(run(ENG, 'computeMoneyPool(__d, __d.courseData, __d.scores)')); };

describe('THE NARROW WRITES: rename, handicap, flight, Out - only the changed keys', () => {
    const data = round();
    test('a rename ("Anthony." cleaned) writes players/1/name and nothing else', async () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [{ idx: 1, name: 'Ben B' }]));
        assert.equal(u.changed, true); assert.equal(u.whole, false);
        assert.deepEqual(u.updates, { 'players/1/name': 'Ben B' });
    });
    test('handicap and flight on two golfers: four keys, by index; nothing for the untouched', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [{ idx: 0, hcp: '7.5' }, { idx: 12, flight: 'A', hcp: '10' }]));
        assert.deepEqual(u.updates, { 'players/0/hcp': '7.5', 'players/12/flight': 'A', 'players/12/hcp': '10' });
        assert.ok(!Object.keys(u.updates).some(k => k === 'players'), 'CONTROL: never the whole array for a narrow edit');
    });
    test('nothing changed: no write', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data));
        assert.equal(u.changed, false); assert.deepEqual(u.updates, {});
    });
    test('an emptied name is not a rename; the same dots typed back are not a change', () => {
        const sb = page(data);
        assert.deepEqual(build(sb, draftFrom(data, [{ idx: 2, name: '' }])).updates, {});
    });
    test('OUT: playingForMoney false + out true; back in: true + null (the key is removed)', () => {
        const sb = page(data);
        assert.deepEqual(build(sb, draftFrom(data, [{ idx: 5, out: true }])).updates, { 'players/5/playingForMoney': false, 'players/5/out': true });
        const outData = J(data); outData.players[5].out = true; outData.players[5].playingForMoney = false;
        const sb2 = page(outData);
        assert.deepEqual(build(sb2, draftFrom(outData, [{ idx: 5, out: false }])).updates, { 'players/5/playingForMoney': true, 'players/5/out': null });
    });
    test('the commit writes exactly those keys with update(), after a re-read that matched', async () => {
        const sb = page(data);
        run(sb, 'psSnapshot = rosterSignature(currentData.players)');
        sb.__draft = draftFrom(data, [{ idx: 1, name: 'Ben B' }, { idx: 5, out: true }]);
        const result = await run(sb, 'commitPlayersDraft(__draft)');
        assert.equal(result, 'written');
        const w = J(sb.__dbWrites).filter(x => x.path === 'events/PS1');
        assert.equal(w.length, 1); assert.equal(w[0].op, 'update');
        assert.deepEqual(w[0].value, { 'players/1/name': 'Ben B', 'players/5/playingForMoney': false, 'players/5/out': true });
    });
});

describe('OUT: scores kept, out of the pot and every field payout, the KP warning', () => {
    const data = round();
    test('the engine on the round with Fay Out equals the engine on a round without her - and her scores are still in the record', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [{ idx: 5, out: true }]));
        const after = u.after;
        assert.equal(after.players[5].playingForMoney, false); assert.equal(after.players[5].out, true);
        assert.ok(Object.keys(after.scores).some(k => k.startsWith('p' + data.players[5].id + '_')), 'her scores are still there');
        const without = J(data); without.players.splice(5, 1);
        const a = pool(after), b = pool(without);
        assert.equal(a.totalPoolCents, b.totalPoolCents); assert.equal(a.totalPoolCents, 22 * 2000);
        assert.deepEqual(a.participants.map(p => p.id), b.participants.map(p => p.id), 'the same 22 in the pool');
        assert.deepEqual(a.skins.flights.map(f => [f.flight, f.golfers, f.amountCents]), b.skins.flights.map(f => [f.flight, f.golfers, f.amountCents]));
        assert.deepEqual(a.net.lines, b.net.lines); assert.deepEqual(a.skins.lines, b.skins.lines);
        assert.equal(a.perPlayerCents[String(data.players[5].id)], undefined, 'nothing paid to or from her');
        // CONTROL: the round with her IN pays a different pot
        assert.equal(pool(data).totalPoolCents, 23 * 2000);
    });
    test('the KP leader marked Out: the warning names him and the hole', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [{ idx: 9, out: true }]));
        assert.deepEqual(u.warnings, ['Jon leads KP on 3 — re-record it after saving']);
        assert.deepEqual(build(sb, draftFrom(data, [{ idx: 8, out: true }])).warnings, [], 'CONTROL: not for a golfer who leads nothing');
        // and the engine HOLDS it once he is out (2026-09-22: never refunded; pool-engine: a winner not in the pool)
        const r = pool(u.after);
        const l = r.kp.lines.find(l => l.hole === 3);
        assert.equal(l.state, 'unresolved'); assert.equal(l.reason, 'out');
        assert.ok(!/KP/.test(r.refund.reasons.join(' ')), 'no KP refund');
    });
    test('the money line: "Pot $460 → $440 · Flight B 11 → 10. Scores are in — net finish and skins will recompute."', () => {
        const sb = page(data);
        assert.equal(build(sb, draftFrom(data, [{ idx: 12, out: true }])).money, 'Pot $460 → $440 · Flight B 11 → 10. Scores are in — net finish and skins will recompute.');
        assert.equal(build(sb, draftFrom(data, [{ idx: 12, flight: 'A' }])).money, 'Pot $460 · Flight A 12 → 13 · Flight B 11 → 10. Scores are in — net finish and skins will recompute.');
        assert.equal(build(sb, draftFrom(data)).money, 'Pot $460', 'nothing moving: the pot alone, no note');
        const fresh = round({ thru: 0 }); delete fresh.scores.p900_h1;
        const sb2 = page(fresh);
        assert.equal(build(sb2, draftFrom(fresh, [{ idx: 12, out: true }])).money, 'Pot $460 → $440 · Flight B 11 → 10', 'no score in yet: no recompute note');
    });
});

describe('ADD A GOLFER TO GROUP N', () => {
    const data = round();   // groups of 4: 6 groups, the last of 3
    test('new id above every roster id AND every id in a score key (CONTROL: a roster-only mint would reuse 900\'s range)', () => {
        const sb = page(data);
        assert.equal(run(sb, 'nextRosterId(currentData)'), 901);
        const rosterOnly = Math.max(...data.players.map(p => p.id)) + 1;
        assert.notEqual(rosterOnly, 901, 'the roster alone says ' + rosterOnly + ' - which a score key already uses');
        assert.ok(Object.keys(data.scores).some(k => k.startsWith('p900_')));
    });
    test('added at the end of group 2: group 2 grows to 5, groups 3-6 keep their golfers by id, sizes written', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [], [{ group: 2, name: 'Zed Zulu', hcp: '9', flight: 'B' }]));
        assert.equal(u.whole, true);
        assert.deepEqual(Object.keys(u.updates).sort(), ['groupSizeOverrides', 'players']);
        const P = u.updates.players;
        assert.equal(P.length, 24);
        assert.deepEqual(P.slice(4, 9).map(p => p.name), [data.players[4].name, data.players[5].name, data.players[6].name, data.players[7].name, 'Zed Zulu']);
        assert.deepEqual(P[8], { id: 901, name: 'Zed Zulu', hcp: '9', team: '', squad: 'red', playingForMoney: true, flight: 'B' });
        assert.deepEqual(P.slice(9).map(p => p.id), data.players.slice(8).map(p => p.id), 'groups 3-6: the same ids in the same order');
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 4, 1: 5, 2: 4, 3: 4, 4: 4, 5: 3 });
        assert.equal(u.money, 'Pot $460 → $480 · Flight B 11 → 12. Scores are in — net finish and skins will recompute.');
    });
    test('two added to different groups, plus a rename in the same save: one whole write carrying all of it', () => {
        const sb = page(data);
        const u = build(sb, draftFrom(data, [{ idx: 0, name: 'Ann A' }], [{ group: 6, name: 'Yul', hcp: '', flight: 'A' }, { group: 1, name: 'Xan', hcp: '4', flight: 'A' }]));
        const P = u.updates.players;
        assert.equal(P.length, 25); assert.equal(P[0].name, 'Ann A');
        assert.equal(P[4].name, 'Xan'); assert.equal(P[4].id, 901);
        assert.equal(P[24].name, 'Yul'); assert.equal(P[24].id, 902);
        assert.deepEqual(u.updates.groupSizeOverrides, { 0: 5, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 });
    });
    test('THE GUARD: the roster changed on another phone -> refused, nothing written (CONTROL: with the same roster it writes)', async () => {
        const sb = page(data);
        run(sb, 'psSnapshot = rosterSignature(currentData.players)');
        const changed = J(data); changed.players.splice(3, 1);   // someone removed a golfer meanwhile
        sb.__fresh = changed;
        sb.__draft = draftFrom(data, [], [{ group: 2, name: 'Zed Zulu', hcp: '9', flight: 'B' }]);
        assert.equal(await run(sb, 'commitPlayersDraft(__draft)'), 'refused');
        assert.equal(J(sb.__dbWrites).filter(x => x.path === 'events/PS1').length, 0, 'nothing written');
        assert.deepEqual(J(run(sb, 'window.__alerts')), ['⚠️ NOT SAVED\nThe roster changed on another phone — reopen Players.']);
        sb.__fresh = null;
        assert.equal(await run(sb, 'commitPlayersDraft(__draft)'), 'written');
        const w = J(sb.__dbWrites).filter(x => x.path === 'events/PS1');
        assert.equal(w.length, 1); assert.equal(w[0].value.players.length, 24);
    });
    test('the guard also covers a rename made elsewhere (ids equal, a name differs)', async () => {
        const sb = page(data);
        run(sb, 'psSnapshot = rosterSignature(currentData.players)');
        const renamed = J(data); renamed.players[0].name = 'Someone Else';
        sb.__fresh = renamed;
        sb.__draft = draftFrom(data, [{ idx: 1, hcp: '3' }]);
        assert.equal(await run(sb, 'commitPlayersDraft(__draft)'), 'refused');
    });
});

describe('WHO SEES IT', () => {
    const data = round();
    test('the organizer\'s bare link: the pill beside Edit round setup; the sheet renders every golfer under group headers', async () => {
        const sb = page(data);
        await tick();
        const strip = String(run(sb, "document.getElementById('group-filter-container').innerHTML"));
        assert.match(strip, /group-setup-btn" onclick="openPlayersSheet\(\)">👥 Players<\/button>/);
        run(sb, 'openPlayersSheet()');
        assert.equal(run(sb, "document.getElementById('players-sheet').style.display"), 'flex');
        const body = String(run(sb, "document.getElementById('players-sheet-body').innerHTML"));
        assert.equal((body.match(/class="ps-group"/g) || []).length, 6);
        assert.equal((body.match(/class="ps-row"/g) || []).length, 23);
        assert.match(body, /<div class="ps-group"><span>Group 2<\/span><button type="button" class="ps-add" onclick="psAddRow\(2\)">\+ Add golfer<\/button><\/div>/);
        assert.match(body, /data-idx="0" data-id="101"[\s\S]*?class="ps-name" type="text" value="Ann Alpha"/);
        assert.match(body, /data-flight="B"/);
        assert.match(String(run(sb, "document.getElementById('players-sheet-money').textContent")), /^Pot \$460$/);
    });
    test('a group link: no pill; openPlayersSheet does nothing (CONTROL)', async () => {
        const sb = page(data, '?game=ps1&group=2');
        await tick();
        assert.doesNotMatch(String(run(sb, "document.getElementById('group-filter-container').innerHTML")), /👥 Players</);
        run(sb, 'openPlayersSheet()');
        assert.notEqual(run(sb, "document.getElementById('players-sheet').style.display"), 'flex');
    });
    test('another device, bare link (a spectator): no pill, no sheet', async () => {
        const other = J(data); other.ownerUid = 'somebody-else';
        const sb = page(other);
        await tick();
        assert.doesNotMatch(String(run(sb, "document.getElementById('group-filter-container').innerHTML")), /👥 Players</);
        run(sb, 'openPlayersSheet()');
        assert.notEqual(run(sb, "document.getElementById('players-sheet').style.display"), 'flex');
    });
    test('the Game tab: the Players pill under Edit round setup, to the scorecard with ?players=1; the scorecard opens the sheet from that link', async () => {
        const g = loadHtmlInlineScript('game.html', [], { search: '?game=ps1' });
        run(g, "document.__mount(document.getElementById('game-setup-mount')); document.__mount(document.getElementById('game-content'))");
        g.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/PS1').cb({ val: () => J(data), exists: () => true });
        await tick();
        assert.match(String(run(g, "document.getElementById('game-setup-mount').innerHTML")), /<a class="game-setup-link" href="index\.html\?game=PS1&players=1">👥 Players<\/a>/);
        const sb = page(data, '?game=ps1&players=1');
        await tick();
        assert.equal(run(sb, "document.getElementById('players-sheet').style.display"), 'flex');
    });
    test('an Out golfer is greyed: the Full Card header, the Hole View row, the Board row (tagged OUT), the Receipt row', async () => {
        const d = J(data); d.players[5].out = true; d.players[5].playingForMoney = false;
        const sb = page(d);
        run(sb, "document.__mount(document.getElementById('table-head-row')); document.__mount(document.getElementById('hole-view-card')); renderScorecard();");
        assert.match(String(run(sb, "document.getElementById('table-head-row').innerHTML")), /<th data-player-name="Fay" class="golfer-out">/);
        // Hole View clones the Full Card's cells - real DOM, which mini-dom has not; the row's class is pinned in source and proven in Chrome below.
        assert.match(read('index.html'), /<div class="hv-player-row\$\{hvPlayer && hvPlayer\.out === true \? ' golfer-out' : ''\}">/);
        const lb = loadHtmlInlineScript('leaderboard.html', [], { search: '?game=ps1' });
        lb.__dbHandlers.filter(h => h.event === 'value' && /events\/PS1$/.test(h.path)).forEach(h => h.cb({ val: () => J(d), exists: () => true }));
        const board = String(run(lb, "document.getElementById('board-content').innerHTML"));
        assert.match(board, /<tr class="[^"]*golfer-out"[^>]*data-player-id="106">[\s\S]*?Fay Foxtrot[\s\S]*?<span class="gap-flag">OUT<\/span>/);
        const st = loadHtmlInlineScript('settlement.html');
        st.__d = J(d);
        run(st, 'currentMode = "PS1"; currentData = __d; document.__mount(document.getElementById("receipt-scorecard")); renderReceiptScorecard(__d, __d.courseData, __d.scores);');
        assert.match(String(run(st, "document.getElementById('receipt-scorecard').innerHTML")), /<tr class="golfer-out"><td class="rt-name">Fay Foxtrot<\/td>/);
    });
});

describe('THE SEAMS', () => {
    test('scores are never in a Players-sheet write; no protected engine changed for Out (playingForMoney is what they read)', () => {
        const src = read('index.html');
        const seg = src.slice(src.indexOf('function buildPlayersUpdate('), src.indexOf('function savePlayersSheet('));
        assert.doesNotMatch(seg, /'scores|scores\//);
        assert.match(seg, /db\.ref\('events\/' \+ currentMode\)\.once\('value'\)/, 'the re-read');
        assert.match(seg, /rosterSignature\(fresh\.players\) !== psSnapshot/, 'the guard');
        assert.match(read('pool-engine.js'), /players\.filter\(p => p\.playingForMoney !== false\)/);
    });
});

// ---------------------------------------------------------------------------
// CHROME, cold arrival (390x844), the organizer's bare link (ownerUid = the
// cold uid): a REAL tap on 👥 Players opens the sheet; a real tap on Fay's Out
// box; the money line moves; a real tap on Save writes the two narrow keys
// (recorded by the cold stand-in), the sheet closes; a delivered snapshot with
// her Out greys her Hole View row. No page function is called.
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
describe('CHROME: real taps - open the sheet, mark Out, Save', () => {
    const d = round();
    d.ownerUid = 'anon-cold';
    const DB = { events: { PS1: d }, global_courses: {}, trips: {}, tournaments: {} };
    const after = J(d); after.players[5].out = true; after.players[5].playingForMoney = false;
    let r;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=PS1'), db: DB, settleMs: 4000, steps: [
            // the bare link on a multi-group round asks which group first (the picker); the organizer taps Just watching
            { tap: '#group-pick-overlay .btn-outline', nth: 0 }, { sleep: 250 },
            { expression: "'PICK:' + getComputedStyle(document.getElementById('group-pick-overlay')).display" },
            { tap: '.group-setup-btn', nth: 1 }, { sleep: 250 },
            { expression: "'OPEN:' + getComputedStyle(document.getElementById('players-sheet')).display" },
            { expression: "'ROWS:' + document.querySelectorAll('#players-sheet-body .ps-row').length" },
            { expression: "'M0:' + document.getElementById('players-sheet-money').innerText" },
            { tap: '#players-sheet-body .ps-row[data-idx="5"] .ps-out-box', nth: 0 }, { sleep: 200 },
            { expression: "'M1:' + document.getElementById('players-sheet-money').innerText" },
            { expression: "'ROW:' + (function () { var e = document.querySelector('#players-sheet-body .ps-row[data-idx=\"5\"]'); return e ? e.className : 'no row'; })()" },
            { tap: '#players-sheet-save', nth: 0 }, { sleep: 500 },
            { expression: "'W:' + JSON.stringify(window.__coldWrites.filter(function (w) { return w.path === 'events/PS1' && w.op === 'update'; }))" },
            { expression: "'CLOSED:' + getComputedStyle(document.getElementById('players-sheet')).display" },
            { deliver: { path: 'events/PS1', value: after } }, { sleep: 250 },
            { expression: "'HV:' + (function () { var rows = Array.from(document.querySelectorAll('#hole-view-card .hv-player-row')); var fay = rows.find(function (x) { return /Fay/.test(x.innerText); }); return fay ? fay.className + ' ' + getComputedStyle(fay).textDecorationLine + ' ' + getComputedStyle(fay).opacity : 'no row'; })()" }
        ] });
    });
    const v = tag => { const hit = (r.value || []).find(x => typeof x === 'string' && x.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 600)); return hit.slice(tag.length + 1); };
    test('ran; the tap opened the sheet with 23 rows and the pot', () => {
        assert.ok(r && r.ok, r && r.reason);
        assert.equal(v('PICK'), 'none');
        assert.equal(v('OPEN'), 'flex'); assert.equal(v('ROWS'), '23'); assert.equal(v('M0'), 'Pot $460');
    });
    test('the tap on Out: the row struck through, the money line moved', () => {
        assert.match(v('ROW'), /ps-is-out/);
        assert.equal(v('M1'), 'Pot $460 → $440 · Flight A 12 → 11. Scores are in — net finish and skins will recompute.');   // Fay is in A
    });
    test('the tap on Save wrote the two narrow keys and closed the sheet', () => {
        const w = JSON.parse(v('W'));
        assert.equal(w.length, 1);
        assert.deepEqual(w[0].value, { 'players/5/playingForMoney': false, 'players/5/out': true });
        assert.equal(v('CLOSED'), 'none');
    });
    test('the snapshot with her Out greys her Hole View row (computed, not a class that resolves to nothing)', () => {
        assert.match(v('HV'), /golfer-out line-through 0\.55/);
    });
});
