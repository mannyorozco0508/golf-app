// ============================================================================
// A MULTI-ROUND TEAM EVENT HANDS OUT ONE SET OF LINKS PER ROUND
// (Tournaments Wave 1, A2)
//
// The card refuses any multi-round link without &round, and team links never
// carried one - on the Leaderboard tab or on the printed tee sheet. So a
// multi-round scramble could be created and never scored. Teams are event-level
// (roundView carries them through), so the fix is links, not data: every round
// gets every team, labeled by round, the way group links already were.
//
// THE PATH IS THE USER'S: the record arrives through the page's own listener,
// the owner signs in, and the tee sheet is reached through the same function
// the Print Tee Sheet button calls (window.print stubbed). The golfer half
// opens the card at the URL the board handed out.
//
// tools/tournament-round-team-link-check.js is the Chrome half: it reads the
// links off a real screen, opens each one, types a score and reads back WHERE
// it was written. mini-dom cannot type into a card (holes render through a
// <template> it does not have), so the save path is Chrome's to prove.
//
// BASELINE over the FINISHED file, all 6 tests: measured against 1ca3e4a (A1
// committed, A2 not), tournament.html swapped back and restored by sha from a
// saved copy:
//
//   2 PASS / 4 FAIL / 6 tests.   2 + 4 = 6.
//
// THE TWO THAT PASS are the guards on what must NOT change: a single-round
// event's links carry no round, and an old link on a multi-round event is
// still refused. Both are green before and after by design.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CODE = 'MRT1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const TEAMS = {
    team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 },
    team2: { num: 2, name: 'Hawks', players: ['Cal', 'Dee'], handicap: 0 }
};
const round = (name, at) => ({ name, status: 'open', format: 'scramble', courseName: 'Tidewater', courseData: COURSE, createdAt: at, scores: {} });
function multi() {
    return { name: 'Two Day', format: 'scramble', eventModel: 'round-v1', courseName: 'Tidewater', entryFee: 0,
        createdAt: 1, ownerUid: OWNER.uid, teams: TEAMS,
        // Sunday written FIRST on purpose: the order must come from createdAt.
        rounds: { rSun: round('Sunday', 20), rSat: round('Saturday', 10) } };
}
function single() {
    return { name: 'One Day', format: 'scramble', courseName: 'Tidewater', courseData: COURSE, entryFee: 0,
        createdAt: 1, ownerUid: OWNER.uid, teams: TEAMS };
}

function fire(sb, rec) {
    sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + CODE + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
}
function ownerPage(rec) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });
    fire(sb, rec);
    sb.__auth.setUser(OWNER);
    return sb;
}
const shareUrls = (sb) => [...String(sb.document.getElementById('team-links-list').innerHTML)
    .matchAll(/data-share-url="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
function teeSheetUrls(sb) {
    vm.runInContext('window.print = function () {}; print = window.print; printTournamentTeeSheet();', sb);
    const sheet = String(sb.document.getElementById('tournament-print-view').innerHTML);
    return [...sheet.matchAll(/<div class="tee-url">([^<]+)<\/div>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

describe('A2. the organizer screen', () => {
    test('the Leaderboard tab has every team once per round, Saturday first', () => {
        const urls = shareUrls(ownerPage(multi()));
        assert.deepEqual(urls.map((u) => u.split('?')[1]), [
            'tourney=MRT1&team=1&round=rSat', 'tourney=MRT1&team=2&round=rSat',
            'tourney=MRT1&team=1&round=rSun', 'tourney=MRT1&team=2&round=rSun']);
    });

    test('each set is labeled with its round', () => {
        const html = String(ownerPage(multi()).document.getElementById('team-links-list').innerHTML);
        const labels = [...html.matchAll(/class="team-links-round"[^>]*>([^<]+)</g)].map((m) => m[1]);
        assert.deepEqual(labels, ['Saturday', 'Sunday']);
    });

    test('the tee sheet prints a QR per team per round, each carrying its round', () => {
        const urls = teeSheetUrls(ownerPage(multi()));
        assert.equal(urls.length, 4, 'tee sheet urls: ' + JSON.stringify(urls));
        ['team=1&round=rSat', 'team=2&round=rSat', 'team=1&round=rSun', 'team=2&round=rSun']
            .forEach((w) => assert.ok(urls.some((u) => u.endsWith(w)), 'no tee-sheet QR for ' + w));
    });

    test('a single-round event is unchanged: one link per team, no round in it', () => {
        const sb = ownerPage(single());
        const urls = shareUrls(sb);
        assert.equal(urls.length, 2);
        urls.forEach((u) => assert.doesNotMatch(u, /round=/));
        const tee = teeSheetUrls(sb);
        assert.equal(tee.length, 2);
        tee.forEach((u) => assert.doesNotMatch(u, /round=/));
    });
});

describe('A2. the golfer opening that link', () => {
    function card(query) {
        const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: '?' + query });
        try { fire(sb, multi()); } catch (e) { if (!/querySelectorAll|content/.test(String(e.message))) throw e; }
        return {
            refusal: String(sb.document.getElementById('error-detail').textContent || ''),
            who: String(sb.document.getElementById('scoring-for').innerHTML || '')
        };
    }
    test('the board’s Sunday link opens Eagles’ card, not the refusal', () => {
        const url = shareUrls(ownerPage(multi())).find((u) => /team=1&round=rSun/.test(u));
        assert.ok(url, 'the board handed out no Sunday link for team 1');
        const c = card(url.split('?')[1]);
        assert.equal(c.refusal, '');
        assert.match(c.who, /Eagles/);
    });
    test('an old link with no round is still refused, and says why', () => {
        const c = card('tourney=MRT1&team=1');
        assert.match(c.refusal, /more than one round/);
        assert.doesNotMatch(c.who, /Eagles/);
    });
});
