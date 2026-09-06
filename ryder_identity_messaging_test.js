// ============================================================================
// A CUP THAT REFUSES MUST SAY WHAT IS WRONG AND WHAT TO DO
//
// Wave 2a taught the resolver to refuse rather than name the wrong golfers. It
// refuses correctly and it refuses silently: the scorecard rendered
//
//     "Cup unavailable - scoring is unaffected."
//
// which is true, and useless. A golfer on Day 2 got no Cup, no cause, and no
// idea that a name on a different round was the reason. That is the same
// silent-absence shape as every other defect in this feature - the app knew
// exactly what was wrong and did not say it.
//
// TWO HALVES, and the second is the one that makes the first rare.
//
//   THE SCORECARD NAMES THE CAUSE. Not just the identity refusal - all three
//   unusable states go through one builder, because "the host round would not
//   load" is exactly as silent as a duplicate name and shares the card.
//
//   AND THE CUP CANNOT BE BUILT ON NAMES THAT MEAN NOTHING. Save refuses a Cup
//   whose members are unnamed or share a name. This is where it is cheap: the
//   organizer is looking at the roster, on the round where the names are typed,
//   before anybody has played a hole. Discovering it on Day 2 means driving back
//   to a screen you are not on.
//
// SCORING IS NEVER BLOCKED. Not by a refusal, not by a message, not by a Save
// that will not go through. That line is absolute: the Cup is a competition
// played ON TOP of a round, and a golfer who cannot see it must still be able to
// put a number on a hole.
//
// PLACEHOLDER NAMES ARE NOT NAMES. The app saves a blank field as "Player 3", so
// two rounds of unnamed golfers carry an identical set of names and matching on
// them pairs people by position - the exact bug names exist to fix.
//
// WHAT MINI-DOM CANNOT PROVE. It has no layout, and the host round here is
// supplied rather than fetched. What a golfer actually SEES on a round that
// fetched its own host over the network is asserted in a real browser by
// tools/cross-round-identity-check.js, which arrives cold and reads the rendered
// card.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const SM_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
    'ryder-cup.js'];
const SM_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const HOST = [{ id: 101, name: 'Marty Sharp', hcp: '8' }, { id: 102, name: 'Manny Orozco', hcp: '4' },
              { id: 103, name: 'Lance Webb', hcp: '15' }, { id: 104, name: 'Zach Hill', hcp: '0' }];
// The same four, in a different order - all it takes to break positional ids.
const AWAY = [{ id: 101, name: 'Zach Hill', hcp: '0' }, { id: 102, name: 'Lance Webb', hcp: '15' },
              { id: 103, name: 'Manny Orozco', hcp: '4' }, { id: 104, name: 'Marty Sharp', hcp: '8' }];
const BLANK = [{ id: 101, name: 'Player 1' }, { id: 102, name: 'Player 2' },
               { id: 103, name: 'Player 3' }, { id: 104, name: 'Player 4' }];
const TWO_MIKES = [{ id: 101, name: 'Mike Dunne' }, { id: 102, name: 'Mike Dunne' },
                   { id: 103, name: 'Lance Webb' }, { id: 104, name: 'Zach Hill' }];

const CUP = {
    v: 1, name: 'Myrtle Cup',
    sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
    members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
    sessions: { d1s2: { id: 'd1s2', day: 1, order: 2, format: 'fourball', label: 'Day 1 Four-Ball' } },
    matches: { m1: { id: 'm1', sessionId: 'd1s2', format: 'fourball', scoring: 'net',
                     sideA: 'A', sideB: 'B', playersA: ['101', '102'], playersB: ['103', '104'] } }
};

let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));
const call = e => vm.runInContext(e, page());

// Drives the REAL card renderer with the REAL globals it reads: the round being
// played, and whatever the host loader put in __ryderHostCup.
function card(awayPlayers, hostPlayers, opts) {
    const o = opts || {};
    const host = hostPlayers === null ? null
        : { players: hostPlayers, courseData: CD, scores: {},
            ryderCup: o.hostNoCup ? undefined : JSON.parse(JSON.stringify(CUP)) };
    return call('(function(){'
        + 'currentData = ' + JSON.stringify({ players: awayPlayers, courseData: CD, scores: {},
            ryderCupRef: { host: 'HOSTRD', sessionId: 'd1s2' } }) + ';'
        + 'currentMode = "AWAYRD";'
        + 'window.__scFilteredPlayers = null;'
        + '__ryderHostCup = ' + JSON.stringify(host) + ';'
        + 'return renderRyderCupHtml();'
        + '})()');
}
const text = h => String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('THE SCORECARD SAYS WHY THERE IS NO CUP', () => {

    test('a duplicate name is named, in the spelling the golfers use', () => {
        const t = text(card(TWO_MIKES, TWO_MIKES));
        assert.match(t, /Mike Dunne/,
            'the card does not say which name is ambiguous: ' + t);
        assert.ok(!/mike dunne/.test(t),
            'the card prints the internal lowercased key instead of the real name');
    });

    test('and says what is actually wrong with it', () => {
        assert.match(text(card(TWO_MIKES, TWO_MIKES)), /tell them apart/i);
    });

    test('placeholder names are explained, not just rejected', () => {
        const t = text(card(BLANK, BLANK));
        assert.match(t, /no name|not a name/i, 'the card does not say the names are the problem: ' + t);
        assert.match(t, /Player/, 'it does not show what a placeholder looks like');
    });

    test('the card says WHERE to fix it', () => {
        assert.match(text(card(BLANK, BLANK)), /HOSTRD/,
            'the golfer is not told which round holds the Cup');
    });

    // A pointer to a round that would not load is exactly as silent as a bad name.
    test('a host round that could not be loaded says so', () => {
        const t = text(card(AWAY, null));
        assert.match(t, /HOSTRD/, 'it does not name the round it needed');
        assert.ok(!/^Cup unavailable/.test(t), 'still the generic sentence: ' + t);
    });

    test('a host round whose Cup was removed says so', () => {
        const t = text(card(AWAY, HOST, { hostNoCup: true }));
        assert.match(t, /HOSTRD/);
        assert.match(t, /no longer|removed/i, 'it does not say the Cup is gone: ' + t);
    });

    test('EVERY refusal still says scoring is unaffected', () => {
        [card(TWO_MIKES, TWO_MIKES), card(BLANK, BLANK),
         card(AWAY, null), card(AWAY, HOST, { hostNoCup: true })].forEach(h => {
            assert.match(text(h), /scoring is unaffected/i,
                'a golfer was left thinking the round was broken: ' + text(h));
        });
    });

    test('and every refusal is still a Cup card, not a bare sentence', () => {
        [card(TWO_MIKES, TWO_MIKES), card(BLANK, BLANK), card(AWAY, null)].forEach(h => {
            assert.match(h, /rc-card/, 'the refusal lost its card');
            assert.match(h, /RYDER CUP/, 'the refusal does not say what it is about');
        });
    });

    // The whole point of 2a: when it CAN resolve, it says nothing and shows the Cup.
    test('a Cup that resolves shows no explanation at all', () => {
        const h = card(AWAY, HOST);
        assert.ok(!/could not|no name|tell them apart/i.test(text(h)),
            'a working Cup is apologising for itself: ' + text(h));
        assert.match(text(h), /Rattle|Chaos/, 'the working Cup did not render its sides');
    });

    test('no round with a Cup ever renders an empty card', () => {
        [[TWO_MIKES, TWO_MIKES], [BLANK, BLANK], [AWAY, null], [AWAY, HOST]].forEach(a => {
            assert.ok(text(card(a[0], a[1])).length > 0,
                'a round pointing at a Cup rendered nothing at all');
        });
    });
});

// ---------------------------------------------------------------------------
function cupPage() {
    const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS, { search: '?game=IDG' });
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
        currentMode = 'IDG';
        isOrganizerView = function () { return true; };
    `, sb);
    return sb;
}
const run = (sb, e) => vm.runInContext(e, sb);
const probs = sb => run(sb, 'document.getElementById("rc-problems").innerHTML');
const wrote = sb => JSON.parse(run(sb, 'JSON.stringify(window.__written.map(w=>w.path))'));

// Builds a Classic Cup the way an organizer does, on a given roster.
function build(players) {
    const sb = cupPage();
    run(sb, 'currentData = ' + JSON.stringify({ players: players, courseData: CD, scores: {} }) + ';');
    run(sb, 'rcOpenClassic();');
    players.forEach((p, i) => run(sb, `rcToggle(${p.id},'${i % 2 === 0 ? 'A' : 'B'}')`));
    run(sb, 'rcSeedSession("d1s1"); rcSetPlaysSession("d1s1"); rcSave();');
    return sb;
}

describe('A CUP CANNOT BE BUILT ON NAMES THAT MEAN NOTHING', () => {

    test('a roster of real names saves', () => {
        const sb = build(HOST);
        assert.ok(wrote(sb).some(p => /ryderCup$/.test(p)),
            'a perfectly good Cup was refused: ' + probs(sb));
    });

    test('placeholder names refuse the save', () => {
        const sb = build(BLANK);
        assert.ok(!wrote(sb).some(p => /ryderCup$/.test(p)),
            'a Cup was built on golfers called "Player 1"');
    });

    test('and says which name is the problem', () => {
        assert.match(probs(build(BLANK)), /Player 1|name every golfer/i,
            'it refused without saying what to fix: ' + probs(build(BLANK)));
    });

    test('duplicate names refuse the save', () => {
        const sb = build(TWO_MIKES);
        assert.ok(!wrote(sb).some(p => /ryderCup$/.test(p)),
            'a Cup was built on two golfers who cannot be told apart');
    });

    test('and names the duplicate', () => {
        assert.match(probs(build(TWO_MIKES)), /Mike Dunne/);
    });

    // A golfer on the round but NOT in the Cup is not the Cup's business.
    test('an unnamed golfer OUTSIDE the Cup does not block it', () => {
        const roster = HOST.concat([{ id: 105, name: 'Player 5' }]);
        const sb = cupPage();
        run(sb, 'currentData = ' + JSON.stringify({ players: roster, courseData: CD, scores: {} }) + ';');
        run(sb, 'rcOpenClassic();');
        HOST.forEach((p, i) => run(sb, `rcToggle(${p.id},'${i % 2 === 0 ? 'A' : 'B'}')`));
        run(sb, 'rcSeedSession("d1s1"); rcSetPlaysSession("d1s1"); rcSave();');
        assert.ok(wrote(sb).some(p => /ryderCup$/.test(p)),
            'a golfer who is not in the Cup blocked it: ' + probs(sb));
    });

    // THE LINE THAT IS NOT NEGOTIABLE.
    test('a refused save leaves the whole draft on screen to fix', () => {
        const sb = build(BLANK);
        assert.equal(run(sb, 'rcDraft === null'), false,
            'the draft was thrown away, so the organizer must start again');
        assert.equal(run(sb, 'Object.keys(rcDraft.members).length'), 4,
            'the sides were lost with the refusal');
        assert.ok(run(sb, '(rcDraft.matches||[]).length') > 0, 'the lineup was lost');
    });

    // ONE DEFINITION. The rule for what a name is lives in action-model.js and is
    // what the RESOLVER uses. A local copy here would be free to drift, and a Cup
    // could pass this gate and still be refused on Day 2 - the precise failure the
    // gate exists to prevent. Missing helpers must refuse loudly, not wave it
    // through: a guard that quietly stops guarding is worse than no guard.
    test('it does not carry its own copy of the placeholder rule', () => {
        const at = SM_SRC.indexOf('function rcIdentityProblems');
        const body = SM_SRC.slice(at, SM_SRC.indexOf('function rcSave'));
        assert.ok(!/\/\^player/.test(body),
            'the placeholder rule is reimplemented here and can drift from the resolver');
        assert.match(body, /normalisePlayerName/, 'it does not use the shared normaliser');
    });

    test('and if the shared rule is missing it refuses rather than waving it through', () => {
        const sb = cupPage();
        run(sb, 'currentData = ' + JSON.stringify({ players: BLANK, courseData: CD, scores: {} }) + ';');
        run(sb, 'isPlaceholderPlayerName = undefined;');
        run(sb, 'rcOpenClassic();');
        BLANK.forEach((p, i) => run(sb, `rcToggle(${p.id},'${i % 2 === 0 ? 'A' : 'B'}')`));
        run(sb, 'rcSeedSession("d1s1"); rcSetPlaysSession("d1s1"); rcSave();');
        assert.ok(!wrote(sb).some(p => /ryderCup$/.test(p)),
            'the names went unchecked and the Cup saved anyway');
        assert.match(probs(sb), /reload/i, 'it refused without saying what to do');
    });

    test('and nothing at all was written', () => {
        assert.deepEqual(Array.from(wrote(build(BLANK))), [],
            'a refused save still touched the database');
    });
});
