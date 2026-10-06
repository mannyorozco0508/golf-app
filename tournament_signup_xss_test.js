// ============================================================================
// A PUBLIC SIGNUP CANNOT PUT LIVE MARKUP ON THE BOARD (Tournaments Wave 1, A1)
//
// tournament.html?register=CODE is open to anyone with the link, and the rules
// accept any fullName / teamPreference up to 120 characters. The desk itself
// always escaped (escReg). The hole was AFTER Approve: approveRegistration
// copies the golfer's name into the field and the team preference into a team
// name, and every surface that renders the field interpolated them raw - the
// public team rows (and the name inside the Share button's onclick string), the
// leaderboard, the payout lines, the group links, the printed results, and the
// golfer's own card. The organizer is signed in on that page.
//
// THE PATH IS THE USER'S. Each case delivers a signup to the owner's desk
// through the page's own registrations listener, presses Approve the way the
// row's button does, feeds the writes the page sent back through the page's own
// tournament listener, and then reads what each surface rendered. Nothing here
// renders by hand. (The print sheet is built by its builder, which is exactly
// what the Print button calls before window.print.)
//
// WHAT mini-dom CAN AND CANNOT PROVE. innerHTML is a string here, so these
// assertions read the markup the page produced, not a parsed DOM. That is the
// right level for "is the angle bracket escaped": a live <img> exists only if
// the raw characters reach innerHTML. It cannot prove an onerror would have
// fired; no assertion here claims that.
//
// EVERY BLOCK HAS A POSITIVE ASSERTION. "no <img" is true of an empty string,
// so each surface must also show the escaped name, which proves it rendered.
//
// BASELINE over the FINISHED file, all 8 tests: measured against rattle-registration-desk
// 732194e, tournament.html and tournament-scorecard.html swapped back to that
// commit and restored by sha from a saved copy:
//
//   1 PASS / 7 FAIL / 8 tests.   1 + 7 = 8.
//
// THE ONE THAT PASSES is the premise test - it reads the stored record, which
// Approve always wrote verbatim. It is green on purpose: escaping belongs at
// the output, and storage must stay exactly what the golfer typed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { applyWrites } = require('./helpers/tournament-write-apply.js');

const CODE = 'XSS1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const EVIL_NAME = '<img src=x onerror=alert(1)>Mallory';
const EVIL_TEAM = '<b>Hawks</b>"\'<svg/onload=alert(2)>';

const LIVE = /<img|<svg|<b>/i;
const SHOWN_NAME = /&lt;img src=x onerror=alert\(1\)&gt;Mallory/;
const SHOWN_TEAM = /&lt;b&gt;Hawks&lt;\/b&gt;/;

function teamEvent() {
    return { name: 'Charity Classic', format: 'scramble', courseName: 'Cameron Park',
        activeCourseKey: 'cameron', courseData: COURSE, entryFee: 100, createdAt: 1, ownerUid: 'u-org',
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha'], handicap: 0 } } };
}
function individualEvent() {
    return { name: 'Club Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'Cameron Park',
        activeCourseKey: 'cameron', courseData: COURSE, entryFee: 50, createdAt: 1, ownerUid: 'u-org',
        players: { p1: { id: 'p1', name: 'Ann Alpha', handicap: '4', addedAt: 1 } } };
}

function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((x) => x.event === 'value' && re.test(x.path));
    assert.ok(hs.length > 0, 'no listener for ' + re);
    hs.forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(value)), exists: () => value != null }));
}

// The owner's page, a signup on the desk, Approve pressed, the writes echoed back.
function approvedIntoField(rec, entry) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });
    fire(sb, new RegExp('tournaments/' + CODE + '$'), rec);
    sb.__auth.setUser(ORGANIZER);
    fire(sb, new RegExp('registrations/' + CODE + '$'), { e1: entry });
    const desk = String(sb.document.getElementById('registration-list').innerHTML || '');
    assert.match(desk, /approveRegistration\('e1'\)/, 'the desk offered no Approve for the signup');
    vm.runInContext("approveRegistration('e1')", sb);
    const after = applyWrites(JSON.parse(JSON.stringify(rec)), sb.__dbWrites, 'tournaments/' + CODE);
    fire(sb, new RegExp('tournaments/' + CODE + '$'), after);
    return { sb, rec: after };
}
const html = (sb, id) => String(sb.document.getElementById(id).innerHTML || '');

describe('A1. a team signup approved into a new team', () => {
    const entry = { fullName: EVIL_NAME, teamPreference: EVIL_TEAM, email: 'm@example.com', createdAt: 10 };

    test('the approve really carried both strings into the record (the premise)', () => {
        const { rec } = approvedIntoField(teamEvent(), entry);
        const team = Object.values(rec.teams).find((t) => t.num !== 1);
        assert.ok(team, 'Approve wrote no new team: ' + JSON.stringify(rec.teams));
        assert.equal(team.name, EVIL_TEAM, 'stored text must be exactly what was typed - escape at output, never in storage');
        assert.deepEqual(team.players, [EVIL_NAME]);
    });

    test('public team rows: name and roster escaped, and no name inside an onclick', () => {
        const { sb } = approvedIntoField(teamEvent(), entry);
        const rows = html(sb, 'team-links-list');
        assert.match(rows, SHOWN_TEAM);
        assert.match(rows, SHOWN_NAME);
        assert.doesNotMatch(rows, LIVE);
        const onclicks = rows.match(/onclick="[^"]*"/g) || [];
        assert.ok(onclicks.length >= 2, 'expected a Share button per team');
        onclicks.forEach((o) => assert.doesNotMatch(o, /Hawks|Eagles|Mallory/, 'a name is inside a handler: ' + o));
    });

    test('Setup team cards and the leaderboard are escaped', () => {
        const { sb } = approvedIntoField(teamEvent(), entry);
        const cards = html(sb, 'team-cards-list');
        assert.match(cards, SHOWN_TEAM); assert.doesNotMatch(cards, LIVE);
        const board = html(sb, 'leaderboard-list');
        assert.match(board, SHOWN_TEAM); assert.doesNotMatch(board, LIVE);
    });

    test('the printed results sheet is escaped', () => {
        const { sb } = approvedIntoField(teamEvent(), entry);
        vm.runInContext('buildResultsPrintView()', sb);
        const sheet = html(sb, 'tournament-print-view');
        assert.match(sheet, SHOWN_TEAM); assert.doesNotMatch(sheet, LIVE);
    });

    test('the golfer’s team card is escaped', () => {
        const { rec } = approvedIntoField(teamEvent(), entry);
        const num = Object.values(rec.teams).find((t) => t.num !== 1).num;
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: `?tourney=${CODE}&team=${num}` });
        try { fire(sb, new RegExp('tournaments/' + CODE + '$'), rec); }
        catch (e) { if (!/querySelectorAll|content/.test(String(e.message))) throw e; }
        const who = html(sb, 'scoring-for') + html(sb, 'team-roster');
        assert.match(who, SHOWN_TEAM); assert.match(who, SHOWN_NAME); assert.doesNotMatch(who, LIVE);
    });
});

describe('A1. an individual signup approved into the field', () => {
    const entry = { fullName: EVIL_NAME, email: 'm@example.com', createdAt: 10 };

    test('the field, the board and the group links are escaped', () => {
        const { sb, rec } = approvedIntoField(individualEvent(), entry);
        const pid = Object.keys(rec.players).find((k) => rec.players[k].name === EVIL_NAME);
        assert.ok(pid, 'Approve put nobody in the field');
        const field = html(sb, 'player-field-list');
        assert.match(field, SHOWN_NAME); assert.doesNotMatch(field, LIVE);
        const board = html(sb, 'leaderboard-list');
        assert.match(board, SHOWN_NAME); assert.doesNotMatch(board, LIVE);
        rec.scoringGroups = { g1: { name: '<b>Dawn</b>', playerIds: [pid], createdAt: 1 } };
        fire(sb, new RegExp('tournaments/' + CODE + '$'), rec);
        const links = html(sb, 'group-links-list');
        assert.match(links, SHOWN_NAME); assert.match(links, /&lt;b&gt;Dawn/); assert.doesNotMatch(links, LIVE);
    });

    test('the golfer’s group card is escaped', () => {
        const { rec } = approvedIntoField(individualEvent(), entry);
        const pid = Object.keys(rec.players).find((k) => rec.players[k].name === EVIL_NAME);
        rec.scoringGroups = { g1: { name: '<b>Dawn</b>', playerIds: [pid], createdAt: 1 } };
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: `?tourney=${CODE}&group=g1` });
        try { fire(sb, new RegExp('tournaments/' + CODE + '$'), rec); }
        catch (e) { if (!/querySelectorAll|content/.test(String(e.message))) throw e; }
        const who = html(sb, 'scoring-for') + html(sb, 'team-roster');
        assert.match(who, /&lt;b&gt;Dawn/); assert.match(who, SHOWN_NAME); assert.doesNotMatch(who, LIVE);
    });
});

describe('A1. both pages load the one shared escaper', () => {
    test('text-safe.js is declared before the inline script on both pages', () => {
        const fs = require('fs');
        ['tournament.html', 'tournament-scorecard.html'].forEach((p) => {
            const src = fs.readFileSync(p, 'utf8');
            const tag = src.indexOf('<script src="text-safe.js"></script>');
            const inline = src.indexOf('<script>');
            assert.ok(tag > 0, p + ' does not load text-safe.js');
            assert.ok(tag < inline, p + ' loads text-safe.js after its inline script');
        });
    });
});
