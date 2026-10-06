// ============================================================================
// THE PUBLIC BOARD IS FOR WATCHING; THE PRIZE AMOUNTS ARE SAVED
// (Tournaments Wave 1, A3 + A4 + A7)
//
// A3. There was no link for a watcher - openShareModal knew "Signup" and
//     "Scorecard" only - and the Leaderboard tab every visitor sees doubled as
//     the scoring-link handout: every team's link and QR, the print buttons, an
//     editable payout calculator. Now there is a "Share live leaderboard"
//     control for everyone, and the organizer's half of the tab is HIDDEN for
//     anyone who is not the owner. Hidden in the tree, never removed (the
//     f0fa56f rule): the rows still render underneath, so a sign-in shows them
//     without a reload and the live board keeps moving.
// A4. Prize amounts lived only in the DOM. They vanished on reload, and every
//     other phone saw the pool split evenly over the spots - a payout nobody
//     chose. The owner now writes tournaments/<code>/payoutSpots on each edit;
//     every screen reads it; a watcher sees the amounts read-only, or "Payouts
//     not set yet." when there are none.
// A7. On an individual event the "Team Scorecard Links" heading and paragraph
//     stayed on screen over nothing (only the list was hidden); the tee sheet
//     button offered a team sheet that alerted "No teams yet"; and group links
//     had no Share, QR or copy.
//
// WHAT mini-dom CAN AND CANNOT PROVE. It has no layout and does not parse
// innerHTML, so "a watcher SEES 0 links" cannot be measured here - only that
// the block holding them is display:none and that they are inside it. The
// visible count is measured in Chrome by tools/tournament-spectator-check.js,
// which counts rendered links, QR images and inputs for a signed-out visitor,
// a signed-in stranger and the owner.
//
// BASELINE over the FINISHED file, all 13 tests: measured against 7a83916 (A1
// and A2 committed, this wave's A3/A4/A7 not), tournament.html swapped back and
// restored by sha from a saved copy:
//
//   2 PASS / 11 FAIL / 13 tests.   2 + 11 = 13.
//
// THE TWO THAT PASS: "the owner sees the whole organizer half" (the base page
// showed everything to everybody, so it shows it to the owner too) and "a
// non-owner calling the save writes nothing" (on the base the save did not
// exist, so it threw before writing - vacuous there, kept for what it catches
// later: a save that forgets the owner check).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CODE = 'WATCH1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };

function scores(team, strokes) {
    const out = {};
    for (let h = 1; h <= 18; h++) out[`team${team}_h${h}`] = strokes;
    return out;
}
function teamEvent(extra) {
    return Object.assign({
        name: 'Charity Classic', format: 'scramble', courseName: 'Cameron Park', courseData: COURSE,
        entryFee: 300, createdAt: 1, ownerUid: OWNER.uid,
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 },
            team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 },
            team3: { num: 3, name: 'Owls', players: ['Cal'], handicap: 0 }
        },
        scores: Object.assign({}, scores(1, 3), scores(2, 4), scores(3, 5))
    }, extra || {});
}
function individualEvent() {
    return { name: 'Club Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'Cameron Park',
        courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: OWNER.uid,
        players: { p1: { id: 'p1', name: 'Ann', handicap: '4' }, p2: { id: 'p2', name: 'Bo', handicap: '8' } },
        scoringGroups: { g1: { name: 'Dawn', playerIds: ['p1', 'p2'], createdAt: 1 } } };
}

function arrive(rec, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });
    sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + CODE + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const shown = (e) => e && e.style.display !== 'none';
// The markup's own handler for a control, run as the click would run it.
const SRC = fs.readFileSync('tournament.html', 'utf8');
function clickById(sb, id) {
    const m = new RegExp('id="' + id + '"[^>]*onclick="([^"]+)"').exec(SRC);
    assert.ok(m, 'no onclick on #' + id + ' in the markup');
    vm.runInContext(m[1].replace(/&quot;/g, '"'), sb);
}

describe('A3. a watch link, for everyone', () => {
    test('"Share live leaderboard" opens the board url, titled as a leaderboard link', () => {
        const sb = arrive(teamEvent(), null);
        assert.ok(shown(el(sb, 'lb-watch-share')), 'the watch control is hidden from a watcher');
        clickById(sb, 'lb-watch-share');
        assert.match(el(sb, 'share-link-text').textContent, /tournament\.html\?tourney=WATCH1$/);
        assert.match(el(sb, 'share-modal-title').textContent, /Charity Classic — Leaderboard Link/);
    });
});

describe('A3. the organizer half is hidden, not removed, for anyone else', () => {
    [['signed out', null], ['signed in as a stranger', STRANGER]].forEach(([who, user]) => {
        test(`${who}: links, QRs, print and calculator are inside hidden blocks`, () => {
            const sb = arrive(teamEvent(), user);
            assert.equal(el(sb, 'lb-owner-tools').style.display, 'none', 'links/QR/print block is showing');
            assert.equal(el(sb, 'payout-owner-controls').style.display, 'none', 'the calculator is showing');
            // Hidden, NOT removed: the rows are still built underneath.
            assert.equal((html(sb, 'team-links-list').match(/class="team-qr"/g) || []).length, 3);
            assert.equal((html(sb, 'team-links-list').match(/data-share-url=/g) || []).length, 3);
            assert.ok(SRC.indexOf('id="lb-owner-tools"') < SRC.indexOf('id="team-links-list"')
                && SRC.indexOf('id="team-links-list"') < SRC.indexOf('id="group-links-list"')
                && SRC.indexOf('printTournamentTeeSheet()">') > SRC.indexOf('id="lb-owner-tools"'),
                'the links, group links and print buttons must sit inside #lb-owner-tools');
        });
    });

    test('the owner sees the whole organizer half', () => {
        const sb = arrive(teamEvent(), OWNER);
        assert.ok(shown(el(sb, 'lb-owner-tools')));
        assert.ok(shown(el(sb, 'payout-owner-controls')));
        assert.equal((html(sb, 'team-links-list').match(/class="team-qr"/g) || []).length, 3);
    });
});

describe('A4. the prize amounts are saved, and everyone reads them', () => {
    test('the owner typing an amount writes payoutSpots, as numbers', () => {
        const sb = arrive(teamEvent(), OWNER);
        el(sb, 'payout-spots-input').value = '3';
        vm.runInContext('renderPayoutSpotInputs()', sb);
        ['500', '300', '100'].forEach((v, i) => { el(sb, 'payout-spot-' + i).value = v; });
        vm.runInContext('savePayoutSpots()', sb);   // the inputs' onchange
        const w = sb.__dbWrites.filter((x) => /payoutSpots/.test(x.path));
        assert.equal(w.length, 1);
        assert.equal(w[0].path, 'tournaments/WATCH1/payoutSpots');
        assert.equal(JSON.stringify(w[0].value), '[500,300,100]');
    });

    test('a reload shows the owner what was saved, not an even split', () => {
        const sb = arrive(teamEvent({ payoutSpots: [500, 300, 100] }), OWNER);
        assert.equal(String(el(sb, 'payout-spots-input').value), '3');
        const boxes = html(sb, 'payout-spot-amounts');
        ['500', '300', '100'].forEach((v, i) => assert.match(boxes, new RegExp(`id="payout-spot-${i}"[^>]*value="${v}"`)));
    });

    test('a watcher reads the saved amounts, read-only, and the payouts by standing', () => {
        const sb = arrive(teamEvent({ payoutSpots: [500, 300, 100] }), null);
        const pub = html(sb, 'payout-public-amounts');
        assert.match(pub, /1st \$500\.00 · 2nd \$300\.00 · 3rd \$100\.00/);
        assert.doesNotMatch(pub, /<input/);
        const res = html(sb, 'payout-results');
        assert.match(res, /1st — Eagles<\/span><span class="val-pos">\$500\.00/);
        assert.match(res, /3rd — Owls<\/span><span class="val-pos">\$100\.00/);
    });

    test('nothing saved: a watcher reads "Payouts not set yet." and no invented split', () => {
        const sb = arrive(teamEvent(), null);   // $300 x 3 teams = $900 pool
        assert.match(html(sb, 'payout-public-amounts'), /Payouts not set yet\./);
        assert.doesNotMatch(html(sb, 'payout-public-amounts') + html(sb, 'payout-results'), /\$300\.00/);
    });

    test('nothing saved: the owner’s boxes are blank, not pool / spots', () => {
        const sb = arrive(teamEvent(), OWNER);
        // mini-dom does not parse the markup's value="3" on the spots box (see
        // CLAUDE.md), so it reads ''. Seed what a browser would hold, then run
        // the box's own oninput. Chrome sees the default unseeded.
        el(sb, 'payout-spots-input').value = '3';
        vm.runInContext('renderPayoutSpotInputs()', sb);
        const boxes = html(sb, 'payout-spot-amounts');
        assert.equal((boxes.match(/id="payout-spot-\d+"/g) || []).length, 3, 'the boxes did not render');
        // The old default lived in the builder itself; mini-dom hands back an
        // empty value for a box it never parsed, so it could not reach that
        // branch at runtime. The source is the live half here; Chrome
        // (tools/tournament-spectator-check.js) measures the boxes on arrival.
        const fn = SRC.slice(SRC.indexOf('function renderPayoutSpotInputs('), SRC.indexOf('function renderPayoutResults('));
        assert.ok(fn.length > 200, 'the builder slice is empty');
        assert.doesNotMatch(fn, /pool \/ n/, 'the even split is back in the builder');
        assert.doesNotMatch(boxes, /value="300"/);
        assert.equal((boxes.match(/value=""/g) || []).length, 3);
    });

    test('a non-owner calling the save writes nothing', () => {
        const sb = arrive(teamEvent(), STRANGER);
        try { vm.runInContext("document.getElementById('payout-spot-0') && (document.getElementById('payout-spot-0').value = '999'); savePayoutSpots()", sb); } catch (e) { /* base page: no such function */ }
        assert.deepEqual(sb.__dbWrites.filter((x) => /payoutSpots/.test(x.path)), []);
    });

    test('at most 20 spots are read, however many are stored', () => {
        const many = Array.from({ length: 25 }, () => 10);
        const sb = arrive(teamEvent({ payoutSpots: many }), null);
        const pub = html(sb, 'payout-public-amounts');
        assert.match(pub, /20th \$10\.00/);
        assert.doesNotMatch(pub, /21st/);
    });
});

describe('A7. an individual event', () => {
    test('no orphan team-links heading, no team tee sheet, and every group link has Share', () => {
        const sb = arrive(individualEvent(), OWNER);
        assert.equal(el(sb, 'team-links-block').style.display, 'none', 'the Team Scorecard Links heading is still showing');
        assert.equal(el(sb, 'print-tee-sheet-btn').style.display, 'none', 'the team tee sheet button is offered');
        const links = html(sb, 'group-links-list');
        assert.match(links, /href="[^"]*group=g1"/);
        assert.match(links, /data-share-url="[^"]*group=g1"[^>]*onclick="openShareModal\(this\.dataset\.shareUrl, this\.dataset\.shareName\)"/);
    });

    test('and a team event still has both', () => {
        // mini-dom invents any element it is asked for, so prove they exist first.
        assert.ok(SRC.includes('id="team-links-block"') && SRC.includes('id="print-tee-sheet-btn"'));
        const sb = arrive(teamEvent(), OWNER);
        assert.notEqual(el(sb, 'team-links-block').style.display, 'none');
        assert.notEqual(el(sb, 'print-tee-sheet-btn').style.display, 'none');
    });
});
