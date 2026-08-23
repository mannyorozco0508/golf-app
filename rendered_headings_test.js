// ============================================================================
// RENDERED HEADINGS — no escaped Unicode may reach a golfer's screen
//
// THE BUG THIS CATCHES
// The Group Action section heading shipped as:
//
//     '\\uD83C\\uDFC6 Group ' + lockedGroup + ' Action'
//
// One backslash too many. In JavaScript that is a literal backslash followed by
// "uD83C", not the trophy. Every multi-group scorecard rendered:
//
//     \uD83C\uDFC6 Group 1 Action
//
// WHY THE EXISTING SUITE MISSED IT
// The tests around it asserted the SOURCE contained the right text - they
// matched on "Group ' + lockedGroup + ' Action'" and never looked at the emoji.
// A source-string assertion cannot see rendering. So this file renders the real
// Action Center through the real production function and reads what a golfer
// would actually see.
//
// The escaped-Unicode sweep at the bottom is deliberately broader than the one
// bug: any heading built with a mis-escaped emoji anywhere in the panel fails
// here, whether or not anyone remembered to write a test for it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
const NAMES = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'];

const TROPHY = '\uD83C\uDFC6';   // U+1F3C6, as a surrogate pair — what SHOULD render

// Renders the Action Center exactly as the scorecard does, panel open, and hands
// back the HTML a golfer's browser would receive.
function renderActionCenter(count, groupParam, extra) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const cd = makeCourseData(18);
    const names = NAMES.slice(0, count);
    const p = makePlayers(names, names.map(() => 0));
    const scores = {};
    cd.forEach(h => p.forEach((pl, i) => { scores[`p${pl.id}_h${h.hole}`] = 4 + ((i + h.hole) % 3); }));
    const groupMap = {};
    p.forEach((pl, i) => { groupMap[pl.id] = Math.floor(i / 4) + 1; });

    const data = Object.assign(
        { gameFormat: 'stroke', players: p, courseData: cd, scores, sideMatches: {} },
        extra || {});

    vm.runInContext(`
        db.ref = function () { return {
            set: function () { return Promise.resolve(); },
            remove: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); },
            push: function () { return { key: 'k' }; }, on: function () {}
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
        selectedGroup = ${groupParam === null ? "'all'" : groupParam};
        actionCenterOpen = true;
        groupGamesOpen = true;
        renderActionCenter();
    `, sb);

    return sb.document.getElementById('action-center-mount').innerHTML || '';
}

const GROUP_DOTS = {
    d1: { format: 'dots', enabled: true, dotPointVal: 5, scope: 'group', ownerGroup: 1,
          participantIds: ['101', '102', '103', '104'] },
    d2: { format: 'dots', enabled: true, dotPointVal: 10, scope: 'group', ownerGroup: 2,
          participantIds: ['105', '106', '107', '108'] }
};
const DOTS_EVENTS = { h5: { p101: ['birdie'], p105: ['birdie'] } };

// Every way a mis-escaped emoji shows up on screen. The first two are what the
// shipped bug actually produced; the rest catch neighbouring mistakes.
const ESCAPE_LEAKS = ['\\uD83C', '\\uDFC6', 'uD83C', 'uDFC6', '\\u2694', '\\uFE0F', '\\uD83D'];

function assertNoEscapeLeak(html, label) {
    ESCAPE_LEAKS.forEach(bad => {
        assert.ok(!html.includes(bad),
            `${label}: the literal text "${bad}" reached the UI — an emoji escape has one backslash too many`);
    });
}

// ---------------------------------------------------------------------------
describe('GROUP ACTION HEADING — rendered, not grepped', () => {
    test('a group scorekeeper sees a real trophy, not an escape sequence', () => {
        const html = renderActionCenter(8, 1, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(html.includes(TROPHY + ' Group 1 Action'),
            'the heading must render as "\uD83C\uDFC6 Group 1 Action"');
        assertNoEscapeLeak(html, 'Group 1 scorecard');
    });

    test('the heading names the viewing group, not another one', () => {
        const html = renderActionCenter(8, 2, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(html.includes(TROPHY + ' Group 2 Action'));
        assert.ok(!html.includes('Group 1 Action'));
        assertNoEscapeLeak(html, 'Group 2 scorecard');
    });

    test('a one-group round renders the general "Group Games" heading', () => {
        const html = renderActionCenter(4, null, {
            additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5 } },
            dots: { h5: { p101: ['birdie'] } } });
        assert.ok(html.includes(TROPHY + ' Group Games'),
            'the organizer / single-group wording must render as "\uD83C\uDFC6 Group Games"');
        assertNoEscapeLeak(html, 'one-group scorecard');
    });

    test('the organizer on a multi-group round also gets a real trophy', () => {
        const html = renderActionCenter(8, null, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(html.includes(TROPHY + ' Group Games'));
        assertNoEscapeLeak(html, 'organizer scorecard');
    });
});

// ---------------------------------------------------------------------------
describe('NO ESCAPED UNICODE ANYWHERE IN THE ACTION CENTER', () => {
    // Deliberately broader than the single bug: every state the panel can be in.
    const states = [
        ['Group 1, own dots', 8, 1, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS }],
        ['Group 2, own dots', 8, 2, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS }],
        ['organizer, both groups', 8, null, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS }],
        ['one group', 4, null, { additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5 } } }],
        ['group with a side match', 8, 1, { sideMatches: {
            m: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1,
                 scope: 'group', ownerGroup: 1, teamAIds: ['101'], teamBIds: ['102'] } } }],
        ['group with a cross-group match', 8, 1, { sideMatches: {
            x: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1,
                 scope: 'cross', teamAIds: ['101'], teamBIds: ['105'] } } }],
        ['group with no action at all', 8, 2, {}]
    ];

    states.forEach(([label, count, group, extra]) => {
        test(`${label}: renders no literal escape sequences`, () => {
            const html = renderActionCenter(count, group, extra);
            // A group with nothing riding on the round renders an EMPTY panel on
            // purpose - no empty boxes, no fake $0 rows. That is a pass here: there
            // is no text, so there is no escape sequence in it either.
            assertNoEscapeLeak(html, label);
            // A stray backslash-u before four hex digits is the shape of this bug in
            // general, whatever the codepoint.
            assert.ok(!/\\u[0-9A-Fa-f]{4}/.test(html),
                `${label}: rendered output contains a raw \\uXXXX escape`);
        });
    });

    test('the states above genuinely rendered something to inspect', () => {
        // Guards the sweep from passing vacuously: if renderActionCenter silently
        // returned '' everywhere, every assertion above would hold and prove nothing.
        const withAction = states.filter(([, c, g, e]) => renderActionCenter(c, g, e).length > 0);
        assert.ok(withAction.length >= 5,
            `only ${withAction.length} states produced output - the sweep would be vacuous`);
    });
});

// ---------------------------------------------------------------------------
describe('THE FIX DID NOT DISTURB THE PANEL', () => {
    test('Group 1 still sees its own dots row and not Group 2\'s', () => {
        const html = renderActionCenter(8, 1, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(/Dots/.test(html), 'the group\'s own wager still renders');
        assert.ok(html.includes('Group 1 Action'));
    });

    test('Group 2 still sees its own action', () => {
        const html = renderActionCenter(8, 2, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(/Dots/.test(html));
        assert.ok(html.includes('Group 2 Action'));
    });

    test('+ ADD GROUP ACTION still renders with its group and link', () => {
        const html = renderActionCenter(8, 1, { additionalGameInstances: GROUP_DOTS, dots: DOTS_EVENTS });
        assert.ok(html.includes('+ ADD GROUP 1 ACTION'));
        assert.ok(/sidematches\.html\?game=ABCD&group=1&add=1/.test(html));
    });

    test('a cross-group match is still shown to an involved group', () => {
        const html = renderActionCenter(8, 1, { sideMatches: {
            x: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1,
                 scope: 'cross', teamAIds: ['101'], teamBIds: ['105'] } } });
        assert.ok(/Marty|Stan/.test(html), 'the cross-group match must still appear');
    });
});
