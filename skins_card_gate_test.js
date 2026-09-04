// ============================================================================
// SKINS CARD GATE — the Bets tab must not invent a game that isn't being played
//
// skins.html rendered its Skins card unconditionally. Open a round where nobody
// is playing Skins and the page still drew a buy-in box, a carry-over toggle and
// a "Final Payout Ledger" — a complete, plausible, entirely fictional game. The
// Birdie card on the same page has always gated itself on birdieGameEnabled;
// Skins simply never did.
//
// WHY THE PREDICATE MATTERS MORE THAN THE GATE. The obvious gate is
// `skinsBuyIn > 0`, and it is wrong. A round created through the real setup flow
// can carry its Skins in moneyPool.skins, or as a participant-scoped wager in
// additionalGameInstances, with the round-root buy-in still sitting at 0. A
// hand-rolled check hides a game that is genuinely being played and settled.
// That is strictly worse than the bug being fixed, so it gets its own test:
// SCOPED_SKINS_IS_NOT_HIDDEN below fails against any root-field-only gate.
//
// The gate is also only real if action-model.js is actually loaded by the page.
// The call site is guarded with `typeof roundHasSkinsGame === 'function'` so a
// missing engine degrades to today's behaviour rather than throwing — which
// means a forgotten <script> tag would leave the gate permanently inert and
// every behavioural test here still passing for the wrong reason. PREDICATE_IS_
// REACHABLE pins that down.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const PAGE = 'skins.html';
const html = () => fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');

// Boots the real page realm, installs `data` as the live round, and runs the
// real render. Returns the card and its content element so a test can ask what
// the golfer would actually see.
function render(data) {
    const sb = loadHtmlInlineScript(PAGE);
    sb.__testData = data;
    vm.runInContext('currentData = __testData;', sb);
    vm.runInContext('renderSkinsEngine();', sb);
    return {
        sb,
        card: sb.document.getElementById('skins-card'),
        content: String(sb.document.getElementById('skins-content').innerHTML || '')
    };
}

const hidden = (card) => card.style.display === 'none';

// A plain round: two golfers, two holes, scores in, no wager of any kind.
function baseRound(extra) {
    const players = makePlayers(['A', 'B'], [0, 0]);
    const cd = makeCourseData(2);
    const scores = {};
    cd.forEach(h => {
        scores[`p${players[0].id}_h${h.hole}`] = 3;
        scores[`p${players[1].id}_h${h.hole}`] = 4;
    });
    return Object.assign({
        players,
        courseData: cd,
        scores,
        gameFormat: 'stroke'
    }, extra || {});
}

describe('skins.html — the Skins card only appears when Skins is being played', () => {

    test('NO_SKINS_IS_HIDDEN: a round with no Skins game draws no Skins card', () => {
        const { card, content } = render(baseRound());
        assert.ok(hidden(card),
            'A round with no Skins wager still rendered the Skins card.');
        assert.equal(content, '',
            'The payout ledger must be cleared, not merely covered by a hidden parent.');
    });

    test('NO_SKINS_IS_HIDDEN: an explicit $0 buy-in is not a game', () => {
        const { card } = render(baseRound({ skinsBuyIn: 0 }));
        assert.ok(hidden(card),
            'skinsBuyIn: 0 means nobody bought in — that is not a Skins game.');
    });

    test('ROUND_WIDE_SKINS_IS_SHOWN: the legacy round-wide game still renders', () => {
        const { card, content } = render(baseRound({ skinsBuyIn: 5, skinsPotFormat: 'gross' }));
        assert.ok(!hidden(card),
            'A real round-wide Skins game must still show its card.');
        assert.match(content, /Payout Ledger/,
            'The ledger this page has always drawn must survive the gate.');
    });

    // THE NEGATIVE CONTROL. Root buy-in is 0, so any gate written against the
    // round-root fields hides this card — while settlement pays the wager out
    // regardless. A golfer in a scoped Skins game would open the Bets tab and be
    // told, in effect, that their money does not exist.
    test('SCOPED_SKINS_IS_NOT_HIDDEN: a participant-scoped wager keeps the card', () => {
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        const round = baseRound({
            players,
            skinsBuyIn: 0,
            additionalGameInstances: {
                '-Nabc123': {
                    format: 'skins',
                    skinsBuyIn: 20,
                    skinsPotFormat: 'gross',
                    skinsCarryOver: true,
                    startHole: 1,
                    participantIds: [players[0].id, players[1].id]
                }
            }
        });
        const { card } = render(round);
        assert.ok(!hidden(card),
            'A scoped Skins game exists and settles; the Bets tab must not deny it.');
    });

    // Same shape, the other storage model. A Money Pool is not a "game" in
    // getRoundGames() terms, which is exactly why hand-rolled predicates kept
    // answering "no skins" on rounds that were settling net skins.
    test('POOL_SKINS_IS_NOT_HIDDEN: a Money Pool skins bucket keeps the card', () => {
        const round = baseRound({
            skinsBuyIn: 0,
            moneyPool: { enabled: true, skins: { mode: 'gross', carryOver: true } }
        });
        const { card } = render(round);
        assert.ok(!hidden(card),
            'A Money Pool round settles skins; the Bets tab must not deny it.');
    });
});

describe('skins.html — the gate is wired to something real', () => {

    test('PREDICATE_IS_REACHABLE: the page loads the engine holding roundHasSkinsGame', () => {
        // The call site degrades quietly when the engine is absent, so a missing
        // script tag would make every test above pass while the gate never ran.
        const sb = loadHtmlInlineScript(PAGE);
        assert.equal(typeof sb.roundHasSkinsGame, 'function',
            'skins.html must declare action-model.js, or the gate is permanently inert.');
    });

    test('CARD_HAS_A_STABLE_HANDLE: the gated element exists in the markup', () => {
        // mini-dom mints an element for any id asked of it, so a renamed card
        // would leave the gate toggling a phantom node and these tests green.
        assert.match(html(), /id="skins-card"/,
            'The Skins card needs the id the gate toggles.');
    });
});
