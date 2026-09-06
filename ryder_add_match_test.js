// ============================================================================
// A BUTTON THAT COULD ONLY MAKE RUBBISH
//
// "+ Four-Ball" and "+ Singles" sit directly above Save on the Cup card. Both
// call rcAddMatch, which pushed a match whether or not it had found anybody:
//
//     playersA: free('A'), playersB: free('B')      // no guard on empty
//
// free() draws from golfers assigned to a side and NOT already playing, and its
// "already playing" set spans every match in every session - unlike rcSeedSession,
// which scopes to the session it was tapped for. On a Classic Cup a golfer plays
// in every session, so the moment any lineup exists nobody is ever free, and those
// two buttons become incapable of producing anything except "— vs —".
//
// That is what a device check produced: two lineups set, four matches listed, two
// of them empty. Save then refused with "fourball needs 2 per side, got 0 v 0", so
// nothing reached Firebase - but the organizer was left holding a blocked Save and
// two dead entries, with nothing on screen connecting them to the button that made
// them.
//
// AND A SECOND DEFECT IN THE SAME BUTTONS, latent because the first one masked it.
// rcAddMatch files its match under RYDER_DEFAULT_SESSION, 's1'. The Classic
// schedule is d1s1, d1s2, d2s1, d2s2, d3s1. A FILLED match added this way belonged
// to no session at all: absent from every session badge, and never scored. Asking
// each Classic session for its matches after one such add returned 0 five times.
//
// TWO CHANGES, and they close it from both ends:
//
//   THE ROW IS GONE WHERE A SCHEDULE EXISTS. On a Classic Cup, Set Lineup on the
//   session IS how a match is made. A free-form adder that files into a session
//   the schedule does not contain has no correct use there.
//
//   AND IT REFUSES RATHER THAN PUSHING A BLANK. Kept for a custom Cup, where 's1'
//   is the only session and is therefore right, it now says what is short instead
//   of adding a pairing with nobody in it.
//
// HOW THIS IS TESTED. Behaviour is driven through the handler the button's own
// onclick names, and the button's presence is asserted on the markup the page
// rendered - the two halves mini-dom can prove. A REAL CLICK on the real button in
// a real browser is asserted in tools/ryder-arrival-check.js, because innerHTML
// here is a string and has no button elements to press.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
           { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

function cupPage() {
    const sb = loadHtmlInlineScript('sidematches.html', DEPS, { search: '?game=ADDM' });
    vm.runInContext(`
        window.__written = [];
        alert = function () {}; confirm = function () { return true; };
        db.ref = function (p) { return {
            set: function (v) { window.__written.push({ path: p, value: v });
                return { then: function (f) { f && f(); return { catch: function () {} }; } }; },
            on: function () {}, update: function () {},
            once: function () { return { then: function (f) {
                f && f({ val: function () { return null; } });
                return { catch: function () {} }; } }; } }; };
        currentMode = 'ADDM';
        isOrganizerView = function () { return true; };
        currentData = ${JSON.stringify({ players: P, courseData: CD, scores: {} })};
    `, sb);
    return sb;
}

const run = (sb, e) => vm.runInContext(e, sb);
const html = sb => run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
const problems = sb => run(sb, 'document.getElementById("rc-problems").innerHTML');
const matches = sb => JSON.parse(run(sb,
    'JSON.stringify((rcDraft.matches||[]).map(m=>({s:m.sessionId,f:m.format,'
    + 'a:(m.playersA||[]).length,b:(m.playersB||[]).length})))'));
const assign = sb => run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"B"); rcToggle(104,"B");');

// A Classic Cup: five sessions, Set Lineup per session.
function classic(seedFirst) {
    const sb = cupPage();
    run(sb, 'rcOpenClassic();');
    assign(sb);
    if (seedFirst) run(sb, 'rcSeedSession("d1s1");');
    return sb;
}
// A custom Cup: no schedule at all, so 's1' is the only session there is.
function custom() {
    const sb = cupPage();
    run(sb, 'rcOpen();');
    assign(sb);
    return sb;
}

describe('THE ADDER IS ABSENT WHERE IT CANNOT WORK', () => {

    test('a Classic Cup offers no "+ Four-Ball" button', () => {
        assert.ok(!/rcAddMatch\('fourball'\)/.test(html(classic())),
            'a scheduled Cup still offers a free-form adder that files into no session');
    });

    test('a Classic Cup offers no "+ Singles" button', () => {
        assert.ok(!/rcAddMatch\('singles'\)/.test(html(classic())));
    });

    test('and it is still gone once lineups exist', () => {
        assert.ok(!/rcAddMatch\(/.test(html(classic(true))));
    });

    // The row went; nothing around it did.
    test('Set Lineup, Save and the problem box all survive', () => {
        const h = html(classic());
        assert.match(h, /rcSeedSession\(/, 'Set Lineup went with the adder');
        assert.match(h, /rcSave\(\)/, 'Save went with the adder');
        assert.match(h, /id="rc-problems"/, 'the problem box went with the adder');
    });

    test('a CUSTOM Cup keeps both buttons', () => {
        const h = html(custom());
        assert.match(h, /rcAddMatch\('fourball'\)/,
            'a Cup with no schedule lost the only way it has to make a match');
        assert.match(h, /rcAddMatch\('singles'\)/);
    });
});

describe('IT NEVER CREATES A PAIRING WITH NOBODY IN IT', () => {

    test('the first press on a custom Cup pairs four golfers', () => {
        const sb = custom();
        run(sb, "rcAddMatch('fourball');");
        assert.deepEqual(Array.from(matches(sb)), [{ s: 's1', f: 'fourball', a: 2, b: 2 }]);
    });

    test('THE REPORTED BUG: the second press adds nothing', () => {
        const sb = custom();
        run(sb, "rcAddMatch('fourball');");
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb).length, 1, 'a second Four-Ball was added with nobody in it');
    });

    test('and says what is short, rather than leaving a dead entry', () => {
        const sb = custom();
        run(sb, "rcAddMatch('fourball');");
        run(sb, "rcAddMatch('fourball');");
        const p = problems(sb);
        assert.match(p, /already in a match/i,
            'the refusal does not explain why nothing happened: ' + JSON.stringify(p));
    });

    test('no press, in any sequence, ever leaves an empty side', () => {
        const sb = custom();
        for (let i = 0; i < 5; i++) run(sb, "rcAddMatch('fourball');");
        for (let i = 0; i < 5; i++) run(sb, "rcAddMatch('singles');");
        matches(sb).forEach(m => assert.ok(m.a > 0 && m.b > 0,
            'a pairing was created with an empty side: ' + JSON.stringify(m)));
    });

    test('Singles seats two here, and the third press refuses', () => {
        const sb = custom();
        run(sb, "rcAddMatch('singles');");
        run(sb, "rcAddMatch('singles');");
        assert.equal(matches(sb).length, 2, 'two golfers a side should make two Singles');
        run(sb, "rcAddMatch('singles');");
        assert.equal(matches(sb).length, 2, 'a third Singles was invented from nobody');
    });

    // SOME IS NOT ENOUGH. An empty side is the obvious failure and the easy test;
    // the one that slips through is a side with a golfer or two in it and still
    // short of a pairing. A guard that only rejects zero would build 1 v 2 here.
    test('a side with SOME free golfers, but too few, still refuses', () => {
        const sb = cupPage();
        run(sb, 'rcOpen();');
        run(sb, 'rcToggle(101,"A"); rcToggle(102,"B"); rcToggle(103,"B");');  // 1 v 2
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb).length, 0,
            'a Four-Ball was built with one golfer on a side');
        assert.match(problems(sb), /Side A has 1/,
            'the refusal does not say which side was short: ' + JSON.stringify(problems(sb)));
    });

    test('and the same when only one side runs out', () => {
        const sb = cupPage();
        run(sb, 'rcOpen();');
        run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"A");');  // 3 v 0
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb).length, 0, 'a Four-Ball was built against nobody');
        assert.match(problems(sb), /side B has 0/i);
    });

    test('every pairing that IS built is the full size for its format', () => {
        const sb = cupPage();
        run(sb, 'rcOpen();');
        run(sb, 'rcToggle(101,"A"); rcToggle(102,"A"); rcToggle(103,"A"); rcToggle(104,"B");');
        run(sb, "rcAddMatch('fourball'); rcAddMatch('singles'); rcAddMatch('singles');");
        matches(sb).forEach(m => {
            const want = m.f === 'singles' ? 1 : 2;
            assert.equal(m.a, want, m.f + ' has ' + m.a + ' on side A, wanted ' + want);
            assert.equal(m.b, want, m.f + ' has ' + m.b + ' on side B, wanted ' + want);
        });
    });

    test('with nobody assigned to a side at all, it refuses', () => {
        const sb = cupPage();
        run(sb, 'rcOpen();');            // no chips tapped
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb).length, 0, 'a match was created before anyone had a side');
        assert.match(problems(sb), /\S/, 'it refused silently');
    });

    // A refusal must leave the draft exactly as it was - the sides, the names and
    // any lineups already made are all still on screen.
    test('a refusal changes nothing else about the draft', () => {
        const sb = custom();
        run(sb, "rcAddMatch('fourball');");
        const before = run(sb, 'JSON.stringify(rcDraft.members)');
        const m = JSON.stringify(matches(sb));
        run(sb, "rcAddMatch('fourball');");
        assert.equal(run(sb, 'JSON.stringify(rcDraft.members)'), before, 'the sides changed');
        assert.equal(JSON.stringify(matches(sb)), m, 'the existing lineup changed');
    });
});

describe('THE PHANTOM SESSION IS CLOSED', () => {

    // The button is gone, but the handler is a global on the page. Anything that
    // still reaches it must not file a match into a session the schedule has never
    // heard of - that match would be invisible in every badge and never scored.
    test('reached on a scheduled Cup, it refuses instead of filing into s1', () => {
        const sb = classic();
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb).length, 0,
            'a match was filed into a session the Classic schedule does not contain');
    });

    test('and points at the control that does work', () => {
        const sb = classic();
        run(sb, "rcAddMatch('fourball');");
        assert.match(problems(sb), /Set Lineup/i,
            'the refusal does not say what to do instead');
    });

    test('a custom Cup still files into s1, which is correct there', () => {
        const sb = custom();
        run(sb, "rcAddMatch('fourball');");
        assert.equal(matches(sb)[0].s, 's1',
            'the custom Cup lost the only session it has');
    });

    test('every Classic match still belongs to a real session', () => {
        const sb = classic();
        run(sb, 'rcSeedSession("d1s1"); rcSeedSession("d1s2");');
        run(sb, "rcAddMatch('fourball'); rcAddMatch('singles');");
        const ids = JSON.parse(run(sb, 'JSON.stringify(Object.keys(rcDraft.sessions))'));
        matches(sb).forEach(m => assert.ok(ids.indexOf(m.s) !== -1,
            'match filed under "' + m.s + '", which is not on the schedule'));
    });
});

describe('SAVE IS NO LONGER BLOCKED BY SOMETHING THE PAGE INVENTED', () => {

    test('a Classic Cup with two lineups saves', () => {
        const sb = classic();
        run(sb, 'rcSeedSession("d1s1"); rcSeedSession("d1s2");');
        run(sb, 'rcSetPlaysSession("d1s1"); rcSave();');
        const written = JSON.parse(run(sb, 'JSON.stringify(window.__written.map(w=>w.path))'));
        assert.ok(written.some(p => /ryderCup$/.test(p)),
            'the Cup did not save: ' + problems(sb));
    });

    // The exact device sequence: two lineups, then the adder pressed twice. With
    // the adder gone there is nothing to press, so Save is clean.
    test('and pressing the handler twice in between does not block it', () => {
        const sb = classic();
        run(sb, 'rcSeedSession("d1s1"); rcSeedSession("d1s2");');
        run(sb, "rcAddMatch('fourball'); rcAddMatch('fourball');");
        run(sb, 'rcSetPlaysSession("d1s1"); rcSave();');
        const written = JSON.parse(run(sb, 'JSON.stringify(window.__written.map(w=>w.path))'));
        assert.ok(written.some(p => /ryderCup$/.test(p)),
            'Save is still blocked by matches nobody asked for: ' + problems(sb));
    });

    test('what saved contains no empty pairing', () => {
        const sb = classic();
        run(sb, 'rcSeedSession("d1s1"); rcSeedSession("d1s2");');
        run(sb, "rcAddMatch('fourball');");
        run(sb, 'rcSetPlaysSession("d1s1"); rcSave();');
        const cup = JSON.parse(run(sb, 'JSON.stringify((window.__written'
            + '.filter(w=>/ryderCup$/.test(w.path))[0]||{}).value||null)'));
        assert.ok(cup, 'nothing saved');
        Object.keys(cup.matches).forEach(k => {
            assert.ok((cup.matches[k].playersA || []).length > 0
                   && (cup.matches[k].playersB || []).length > 0,
                'an empty pairing reached Firebase: ' + k);
        });
    });
});
