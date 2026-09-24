// ============================================================================
// THE KP QUESTION (2026-09-22, v193)
//
// 9/21: the KP block was a heading and a "Set KP Leader" button under the nav
// row, and the groups did not understand it. Now, on a KP hole, until this
// phone has answered for the hole (sessionStorage kpAsked:CODE:hN), the block
// IS the question:
//     ⛳ Hole 7 — Closest to the Pin
//     Current KP: Marty (Group 3) — 8' 4"        or   No KP yet.
//     Did anyone in your group get inside it?
//     [ No — leave it ]  [ Yes — pick who ]
// It is EMPHASISED (kp-ask-now) the moment every golfer in this group has a
// score on the hole - renderKpEntryMount runs on every snapshot, so the last
// score lights it. On arriving at the hole unanswered it shows quietly. "No"
// writes nothing and answers for this phone; "Yes" opens the picker and Save
// goes through saveKpLeader UNCHANGED (kpLeaders/hN + kpWinners/hN, one
// update; a later group's save replaces both - last write wins, by design,
// no transaction this wave). After an answer, "Change KP" reopens the picker.
// A spectator sees the current KP and nothing to tap. pool-engine.js is not
// touched: what is written is what it always read.
//
// HARNESS: kp_entry_position_test.js's boot - the page's realm with the mount
// mounted, db.ref stubbed to record writes, sessionStorage real.
// ============================================================================

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);   // par 3s at 3, 7, 12, 16
const run = (sb, c) => vm.runInContext(c, sb);
const tick = () => new Promise(r => setImmediate(r));

// Eight golfers, two groups of four; group 1 = Ann..Dee, group 2 = Eli..Hal.
function round(o) {
    o = o || {};
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 4, 9, 13, 2, 6, 8, 10]);
    const scores = {};
    players.forEach(p => { for (let h = 1; h <= (o.thru === undefined ? 6 : o.thru); h++) scores['p' + p.id + '_h' + h] = 5; });
    if (o.holeSevenFor) o.holeSevenFor.forEach(id => { scores['p' + id + '_h7'] = 3; });
    const d = { eventName: 'KP Day', gameFormat: 'stroke', courseData: CD, players, scores, settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4, 1: 4 },
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 0 }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
    if (o.leader) { d.kpLeaders = { h7: o.leader }; d.kpWinners = { h7: String(o.leader.playerId) }; }
    return d;
}
function boot(data, hole, group) {
    const sb = loadHtmlInlineScript('index.html', [], { search: '?game=KPQ1' + (group ? '&group=' + group : '') });
    sb.__d = data;
    run(sb, `
        window.__writes = []; window.__alerts = []; alert = m => window.__alerts.push(String(m)); uiRefuse = m => window.__alerts.push(String(m)); uiFail = m => window.__alerts.push(String(m)); uiToast = m => window.__alerts.push(String(m));
        db.ref = function (p) { return { set: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); }, remove: function () { return Promise.resolve(); },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }, push: function () { return { key: 'k' }; } }; };
        currentMode = 'KPQ1'; currentData = __d;
        window.__scFilteredPlayers = currentData.players;
        // the group map renderScorecard builds (playerGroupOf reads it): 4 / 4 here
        window.__scPlayerGroupMap = {}; currentData.players.forEach(function (p, i) { window.__scPlayerGroupMap[p.id] = (currentData.groupSizeOverrides ? (i < 4 ? 1 : 2) : 1); });
        hasGroupLock = ${group ? 'true' : 'false'}; lockedGroup = ${group || 'null'};
        currentViewedHole = ${hole}; navigator.onLine = true;
        document.__mount(document.getElementById('kp-entry-mount'));
        renderKpEntryMount();
    `, sb);
    return sb;
}
const mount = sb => String(sb.document.getElementById('kp-entry-mount').innerHTML || '');
const writes = sb => JSON.parse(run(sb, 'JSON.stringify(window.__writes)'));
const LEADER = { playerId: '107', playerName: 'Gus', group: 2, distanceInches: 100, updatedAt: 1 };

describe('THE QUESTION on a KP hole', () => {
    test('arriving at hole 7 unanswered, no KP yet: the head, "No KP yet.", the question, both answers - quiet (not lit)', () => {
        const h = mount(boot(round(), 7, 1));
        assert.match(h, /<div class="kp-block kp-ask"><div class="kp-head">⛳ Hole 7 — Closest to the Pin<\/div>/);
        assert.match(h, /<div class="kp-current kp-none">No KP yet\.<\/div>/);
        assert.match(h, /<div class="kp-question">Did anyone in your group get inside it\?<\/div>/);
        assert.match(h, /<button class="kp-btn kp-no" onclick="answerKpNo\(7\)">No — leave it<\/button>/);
        assert.match(h, /<button class="kp-btn kp-yes" onclick="toggleKpEntry\(7\)">Yes — pick who<\/button>/);
        assert.doesNotMatch(h, /kp-ask-now/, 'CONTROL: the group has not finished the hole - not lit');
        assert.doesNotMatch(h, /Set KP Leader|New Leader|Weekly Game KP/, 'the old block is gone');
    });
    test('the current KP is named with the group and the distance: "Current KP: Gus (Group 2) — 8\' 4""', () => {
        const h = mount(boot(round({ leader: LEADER }), 7, 1));
        assert.match(h, /<div class="kp-current">Current KP: <strong>Gus<\/strong> \(Group 2\) — 8' 4"<\/div>/);
        assert.match(h, /Did anyone in your group get inside it\?/, 'a later group is still asked');
    });
    test('the group is read LIVE, not off the kpLeaders stamp: a golfer moved to another group (v199) reads his NEW group (CONTROL: the stamp still says the old one)', () => {
        // saveKpLeader stamps the group the recorder was in. The Players sheet can
        // move that golfer afterwards, and the stamp then names the group he left.
        // a COPY of LEADER: the fixture hands the same object to every round, and
        // this test mutates the leader to check the fallback
        const d = round({ leader: Object.assign({}, LEADER) });
        assert.equal(d.kpLeaders.h7.group, 2, 'CONTROL: the stamp in the record says 2');
        const sb = boot(d, 7, 1);
        // the roster moved Gus into group 1; the map renderScorecard rebuilds says so
        run(sb, "window.__scPlayerGroupMap[String(currentData.kpLeaders.h7.playerId)] = 1; renderKpEntryMount();");
        assert.match(mount(sb), /Current KP: <strong>Gus<\/strong> \(Group 1\)/);
        assert.equal(run(sb, 'currentData.kpLeaders.h7.group'), 2, 'the stamp is untouched history');
        // with the map absent it falls back to the ROSTER (the same live answer, so
        // the tag never depends on a render having happened first); an id off the
        // roster gets no tag at all
        run(sb, "window.__scPlayerGroupMap = null; renderKpEntryMount();");
        assert.match(mount(sb), /Current KP: <strong>Gus<\/strong> \(Group 2\)/, 'from the roster: Gus is the 7th of 8, group 2');
        run(sb, "currentData.kpLeaders.h7.playerId = '999'; renderKpEntryMount();");
        assert.doesNotMatch(mount(sb), /\(Group /);
    });
    test('LIT when every golfer in the group has a score on the hole - not before (CONTROL: three of four)', () => {
        const three = mount(boot(round({ holeSevenFor: [101, 102, 103] }), 7, 1));
        assert.doesNotMatch(three, /kp-ask-now/);
        assert.match(three, /Did anyone in your group/);
        const four = mount(boot(round({ holeSevenFor: [101, 102, 103, 104] }), 7, 1));
        assert.match(four, /<div class="kp-block kp-ask kp-ask-now">/);
        // the other group's scores do not light THIS group's question
        const others = mount(boot(round({ holeSevenFor: [105, 106, 107, 108] }), 7, 1));
        assert.doesNotMatch(others, /kp-ask-now/);
    });
    test('a non-KP hole: nothing; a KP hole for a spectator (bare link, multi-group): the current KP and nothing to tap', () => {
        assert.equal(mount(boot(round(), 8, 1)), '');
        const s = mount(boot(round({ leader: LEADER }), 7));
        assert.match(s, /Current KP: <strong>Gus<\/strong> \(Group 2\)/);
        assert.doesNotMatch(s, /kp-btn|kp-change|Did anyone|kp-select/, 'seeing is not claiming');
    });
});

describe('THE ANSWERS', () => {
    test('"No — leave it": nothing written, the question gone, "Change KP" stays; asked once per hole (a re-render does not ask again)', () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, 'answerKpNo(7)');
        assert.deepEqual(writes(sb), [], 'CONTROL: No writes nothing');
        const h = mount(sb);
        assert.doesNotMatch(h, /Did anyone|kp-no|kp-yes/);
        assert.match(h, /Current KP: <strong>Gus<\/strong>/);
        assert.match(h, /<button class="kp-change" onclick="toggleKpEntry\(7\)">Change KP<\/button>/);
        assert.equal(run(sb, "sessionStorage.getItem('kpAsked:KPQ1:h7')"), '1');
        run(sb, 'renderKpEntryMount()');
        assert.doesNotMatch(mount(sb), /Did anyone/, 'asked once');
        // hole 12 is still unanswered on this phone
        run(sb, 'currentViewedHole = 12; renderKpEntryMount()');
        assert.match(mount(sb), /Hole 12 — Closest to the Pin[\s\S]*Did anyone/);
    });
    test('"Yes — pick who": the picker with THIS group\'s golfers only; Save writes both keys through saveKpLeader; the block re-renders the new KP; answered', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, 'toggleKpEntry(7)');
        const p = mount(sb);
        assert.match(p, /<select id="kp-pick-7" class="kp-select">/);
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => assert.match(p, new RegExp('<option value="\\d+">' + n + '</option>')));
        ['Eli', 'Fay', 'Gus', 'Hal'].forEach(n => assert.doesNotMatch(p, new RegExp('<option value="\\d+">' + n + '</option>'), 'CONTROL: not the other group'));
        assert.match(p, /Save KP/); assert.match(p, /onclick="cancelKpEntry\(7\)">Cancel/);
        assert.doesNotMatch(p, /Did anyone/);
        run(sb, "document.getElementById('kp-pick-7').value = '102'; document.getElementById('kp-ft-7').value = '6'; document.getElementById('kp-in-7').value = '2'; submitKpEntry(7)");
        await tick(); await tick();
        const w = writes(sb);
        assert.equal(w.length, 1); assert.equal(w[0].path, 'events/KPQ1');
        assert.equal(w[0].value['kpWinners/h7'], '102');
        assert.equal(w[0].value['kpLeaders/h7'].playerId, '102'); assert.equal(w[0].value['kpLeaders/h7'].playerName, 'Ben'); assert.equal(w[0].value['kpLeaders/h7'].group, 1); assert.equal(w[0].value['kpLeaders/h7'].distanceInches, 74);
        assert.deepEqual(Object.keys(w[0].value).sort(), ['kpLeaders/h7', 'kpWinners/h7'], 'the same two keys as before, nothing else');
        // the page's own snapshot carries the leader back
        run(sb, "currentData.kpLeaders = { h7: { playerId: '102', playerName: 'Ben', group: 1, distanceInches: 74, updatedAt: 2 } }; currentData.kpWinners = { h7: '102' }; renderKpEntryMount()");
        const h = mount(sb);
        assert.match(h, /Current KP: <strong>Ben<\/strong> \(Group 1\) — 6' 2"/);
        assert.match(h, /Change KP/); assert.doesNotMatch(h, /Did anyone/);
        assert.equal(run(sb, 'window.__alerts.length'), 0);
    });
    test('a LATER group replaces the leader: Gus (Group 2) was KP, group 1 saves Ben - both keys move; last write wins', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, "toggleKpEntry(7); document.getElementById('kp-pick-7').value = '102'; submitKpEntry(7)");
        await tick(); await tick();
        assert.equal(writes(sb)[0].value['kpWinners/h7'], '102', 'was 107');
        assert.equal(writes(sb)[0].value['kpLeaders/h7'].playerName, 'Ben');
    });
    test('Cancel: nothing written, answered on this phone, Change KP stays', () => {
        const sb = boot(round(), 7, 1);
        run(sb, 'toggleKpEntry(7); cancelKpEntry(7)');
        assert.deepEqual(writes(sb), []);
        assert.match(mount(sb), /Change KP/); assert.doesNotMatch(mount(sb), /Did anyone|kp-select/);
    });
    test('"Change KP" reopens the picker after a No; a save then replaces the answer', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, 'answerKpNo(7)');
        run(sb, 'toggleKpEntry(7)');
        assert.match(mount(sb), /kp-pick-7/);
        run(sb, "document.getElementById('kp-pick-7').value = '103'; submitKpEntry(7)");
        await tick(); await tick();
        assert.equal(writes(sb)[0].value['kpWinners/h7'], '103');
    });
    test('an empty pick: the alert, nothing written, still not answered', () => {
        const sb = boot(round(), 7, 1);
        run(sb, "toggleKpEntry(7); document.getElementById('kp-pick-7').value = ''; submitKpEntry(7)");
        assert.deepEqual(writes(sb), []);
        assert.equal(run(sb, 'window.__alerts[0]'), 'Pick the golfer who is closest.');
        assert.equal(run(sb, "sessionStorage.getItem('kpAsked:KPQ1:h7')"), null);
    });
    test('a single-group round on the bare link (the organizer\'s foursome): the question, all four to pick from', () => {
        const d = round(); d.players = d.players.slice(0, 4); delete d.groupSizeOverrides;
        const h = mount(boot(d, 7));
        assert.match(h, /Did anyone in your group get inside it\?/);
    });
});

describe('THE SEAMS', () => {
    const src = read('index.html');
    test('saveKpLeader is unchanged in what it writes: one update, kpLeaders/hN and kpWinners/hN', () => {
        const fn = src.slice(src.indexOf('function saveKpLeader('), src.indexOf('function savePoolKp('));
        assert.match(fn, /updates\['kpLeaders\/h' \+ hole\] = leader;\s*updates\['kpWinners\/h' \+ hole\] = String\(pid\);/);
        assert.match(fn, /db\.ref\('events\/' \+ currentMode\)\.update\(updates\)/);
        assert.doesNotMatch(fn, /kpAsked|sessionStorage|transaction/);
    });
    test('the question is answered in sessionStorage per round and hole; the mount is rendered on every snapshot (the last score lights it)', () => {
        assert.match(src, /function kpAskedKey\(hole\) \{ return 'kpAsked:' \+ currentMode \+ ':h' \+ hole; \}/);
        assert.match(src, /function renderCardWidgets\(\) \{\s*renderKpEntryMount\(\);/);
    });
    test('pool-engine.js: the pay rule (recording pays) is the one this block writes for; its sha moved 2026-09-22 for KP-never-refunds (approved), not for this block', () => {
        const crypto = require('crypto');
        assert.equal(crypto.createHash('sha256').update(read('pool-engine.js')).digest('hex').slice(0, 8), '372e76d7');   // was a335f19c (2026-09-22: KP never refunds, the KP branch only)
    });
});

// ---------------------------------------------------------------------------
// CHROME, cold arrival, 390x844: the page renders the question itself on hole
// 7 (a KP hole) for group 1's link; ONE REAL TAP on "Yes — pick who" opens the
// picker; the golfer is chosen the way a golfer chooses (the select's value);
// a real tap on Save KP writes the one update the page has always written; the
// snapshot that comes back re-renders the block as "Current KP: Ben (Group 1)".
// No page function is called.
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
describe('CHROME: a real tap on Yes, a pick, a real tap on Save', () => {
    const data = round({ holeSevenFor: [101, 102, 103, 104] });
    // land on hole 7: everyone in group 1 has 1-7 scored, the page's landing rule goes past it, so score only 1-6 for group 1 and 7 for the others' irrelevance
    const d = round();  // group 1 scored 1-6 -> the landing hole is 7
    const DB = { events: { KPQ1: d }, global_courses: {}, trips: {}, tournaments: {} };
    const TEXT = "document.getElementById('kp-entry-mount').innerText.replace(/\\s+/g, ' ').trim()";
    let r;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=KPQ1&group=1'), db: DB, settleMs: 4000, steps: [
            { expression: "'H:' + String(currentViewedHole)" },
            { expression: "'T0:' + " + TEXT },
            { tap: '.kp-yes', nth: 0 }, { sleep: 250 },
            { expression: "'T1:' + " + TEXT },
            { expression: "(function () { var s = document.getElementById('kp-pick-7'); s.value = '102'; return 'PICK:' + s.value; })()" },
            { tap: '.kp-block .kp-btn', nth: 0 }, { sleep: 400 },
            { expression: "'W:' + JSON.stringify(window.__coldWrites)" },
            { deliver: { path: 'events/KPQ1', value: Object.assign({}, d, { kpLeaders: { h7: { playerId: '102', playerName: 'Ben', group: 1, distanceInches: null, updatedAt: 2 } }, kpWinners: { h7: '102' } }) } }, { sleep: 250 },
            { expression: "'T2:' + " + TEXT },
            { expression: "'S:' + sessionStorage.getItem('kpAsked:KPQ1:h7')" }
        ] });
    });
    const val = tag => { const hit = (r.value || []).find(v => typeof v === 'string' && v.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 400)); return hit.slice(tag.length + 1); };
    test('ran, on hole 7, and the block was the question', () => {
        assert.ok(r && r.ok, r && r.reason);
        assert.equal(val('H'), '7');
        assert.match(val('T0'), /^⛳ Hole 7 — Closest to the Pin No KP yet\. Did anyone in your group get inside it\? No — leave it Yes — pick who$/);
    });
    test('the tap on Yes opened the picker; the pick took; the tap on Save wrote kpLeaders/h7 + kpWinners/h7 in one update', () => {
        assert.match(val('T1'), /Who is closest\?[\s\S]*Save KP/);
        assert.equal(val('PICK'), '102');
        const w = JSON.parse(val('W')).filter(x => x.path === 'events/KPQ1');
        assert.equal(w.length, 1); assert.equal(w[0].op, 'update');
        assert.equal(w[0].value['kpWinners/h7'], '102'); assert.equal(w[0].value['kpLeaders/h7'].playerName, 'Ben'); assert.equal(w[0].value['kpLeaders/h7'].group, 1);
    });
    test('the snapshot re-rendered the block: Current KP: Ben (Group 1), Change KP, no question; answered on this phone', () => {
        assert.match(val('T2'), /^⛳ Hole 7 — Closest to the Pin Current KP: Ben \(Group 1\) — Distance not recorded Change KP$/);
        assert.equal(val('S'), '1');
    });
});
