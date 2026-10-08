// ============================================================================
// THE KP QUESTION (2026-09-22, v193)
//
// 9/21: the KP block was a heading and a "Set KP Leader" button under the nav
// row, and the groups did not understand it. Now, on a KP hole, until this
// GROUP has answered for the hole, the block
// IS the question:
//     ⛳ Hole 7 — Closest to the Pin
//     Current KP: Marty (Group 3) — 8' 4"        or   No KP yet.
//     Did anyone get the KP in your group?
//     [ No — leave it ]  [ Yes — pick who ]
// It is EMPHASISED (kp-ask-now) the moment every golfer in this group has a
// score on the hole - renderKpEntryMount runs on every snapshot, so the last
// score lights it. On arriving at the hole unanswered it shows quietly. "No"
// writes nothing and answers for this phone; "Yes" opens the picker and the save
// goes through saveKpLeader UNCHANGED (kpLeaders/hN + kpWinners/hN, one
// update; a later group's save replaces both - last write wins, by design,
// no transaction this wave). After an answer, "Change KP" takes it back.
//
// WAVE 23 MADE THE ANSWER DURABLE AND PER GROUP, and these pins moved with it.
// v193 recorded "this phone was asked" in sessionStorage. That is why groups walked
// off KP holes: the answer died with the session, was never shared between two phones
// in one group, and nothing in the round remembered it. The answer now lives at
// kpGroupAnswers/h<N>/g<G> on the round - an ANSWER LOG that no engine reads - and
// kpAnsweredFor(hole) is the ONE resolver both this block and the forced modal ask.
// Three consequences are pinned below, each at the case that changed:
//   1. "No - leave it" now WRITES (the log, and only the log). The old "No writes
//      nothing" control has become the stronger claim: it writes no WINNER and does
//      not touch the organizer's whole-field node, which would move money.
//   2. A pick makes TWO writes - saveKpLeader's single money update, unchanged, plus
//      the log. The assertions select the money write by key rather than by index,
//      because an index is a statement about ordering that nothing needs to be true.
//   3. CANCEL NO LONGER ANSWERS. Closing the picker used to mark the hole asked, which
//      silently answered for the group; the question now stands, and the gate will ask
//      again on the way out. That was a skip route, not a feature.
// The forced modal that leaving a KP hole now opens is kp_forced_decision_test.js.
//
// WAVE 16 CHANGED THREE THINGS AND NOTHING ELSE:
//  1. THE WORDING. "Did anyone in your group get inside it?" became "Did anyone get
//     the KP in your group?" - Manny's words. "inside it" asked a golfer to compare
//     against a marker the sentence never named.
//  2. ONE FEWER STEP. "Yes" used to reveal a <select> ("Who is closest?") that had to
//     be opened, changed, and then Saved - three interactions after the tap. It now
//     opens the group's names as BUTTONS, two to a row, and ONE TAP records it.
//     pickKpLeader(hole, id) replaces submitKpEntry(hole); saveKpLeader is untouched,
//     and the optional ft/in boxes still ride along - they sit above the names and are
//     read at the tap. There is no "nothing picked" state left to refuse, which is why
//     the old empty-pick assertion moved rather than stayed.
//  3. EQUAL BUTTON WEIGHT. "Yes — pick who" was the filled brand-green button and
//     "No — leave it" the outline one, on a hole where most answers are No. Measured
//     against the block's own background, the filled button was 9.16:1 and the outline
//     1.08:1 - the rarer answer was 8.5x more prominent than the common one. Both are
//     outline now, in ONE rule naming both classes so they cannot drift apart, and the
//     block's kp-ask-now border keeps the job of saying "answer me now". The filled
//     treatment moves to the name buttons, where a tap really does write money.
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
        assert.match(h, /<div class="kp-question">Did anyone get the KP in your group\?<\/div>/);
        assert.doesNotMatch(h, /inside it/, 'Wave 16: the old wording is gone');
        assert.match(h, /<button class="kp-btn kp-no" onclick="answerKpNo\(7\)">No — leave it<\/button>/);
        assert.match(h, /<button class="kp-btn kp-yes" onclick="toggleKpEntry\(7\)">Yes — pick who<\/button>/);
        assert.doesNotMatch(h, /kp-ask-now/, 'CONTROL: the group has not finished the hole - not lit');
        assert.doesNotMatch(h, /Set KP Leader|New Leader|Weekly Game KP/, 'the old block is gone');
    });
    test('the current KP is named with the group and the distance: "Current KP: Gus (Group 2) — 8\' 4""', () => {
        const h = mount(boot(round({ leader: LEADER }), 7, 1));
        assert.match(h, /<div class="kp-current">Current KP: <strong>Gus<\/strong> \(Group 2\) — 8' 4"<\/div>/);
        assert.match(h, /Did anyone get the KP in your group\?/, 'a later group is still asked');
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
        assert.match(three, /Did anyone get the KP/);
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
        // RE-POINTED IN WAVE 23. This asserted that No wrote NOTHING. It now writes the
        // answer log - that is the whole point, because a No that wrote nothing was a No
        // the round forgot. The control underneath it is stronger than the old one: No
        // writes no WINNER and does not touch the organizer's whole-field node, which is
        // the write that would move this hole's share into the skins pot.
        const nw = writes(sb);
        assert.equal(nw.length, 1, 'expected exactly the answer log: ' + JSON.stringify(nw));
        assert.deepEqual(Object.keys(nw[0].value), ['kpGroupAnswers/h7/g1']);
        assert.equal(nw[0].value['kpGroupAnswers/h7/g1'].answer, 'none');
        assert.ok(!JSON.stringify(nw).includes('kpWinners'), 'CONTROL: No names no winner');
        assert.ok(!JSON.stringify(nw).includes('kpNoWinner'),
            'CONTROL: No is not the organizer\'s whole-field call and must not move money');
        const h = mount(sb);
        assert.doesNotMatch(h, /Did anyone|kp-no|kp-yes/);
        assert.match(h, /Current KP: <strong>Gus<\/strong>/);
        assert.match(h, /<button class="kp-change" onclick="changeKpAnswer\(7\)">Change KP<\/button>/);
        assert.equal(run(sb, "sessionStorage.getItem('kpAnswer:KPQ1:h7:g1')"), 'none',
            'the same-session fallback did not record the answer');
        run(sb, 'renderKpEntryMount()');
        assert.doesNotMatch(mount(sb), /Did anyone/, 'asked once');
        // hole 12 is still unanswered on this phone
        run(sb, 'currentViewedHole = 12; renderKpEntryMount()');
        assert.match(mount(sb), /Hole 12 — Closest to the Pin[\s\S]*Did anyone/);
    });
    test('"Yes — pick who": THIS group\'s names as buttons; ONE TAP writes both keys through saveKpLeader; the block re-renders the new KP; answered', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, 'toggleKpEntry(7)');
        const p = mount(sb);
        // WAVE 16: buttons, not a <select> that must be opened and then Saved.
        assert.match(p, /<div class="kp-names">/);
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => assert.match(p,
            new RegExp('<button class="kp-btn kp-name" onclick="pickKpLeader\\(7, \'\\d+\'\\)">' + n + '</button>'),
            n + ' is not a one-tap name button'));
        ['Eli', 'Fay', 'Gus', 'Hal'].forEach(n => assert.doesNotMatch(p,
            new RegExp('kp-name[^>]*>' + n + '<'), 'CONTROL: not the other group'));
        assert.doesNotMatch(p, /<select|kp-select|kp-pick-7|Save KP/,
            'the select-and-Save picker is gone, and with it the step this wave cut');
        assert.match(p, /onclick="cancelKpEntry\(7\)">Cancel/);
        assert.doesNotMatch(p, /Did anyone/);
        // the optional ft/in still ride along, above the names, read AT the tap
        assert.match(p, /id="kp-ft-7"/); assert.match(p, /id="kp-in-7"/);
        assert.ok(p.indexOf('kp-dist-row') < p.indexOf('kp-names'), 'distance sits above the names');
        run(sb, "document.getElementById('kp-ft-7').value = '6'; document.getElementById('kp-in-7').value = '2'; pickKpLeader(7, '102')");
        await tick(); await tick();
        // TWO WRITES NOW (Wave 23): saveKpLeader's money update, byte-for-byte the same
        // single update it always made, PLUS the answer log. The money write is selected
        // BY KEY, not by index - which write goes first is not a claim worth pinning.
        const w = writes(sb);
        const money = w.filter(x => x.value && x.value['kpWinners/h7'] !== undefined);
        assert.equal(money.length, 1, 'kpWinners must be written by exactly one update: ' + JSON.stringify(w));
        assert.equal(money[0].path, 'events/KPQ1');
        assert.equal(money[0].value['kpWinners/h7'], '102');
        assert.equal(money[0].value['kpLeaders/h7'].playerId, '102'); assert.equal(money[0].value['kpLeaders/h7'].playerName, 'Ben'); assert.equal(money[0].value['kpLeaders/h7'].group, 1); assert.equal(money[0].value['kpLeaders/h7'].distanceInches, 74);
        assert.deepEqual(Object.keys(money[0].value).sort(), ['kpLeaders/h7', 'kpWinners/h7'],
            'the money update gained a key - its atomicity is why the two are together');
        const log = w.filter(x => x.value && x.value['kpGroupAnswers/h7/g1'] !== undefined);
        assert.equal(log.length, 1, 'the pick did not record the group\'s answer');
        assert.equal(log[0].value['kpGroupAnswers/h7/g1'].answer, '102');
        assert.ok(!JSON.stringify(w).includes('kpNoWinner'), 'a pick touched the organizer\'s node');
        // the page's own snapshot carries the leader back
        run(sb, "currentData.kpLeaders = { h7: { playerId: '102', playerName: 'Ben', group: 1, distanceInches: 74, updatedAt: 2 } }; currentData.kpWinners = { h7: '102' }; renderKpEntryMount()");
        const h = mount(sb);
        assert.match(h, /Current KP: <strong>Ben<\/strong> \(Group 1\) — 6' 2"/);
        assert.match(h, /Change KP/); assert.doesNotMatch(h, /Did anyone/);
        assert.equal(run(sb, 'window.__alerts.length'), 0);
    });
    test('a LATER group replaces the leader: Gus (Group 2) was KP, group 1 saves Ben - both keys move; last write wins', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, "toggleKpEntry(7); pickKpLeader(7, '102')");
        await tick(); await tick();
        assert.equal(writes(sb)[0].value['kpWinners/h7'], '102', 'was 107');
        assert.equal(writes(sb)[0].value['kpLeaders/h7'].playerName, 'Ben');
    });
    test('Cancel: nothing written, and the QUESTION STANDS - closing the picker is not an answer (re-pointed, Wave 23)', () => {
        // This asserted that Cancel left "Change KP" behind, i.e. that closing the
        // picker counted as having answered. It did that by marking the hole asked on
        // this phone, so a golfer who opened the picker and thought better of it had
        // silently answered for their group - a skip with nothing behind it. Cancel now
        // records nothing and the question comes back, which is also what makes the
        // forced gate on the way out coherent: there is no half-answered state left.
        const sb = boot(round(), 7, 1);
        run(sb, 'toggleKpEntry(7); cancelKpEntry(7)');
        assert.deepEqual(writes(sb), [], 'Cancel wrote something');
        assert.match(mount(sb), /Did anyone get the KP in your group\?/, 'the question did not come back');
        assert.doesNotMatch(mount(sb), /kp-names|Change KP/);
        assert.equal(run(sb, "sessionStorage.getItem('kpAnswer:KPQ1:h7:g1')"), null,
            'Cancel recorded an answer');
    });
    test('"Change KP" reopens the picker after a No; a save then replaces the answer', async () => {
        const sb = boot(round({ leader: LEADER }), 7, 1);
        run(sb, 'answerKpNo(7)');
        // CHANGE KP DELETES THE GROUP'S ANSWER (Wave 23, Manny's rule D), rather than
        // only reopening the picker - otherwise a group that answered and changed their
        // mind keeps a stored answer they can no longer see, and nothing asks again.
        run(sb, 'changeKpAnswer(7)');
        assert.equal(run(sb, 'kpAnsweredFor(7)'), null, 'the answer was not taken back');
        assert.match(mount(sb), /kp-name/);
        run(sb, "pickKpLeader(7, '103')");
        await tick(); await tick();
        const mw = writes(sb).filter(x => x.value && x.value['kpWinners/h7'] !== undefined);
        assert.equal(mw.length, 1);
        assert.equal(mw[0].value['kpWinners/h7'], '103');
    });
    test('there is no empty pick to refuse any more - but an id that is not this group\'s is still refused', () => {
        // RE-POINTED IN WAVE 16. This used to set the select to '' and assert the
        // "Pick the golfer who is closest." refusal. That state cannot happen now: every
        // name is its own button carrying its own id, so there is nothing to leave blank
        // and the placeholder option is gone. Deleting the test would have dropped the
        // real claim underneath it - that the picker cannot write a golfer it should not -
        // so it now asserts THAT, which the select could never be made to do by hand.
        const sb = boot(round(), 7, 1);
        run(sb, "toggleKpEntry(7); pickKpLeader(7, '')");
        assert.deepEqual(writes(sb), [], 'an empty id writes nothing');
        assert.equal(run(sb, "sessionStorage.getItem('kpAsked:KPQ1:h7')"), null, 'and does not count as an answer');
        // Gus is in group 2; this phone is locked to group 1.
        run(sb, "pickKpLeader(7, '107')");
        assert.deepEqual(writes(sb), [], 'another group\'s golfer writes nothing');
        assert.equal(run(sb, 'window.__alerts.length') > 0, true, 'and it says so rather than failing silently');
    });
    test('a single-group round on the bare link (the organizer\'s foursome): the question, all four to pick from', () => {
        const d = round(); d.players = d.players.slice(0, 4); delete d.groupSizeOverrides;
        const h = mount(boot(d, 7));
        assert.match(h, /Did anyone get the KP in your group\?/);
    });
});

describe('THE SEAMS', () => {
    const src = read('index.html');
    test('saveKpLeader is unchanged in what it writes: one update, kpLeaders/hN and kpWinners/hN', () => {
        const fn = src.slice(src.indexOf('function saveKpLeader('), src.indexOf('function savePoolKp('));
        assert.match(fn, /updates\['kpLeaders\/h' \+ hole\] = leader;\s*updates\['kpWinners\/h' \+ hole\] = String\(pid\);/);
        // RE-POINTED 2026-10-06: still ONE update carrying both keys - which is
        // the claim this test exists for - but issued through durableWrite, so
        // the op is on the phone before it is sent and is coalesced by hole.
        assert.match(fn, /durableWrite\('events\/' \+ currentMode, 'update', updates, 'kp:h' \+ hole\)/);
        assert.doesNotMatch(fn, /kpAsked|sessionStorage|transaction/);
    });
    test('the question is answered in sessionStorage per round and hole; the mount is rendered on every snapshot (the last score lights it)', () => {
        // RE-POINTED: the answer lives on the round now, per hole AND per group, with
        // sessionStorage kept only as a same-session fallback. Both keys are pinned so
        // neither can quietly lose the group segment - which is what would let one
        // foursome's answer silence another's question.
        assert.match(src, /function kpGroupAnswerKey\(\) \{ return 'g' \+ \(hasGroupLock/);
        assert.match(src, /function kpSessionAnswerKey\(hole\) \{ return 'kpAnswer:' \+ currentMode \+ ':h' \+ hole \+ ':' \+ kpGroupAnswerKey\(\); \}/);
        assert.match(src, /u\['kpGroupAnswers\/h' \+ hole \+ '\/' \+ kpGroupAnswerKey\(\)\]/);
        assert.match(src, /function renderCardWidgets\(\) \{\s*renderTodaysGames\(\);\s*renderHoleLive\(\);\s*renderKpEntryMount\(\);/);
    });
    test('pool-engine.js: the pay rule (recording pays) is the one this block writes for; its sha moved 2026-09-22 for KP-never-refunds (approved), not for this block', () => {
        const crypto = require('crypto');
        assert.equal(crypto.createHash('sha256').update(read('pool-engine.js')).digest('hex').slice(0, 8), '372e76d7');   // was a335f19c (2026-09-22: KP never refunds, the KP branch only)
    });
});

// ---------------------------------------------------------------------------
// CHROME, cold arrival, 390x844: the page renders the question itself on hole 7 (a KP
// hole) for group 1's link; ONE REAL TAP on "Yes — pick who" opens the picker; ONE REAL
// TAP on a name writes the one update the page has always written; the snapshot that
// comes back re-renders the block as "Current KP: Ben (Group 1)". No page function is
// called.
//
// THIS IS THE TEST THAT PROVES WAVE 16'S CLAIM, and it is why the step count is asserted
// as a number. Before: tap Yes, open the select, choose, tap Save KP - three
// interactions after Yes, one of them on a native picker a test cannot tap at all (the
// old version of this block had to set the select's .value by script, which is exactly
// the gap CLAUDE.md warns about: it proved the save worked when invoked, not that a
// golfer could reach it). Now every step is a real tap, and there are two.
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
            { expression: "'NAMES:' + [].slice.call(document.querySelectorAll('.kp-name')).map(function (b) { return b.innerText.trim(); }).join('|')" },
            // Ben is the second name; this is a REAL TAP on the button a golfer taps,
            // not a scripted value on a control a test cannot open.
            { tap: '.kp-name', nth: 1 }, { sleep: 400 },
            { expression: "'W:' + JSON.stringify(window.__coldWrites)" },
            { deliver: { path: 'events/KPQ1', value: Object.assign({}, d, { kpLeaders: { h7: { playerId: '102', playerName: 'Ben', group: 1, distanceInches: null, updatedAt: 2 } }, kpWinners: { h7: '102' } }) } }, { sleep: 250 },
            { expression: "'T2:' + " + TEXT },
            { expression: "'S:' + sessionStorage.getItem('kpAnswer:KPQ1:h7:g1')" }
        ] });
    });
    const val = tag => { const hit = (r.value || []).find(v => typeof v === 'string' && v.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 400)); return hit.slice(tag.length + 1); };
    test('ran, on hole 7, and the block was the question', () => {
        assert.ok(r && r.ok, r && r.reason);
        assert.equal(val('H'), '7');
        assert.match(val('T0'), /^⛳ Hole 7 — Closest to the Pin No KP yet\. Did anyone get the KP in your group\? No — leave it Yes — pick who$/);
    });
    test('the tap on Yes showed the four names; ONE tap on a name wrote kpLeaders/h7 + kpWinners/h7 in one update', () => {
        // The picker is the names. No placeholder to open, no Save to find.
        assert.equal(val('NAMES'), 'Ann|Ben|Cal|Dee');
        assert.doesNotMatch(val('T1'), /Who is closest\?|Save KP/,
            'the select-and-Save picker is back, and with it the step this wave cut');
        assert.match(val('T1'), /Distance \(optional\)[\s\S]*Ann[\s\S]*Ben/,
            'distance sits above the names, which is the only place it can be read before the tap');
        // BY KEY, not by index: the tap now also records the group's answer, and the
        // money update is the one carrying kpWinners.
        const w = JSON.parse(val('W')).filter(x => x.path === 'events/KPQ1');
        const money = w.filter(x => x.value && x.value['kpWinners/h7'] !== undefined);
        assert.equal(money.length, 1, 'one update must carry the money: ' + JSON.stringify(w));
        assert.equal(money[0].op, 'update');
        assert.equal(money[0].value['kpWinners/h7'], '102'); assert.equal(money[0].value['kpLeaders/h7'].playerName, 'Ben'); assert.equal(money[0].value['kpLeaders/h7'].group, 1);
        assert.equal(w.filter(x => x.value && x.value['kpGroupAnswers/h7/g1'] !== undefined).length, 1,
            'the real tap did not record the group\'s answer');
    });
    test('the snapshot re-rendered the block: Current KP: Ben (Group 1), Change KP, no question; answered on this phone', () => {
        assert.match(val('T2'), /^⛳ Hole 7 — Closest to the Pin Current KP: Ben \(Group 1\) — Distance not recorded Change KP$/);
        assert.equal(val('S'), '102', 'the answer recorded is the golfer who was tapped');
    });
});
