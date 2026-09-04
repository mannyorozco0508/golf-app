// ============================================================================
// SKINS VIEW HONESTY — the Bets tab must describe the round it is actually in
//
// This page reads three round-ROOT fields (skinsBuyIn, skinsPotFormat,
// skinsCarryOver) and renders one game from them. Settlement pays from
// getRoundGames(). Those two agree in exactly ONE case: when Skins is the
// round's main format, because there the game's config IS the round root.
//
// Everywhere else they diverge, and the page was the one telling the story:
//
//   SCOPED / POOL   A participant-scoped Skins wager, or a Money Pool skins
//                   bucket, leaves the root buy-in at 0. The page rendered a
//                   $0 pot and an empty ledger for wagers that settle real
//                   money, so the golfers in them read it as "nobody won".
//
//   LEFTOVER        admin.html's saveSettings() reads #skins-buyin whether or
//                   not the Skins box is showing, so choosing Skins, setting
//                   $5, going Back and switching to Stroke Play saves
//                   gameFormat 'stroke' WITH skinsBuyIn 5. getRoundGames()
//                   yields no skins game, settlement pays nothing - and this
//                   page paid the leader $10.00. Two answers about money in
//                   one round.
//
// LEFTOVER_PAYS_NOBODY is therefore the test that matters most here. It fails
// against the shipped behaviour with a concrete dollar figure on screen.
//
// What is NOT being changed: no engine, no settlement path, no stake field. The
// page decides what to SAY. Whether admin.html should stop writing a buy-in for
// a round that is not playing Skins is a separate question about saved data.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const PAGE = 'skins.html';

function render(data) {
    const sb = loadHtmlInlineScript(PAGE);
    sb.__testData = data;
    // A real round code, so a link that forgets to carry it is visible as a
    // missing 'ABCD' rather than passing on an empty query string.
    vm.runInContext('currentMode = "ABCD"; currentData = __testData;', sb);
    vm.runInContext('renderSkinsEngine();', sb);
    const id = (x) => sb.document.getElementById(x);
    return {
        sb,
        content: String(id('skins-content').innerHTML || ''),
        cardHidden: id('skins-card').style.display === 'none',
        configHidden: id('skins-config-grid').style.display === 'none'
                   && id('skins-config-carry').style.display === 'none'
    };
}

// A finished two-golfer round. A beats B on every hole, so a real round-wide
// Skins game here has a clear winner and a non-zero payout - which is what makes
// the "no ledger" assertions below meaningful rather than vacuous.
function round(extra) {
    const players = makePlayers(['A', 'B'], [0, 0]);
    const cd = makeCourseData(18);
    const scores = {};
    cd.forEach(h => {
        scores[`p${players[0].id}_h${h.hole}`] = 3;
        scores[`p${players[1].id}_h${h.hole}`] = 4;
    });
    return Object.assign({ players, courseData: cd, scores, gameFormat: 'stroke' }, extra || {});
}

const scopedSkins = (players) => ({
    '-NscopedA': {
        format: 'skins', skinsBuyIn: 20, skinsPotFormat: 'gross',
        skinsCarryOver: true, startHole: 1,
        participantIds: [players[0].id, players[1].id]
    }
});

const LEDGER = /Payout Ledger/;

describe('skins.html — STATE 1: Skins is the round-wide game', () => {

    test('the ledger this page has always drawn still draws', () => {
        const r = render(round({ gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross' }));
        assert.ok(!r.cardHidden, 'A round-wide Skins game must show its card.');
        assert.match(r.content, LEDGER, 'The round-wide ledger must survive.');
        assert.ok(!r.configHidden, 'This is the one game these controls legitimately edit.');
    });

    test('a second Skins game elsewhere in the round is disclosed, not hidden', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const r = render(round({
            players,
            gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross',
            additionalGameInstances: scopedSkins(players)
        }));
        assert.match(r.content, LEDGER, 'The round-wide ledger still belongs here.');
        // A bare settlement.html match would pass vacuously - the ledger already
        // carries a Receipt button - so the disclosure needs its own wording.
        assert.match(r.content, /not shown here/i,
            'The other Skins game must be disclosed in words, not merely linked.');
        assert.match(r.content, /1 other Skins game/i,
            'The disclosure must say how many, and be singular for one.');
    });
});

describe('skins.html — STATE 2: Skins exists but this view cannot represent it', () => {

    test('a participant-scoped wager gets a disclosure, never an empty ledger', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const r = render(round({ players, skinsBuyIn: 0, additionalGameInstances: scopedSkins(players) }));
        assert.ok(!r.cardHidden, 'The wager is real; the card stays.');
        assert.doesNotMatch(r.content, LEDGER,
            'A $0 round-wide ledger describes a game nobody is playing.');
        assert.match(r.content, /settlement\.html/, 'Point at the Receipt, which itemises it.');
        assert.ok(r.configHidden,
            'These controls do not edit the scoped wager, so they must not be offered.');
    });

    test('a Money Pool skins bucket gets the same treatment', () => {
        const r = render(round({
            skinsBuyIn: 0,
            moneyPool: { enabled: true, skins: { mode: 'gross', carryOver: true } }
        }));
        assert.ok(!r.cardHidden);
        assert.doesNotMatch(r.content, LEDGER,
            'Pool skins settle through the pool, not through this page\'s pot arithmetic.');
        assert.match(r.content, /settlement\.html/);
        assert.ok(r.configHidden);
    });
});

describe('skins.html — STATE 3: a leftover buy-in attached to no game', () => {

    // THE ONE THAT MATTERS. Shipped behaviour renders a full ledger paying the
    // leader $10.00 on this exact round, while settlement pays zero.
    test('LEFTOVER_PAYS_NOBODY: no ledger, no winnings, and the reason is stated', () => {
        const r = render(round({ gameFormat: 'stroke', skinsBuyIn: 5, skinsPotFormat: 'gross' }));

        assert.doesNotMatch(r.content, LEDGER,
            'There is no Skins game here - a payout ledger is fiction.');
        assert.doesNotMatch(r.content, /Total Won/,
            'Nobody won anything; the winnings table must not render.');
        assert.doesNotMatch(r.content, /\$10\.00/,
            'This is the exact figure the shipped page invented.');
        assert.match(r.content, /Round Setup|not set up|isn't attached|is not attached/i,
            'The organizer needs to be told why, and where to fix it.');
        assert.ok(r.configHidden,
            'The buy-in box is how this state is created; do not offer it again.');
    });

    test('the card is explained rather than silently removed', () => {
        const r = render(round({ gameFormat: 'stroke', skinsBuyIn: 5 }));
        assert.ok(!r.cardHidden,
            'Hiding it leaves an organizer wondering where their buy-in went.');
        assert.ok(r.content.trim().length > 0, 'An empty card explains nothing.');
    });
});

// Links written during render cannot use the one-time .nav-link rewrite that runs
// at boot: by the time Firebase calls back with the round, that pass has already
// finished. The shipped Receipt button was injected this way and therefore went to
// settlement.html with NO round code, landing the golfer on a page that has no idea
// which round they were reading.
describe('skins.html — every link carries the round it came from', () => {

    test('the ledger Receipt button keeps the round code', () => {
        const r = render(round({ gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross' }));
        assert.match(r.content, /settlement\.html\?game=ABCD/,
            'The Receipt button dropped the round.');
    });

    test('a disclosure link keeps the round code', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const r = render(round({ players, skinsBuyIn: 0, additionalGameInstances: scopedSkins(players) }));
        assert.match(r.content, /settlement\.html\?game=ABCD/,
            'The disclosure sent the golfer to a round-less Receipt.');
    });
});

describe('skins.html — the states are wired to real markup', () => {

    test('the config controls have the handles the states toggle', () => {
        const fs = require('fs');
        const path = require('path');
        const { REPO_ROOT } = require('./helpers/load-script.js');
        const html = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
        // mini-dom mints an element for any id asked of it, so a renamed control
        // would leave the toggles driving phantom nodes and every test above green.
        assert.match(html, /id="skins-config-grid"/);
        assert.match(html, /id="skins-config-carry"/);
    });
});
