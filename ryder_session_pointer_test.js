// ============================================================================
// A ROUND HAS TO KNOW WHICH SESSION IT IS
//
// Phase 4 designed the pointer architecture: one authoritative Cup on the host
// round, and every participating round carrying only
//
//     data.ryderCupRef = { host: 'ABCD', sessionId: 'd1s2' }
//
// The engine reads it. Every surface reads it. NOTHING WROTE IT. Every occurrence
// in the codebase was a reader or a comment, so a real round always resolved to
// status 'local' with sessionId null - and the Foursomes entry card, which needs a
// session id, could never appear no matter how correctly it was wired.
//
// That is the second missing wire in the same feature. The first was the render
// call; this is the pointer. Both were invisible for the same reason: the tests
// supplied by hand the thing production never produced.
//
// SO NOTHING HERE HANDS ANYTHING A ref. The end-to-end test drives the real setup
// UI, captures whatever database writes it actually performs, applies exactly
// those writes to a round, and opens the scorecard on it. If rcSave does not write
// the pointer, the round does not have one, and the card does not render.
//
// THE GATE. Required when the Cup has sessions, optional otherwise. A Classic Cup
// whose round cannot say which session it plays is a round with no identity, and
// that is the failure class removed four times over. A custom Cup has no sessions
// at all - only Four-Ball and Singles, no schedule - so there is nothing to point
// at and nothing to require.
//
// There are no intermediate saves to block: every rc* mutator is in-memory, and
// rcSave and rcRemove are the only database writes in the flow. Refusing surfaces
// through the existing problem list and leaves the draft untouched.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const SM_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];
const IDX_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
    'pool-engine.js', 'bet-strip.js', 'hole-events.js', 'ryder-cup.js'];

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
           { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];
const CODE = 'HOSTRD';

// The Matches page with its database captured rather than stubbed away, so every
// write the real save performs is recorded with its path.
function cupPage(existing) {
    const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS);
    vm.runInContext(`
        window.__written = []; window.__removed = [];
        alert = function () {}; confirm = function () { return true; };
        db.ref = function (p) { return {
            set: function (v) { window.__written.push({ path: p, value: v });
                return { then: function (f) { f && f(); return { catch: function () {} }; } }; },
            remove: function () { window.__removed.push(p);
                return { then: function (f) { f && f(); return { catch: function () {} }; } }; },
            on: function () {},
            once: function () { return { then: function (f) {
                f && f({ val: function () { return null; } });
                return { catch: function () {} }; } }; },
            push: function () { return { key: 'K1' }; },
            update: function () {} }; };
        currentMode = ${JSON.stringify(CODE)};
        isOrganizerView = function () { return true; };
        currentData = ${JSON.stringify(Object.assign(
            { players: P, courseData: CD, scores: {} }, existing || {}))};
    `, sb);
    return sb;
}

const run = (sb, e) => vm.runInContext(e, sb);
const writes = sb => JSON.parse(run(sb, 'JSON.stringify(window.__written)'));
const removed = sb => JSON.parse(run(sb, 'JSON.stringify(window.__removed)'));
const problems = sb => run(sb, 'document.getElementById("rc-problems").innerHTML');

// Builds a Classic Cup the way an organizer does. `session` is what they pick in
// the "this round plays" control - omitted means they picked nothing.
function setUpClassic(sb, session, seed) {
    run(sb, 'rcOpenClassic();');
    run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"B"); rcToggle(104,"B");');
    if (seed !== false) run(sb, 'rcSeedSession("d1s1");');
    if (session) run(sb, 'rcSetPlaysSession(' + JSON.stringify(session) + ');');
    run(sb, 'rcSave();');
}

// A custom Cup: no schedule, no sessions, Four-Ball and Singles only.
function setUpCustom(sb) {
    run(sb, 'rcOpen();');
    run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"B"); rcToggle(104,"B");');
    run(sb, 'rcAddMatch("fourball");');
    run(sb, 'rcSave();');
}

const wroteTo = (sb, suffix) =>
    writes(sb).filter(w => String(w.path).endsWith(suffix))[0] || null;

describe('THE PICKER EXISTS WHERE A SCHEDULE DOES', () => {

    test('a Classic Cup offers a "this round plays" control', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'renderRyderCupSetup();');
        const html = run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
        assert.match(html, /id="rc-plays-session"/,
            'a Classic Cup gives no way to say which session this round is');
    });

    // THE CONTROL MUST BE BOUND TO ITS HANDLER. Every test below calls
    // rcSetPlaysSession directly, which says nothing about whether the dropdown
    // reaches it - a control stripped of its onchange passed the entire suite.
    // Asserted on the RENDERED markup, which is what the browser will act on.
    test('changing the picker actually calls the setter', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'renderRyderCupSetup();');
        const html = run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
        const tag = /<select[^>]*id="rc-plays-session"[^>]*>/.exec(html);
        assert.ok(tag, 'the picker is not a select');
        assert.match(tag[0], /onchange="rcSetPlaysSession\(this\.value\)"/,
            'the picker is not wired to anything - choosing a session would do nothing');
    });

    test('it lists every session on the schedule', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'renderRyderCupSetup();');
        const html = run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
        ['d1s1', 'd1s2', 'd2s1', 'd2s2', 'd3s1'].forEach(id =>
            assert.ok(html.includes('value="' + id + '"'), 'missing session ' + id));
    });

    test('a custom Cup has no schedule, so it offers no picker', () => {
        const sb = cupPage();
        run(sb, 'rcOpen();');
        run(sb, 'renderRyderCupSetup();');
        const html = run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
        assert.ok(!/id="rc-plays-session"/.test(html),
            'a Cup with no sessions must not ask which session this is');
    });
});

describe('SAVING WRITES THE POINTER', () => {

    test('the ref is written, pointing at this round', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd1s1');
        const ref = wroteTo(sb, '/ryderCupRef');
        assert.ok(ref, 'saving a Classic Cup wrote no ryderCupRef at all');
        assert.equal(ref.value.host, CODE, 'the host must be the round holding the Cup');
        assert.equal(ref.value.sessionId, 'd1s1');
    });

    test('the ref lands on this round, not on the Cup object', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd1s1');
        assert.equal(wroteTo(sb, '/ryderCupRef').path, 'events/' + CODE + '/ryderCupRef');
        const cup = wroteTo(sb, '/ryderCup');
        assert.ok(cup, 'the Cup itself was not written');
        assert.ok(!('ryderCupRef' in cup.value), 'the pointer must not be nested in the Cup');
    });

    test('the Cup itself still saves exactly as before', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd1s1');
        const cup = wroteTo(sb, '/ryderCup').value;
        assert.equal(cup.sessions.d1s1.format, 'foursomes');
        assert.equal(Object.keys(cup.matches).length, 1);
        assert.equal(cup.matches['d1s1-m1'].format, 'foursomes');
    });

    test('a different session can be chosen', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd3s1');
        assert.equal(wroteTo(sb, '/ryderCupRef').value.sessionId, 'd3s1');
    });
});

describe('THE GATE — REQUIRED ONLY WHERE THERE IS A SCHEDULE', () => {

    test('a Classic Cup with no session chosen refuses to save', () => {
        const sb = cupPage();
        setUpClassic(sb, null);
        assert.equal(writes(sb).length, 0,
            'a round with no identity was saved anyway');
    });

    test('and says so, rather than failing silently', () => {
        const sb = cupPage();
        setUpClassic(sb, null);
        assert.match(problems(sb), /session/i,
            'the organizer is given no reason the save did nothing');
    });

    test('the draft survives the refusal, so no work is lost', () => {
        const sb = cupPage();
        setUpClassic(sb, null);
        assert.equal(run(sb, 'rcDraft.matches.length'), 1, 'the seeded lineup was discarded');
        assert.equal(run(sb, 'Object.keys(rcDraft.members).length'), 4);
    });

    test('choosing a session then saving succeeds', () => {
        const sb = cupPage();
        setUpClassic(sb, null);
        run(sb, 'rcSetPlaysSession("d1s2"); rcSave();');
        assert.equal(wroteTo(sb, '/ryderCupRef').value.sessionId, 'd1s2');
    });

    // The gate must not over-apply. A custom Cup has nothing to point at.
    test('a custom Cup saves with no session and no ref', () => {
        const sb = cupPage();
        setUpCustom(sb);
        assert.ok(wroteTo(sb, '/ryderCup'), 'a custom Cup could no longer be saved');
        assert.equal(wroteTo(sb, '/ryderCupRef'), null,
            'a Cup with no sessions must not invent a pointer');
    });
});

describe('THE POINTER SURVIVES A ROUND TRIP', () => {

    test('reopening an existing Cup remembers which session this round is', () => {
        const sb = cupPage({
            ryderCup: { v: 1, name: 'X',
                sides: { A: { id: 'A', name: 'A' }, B: { id: 'B', name: 'B' } },
                members: { '101': 'A', '103': 'B' },
                sessions: { d1s1: { id: 'd1s1', day: 1, order: 1, format: 'foursomes' } },
                matches: {} },
            ryderCupRef: { host: CODE, sessionId: 'd1s1' }
        });
        run(sb, 'rcLoadDraft();');
        assert.equal(run(sb, 'rcDraft.playsSession'), 'd1s1',
            'the stored pointer was dropped when the draft loaded');
    });

    test('re-saving an untouched Cup keeps the same pointer', () => {
        const sb = cupPage({
            ryderCup: { v: 1, name: 'X',
                sides: { A: { id: 'A', name: 'A' }, B: { id: 'B', name: 'B' } },
                members: { '101': 'A', '103': 'B' },
                sessions: { d1s1: { id: 'd1s1', day: 1, order: 1, format: 'foursomes' } },
                matches: {} },
            ryderCupRef: { host: CODE, sessionId: 'd1s1' }
        });
        run(sb, 'rcLoadDraft(); rcDraft.__open = true; rcSave();');
        assert.equal(wroteTo(sb, '/ryderCupRef').value.sessionId, 'd1s1');
    });
});

describe('REMOVING THE CUP CLEARS THE POINTER', () => {

    // A ref left behind after the Cup is gone resolves to 'host-unavailable' -
    // the round would report a Cup it cannot read, forever.
    test('removing the Cup removes the ref too', () => {
        const sb = cupPage({
            ryderCup: { v: 1, name: 'X',
                sides: { A: { id: 'A', name: 'A' }, B: { id: 'B', name: 'B' } },
                members: {}, sessions: {}, matches: {} },
            ryderCupRef: { host: CODE, sessionId: 'd1s1' }
        });
        run(sb, 'rcRemove();');
        const paths = removed(sb);
        assert.ok(paths.some(p => p.endsWith('/ryderCup')), 'the Cup was not removed');
        assert.ok(paths.some(p => p.endsWith('/ryderCupRef')),
            'the round still points at a Cup that no longer exists');
    });
});

describe('END TO END — NO REF IS SUPPLIED BY HAND', () => {

    // THE KEYSTONE. Build the Cup through the real setup UI, apply EXACTLY the
    // writes it performed to a round, and open the scorecard on that round. The
    // ref is whatever production wrote, or it is absent. Nothing here types one.
    function roundFromWrites(sb) {
        const round = { gameFormat: 'stroke', players: P, courseData: CD, scores: {} };
        P.forEach(p => CD.forEach(h => {
            if (h.hole === 5) return;                    // land on hole 5, not hole 1
            round.scores['p' + p.id + '_h' + h.hole] = 4;
        }));
        writes(sb).forEach(w => {
            const key = String(w.path).split('/').pop();
            round[key] = w.value;
        });
        return round;
    }

    function holeViewOf(round) {
        const sb = loadHtmlInlineScript('index.html', IDX_DEPS);
        vm.runInContext('alert=function(){}; currentMode = ' + JSON.stringify(CODE) + ';', sb);
        vm.runInContext('currentData = ' + JSON.stringify(round) + ';', sb);
        vm.runInContext('renderScorecard(); setViewMode("hole");', sb);
        return {
            html: vm.runInContext('document.getElementById("hole-view-card").innerHTML', sb),
            status: vm.runInContext('(ryderResolution()||{}).status', sb),
            sessionId: vm.runInContext('String((ryderResolution()||{}).sessionId)', sb)
        };
    }

    test('a round set up through the UI resolves to its session', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd1s1');
        const v = holeViewOf(roundFromWrites(sb));
        assert.equal(v.status, 'host', 'the round does not resolve to a hosted Cup');
        assert.equal(v.sessionId, 'd1s1', 'the round does not know which session it is');
    });

    test('and the alternate-shot card appears on it', () => {
        const sb = cupPage();
        setUpClassic(sb, 'd1s1');
        assert.match(holeViewOf(roundFromWrites(sb)).html, /fs-card/,
            'the whole chain is wired and a golfer still cannot enter a score');
    });

    test('a Four-Ball session set up the same way gets no card', () => {
        const sb = cupPage();
        run(sb, 'rcOpenClassic();');
        run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"B"); rcToggle(104,"B");');
        run(sb, 'rcSeedSession("d1s2");');
        run(sb, 'rcSetPlaysSession("d1s2"); rcSave();');
        const v = holeViewOf(roundFromWrites(sb));
        assert.equal(v.sessionId, 'd1s2');
        assert.ok(!/fs-card/.test(v.html), 'Four-Ball is scored per golfer');
    });
});
