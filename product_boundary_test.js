// ============================================================================
// PRODUCT BOUNDARY — Consumer is a golfer's app, Tournament is an organizer's
//
// The two products share a repository, a Firebase project and a shared golf core,
// and ship as two deployments. What keeps them two products rather than one large
// one is ownership: who creates a record, who edits it, who is allowed to see a
// control. This suite is that ownership, written down and enforced.
//
// ---------------------------------------------------------------------------
// WHAT THE AUDIT FOUND, AND WHY THESE ARE THE ASSERTIONS
// ---------------------------------------------------------------------------
//
// The product-surface audit traced every Firebase call site rather than trusting
// names, and the result was the opposite of what everyone expected: Consumer has
// NEVER created or edited a tournament. admin.html contains no reference to the
// tournaments root at all, and trip.html's "Create a Tournament for This Trip"
// button was a one-line navigation call wearing a creation verb.
//
// So the boundary was never really violated in data. It was violated in what the
// UI claimed - a Tournament tile sitting beside Quick Round told a golfer this app
// runs tournaments. The assertions below therefore guard two different things:
//
//   * DATA OWNERSHIP, by scanning real db.ref() call sites. Cheap to state,
//     expensive to get wrong, and the thing that must never regress.
//
//   * UI OWNERSHIP, by checking the controls that exist. This is where the actual
//     drift happened and where it would happen again.
//
// ---------------------------------------------------------------------------
// ONE THING TO BE CAREFUL ABOUT
// ---------------------------------------------------------------------------
//
// Source scanning is a blunt instrument and this file leans on it, because the
// question "does this page ever write to tournaments/*" is genuinely a question
// about the source. Where behaviour can be executed instead - the link seam, the
// payout rule, the scoring contract - it is executed. Where a scan is used, it
// looks for the CALL SITE pattern, not a word that might appear in a comment.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Comments describe intent and frequently mention the other product on purpose.
// Only executable source can violate ownership, so every scan runs against a copy
// with comments removed.
function codeOf(file) {
    let src = read(file);
    if (file.endsWith('.html')) {
        src = src.replace(/<!--[\s\S]*?-->/g, '');
    }
    return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// Every Firebase path this file writes to, from the actual call sites.
function writesIn(file) {
    const code = codeOf(file);
    const out = [];
    for (const m of code.matchAll(/db\.ref\(([`'"])([^`'"]*)\1\)\s*\.\s*(set|update|remove|push)/g)) {
        out.push(m[2]);
    }
    // Multi-line chains: capture the ref path, then look ahead for a mutation.
    for (const m of code.matchAll(/db\.ref\(([`'"])([^`'"]*)\1\)([\s\S]{0,160})/g)) {
        if (/\.\s*(set|update|remove|push)\s*\(/.test(m[3])) out.push(m[2]);
    }
    return [...new Set(out)];
}

const CONSUMER_PAGES = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
                        'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
                        'shared.html', 'instructions.html'];
const TOURNAMENT_PAGES = ['tournament.html', 'tournament-scorecard.html'];

function declaredShell(name) {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(read('sync-mobile-web.js'));
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

// ===========================================================================
// 1. CONSUMER OWNS NO TOURNAMENT
// ===========================================================================

describe('CONSUMER — a golfer\u2019s app, not an organizer\u2019s', () => {

    test('1. the Tournament home tile is gone', () => {
        // It sat beside Quick Round, Club Event and Trip as a fourth mode, which told
        // a golfer this app runs tournaments. It never did - it was a link.
        const admin = read('admin.html');
        assert.ok(!/id="hw-tournament"/.test(admin),
            'the Tournament home widget must not return - organizing an event is a different product');
        assert.ok(!/selectHomeWidget\('tournament'\)"/.test(admin),
            'no home tile may invoke the tournament branch');
    });

    test('1b. the three Consumer modes are still there', () => {
        // Removing a tile must not quietly remove its neighbours.
        const admin = read('admin.html');
        ['hw-quick', 'hw-club', 'hw-trip'].forEach(id =>
            assert.match(admin, new RegExp('id="' + id + '"'), id + ' must remain a Consumer mode'));
    });

    test('1c. Club Event is untouched and still a Consumer round', () => {
        // Club Event looks like a tournament and is not one: it runs the round engine
        // with different framing copy and writes events/*, never tournaments/*.
        const admin = codeOf('admin.html');
        assert.match(admin, /selectedEventType = 'quick'/);
        assert.match(admin, /eventTypeFraming/);
        assert.ok(!/tournaments\//.test(admin), 'Club Event must not have grown a tournaments write');
    });

    test('2. a deliberate outbound route to the Tournament product still exists', () => {
        // Removing the tile without leaving a route would make the other product
        // undiscoverable, which is a different failure and just as bad.
        const admin = read('admin.html');
        assert.match(admin, /id="open-tournaments-link"/,
            'Consumer must keep a discoverable way to reach the Tournament product');
        assert.match(admin, /Running a tournament or charity event\?/);
        assert.ok(!/secret-master-panel[\s\S]{0,400}open-tournaments-link/.test(admin),
            'the outbound route must not be hidden behind the secret panel');
    });

    test('3. the outbound route goes through tournamentUrl()', () => {
        // A bare href works today and breaks silently the day the two deployments stop
        // sharing an origin. That is the whole reason product-links.js exists.
        const admin = codeOf('admin.html');
        assert.match(admin, /function openTournamentsApp\(\)[\s\S]{0,200}tournamentUrl\('tournament\.html'\)/);
        assert.ok(!/location\.href\s*=\s*['"`]tournament\.html/.test(admin),
            'no bare same-origin link to the Tournament product may return');
        assert.match(read('admin.html'), /<script src="product-links\.js">/);
    });

    test('3b. the stale-DOM compatibility branch survives', () => {
        // An installed PWA can still hold the old markup, and that markup calls
        // selectHomeWidget('tournament'). Sending it where the exit link goes beats a
        // tile that silently does nothing.
        const admin = codeOf('admin.html');
        assert.match(admin, /if \(type === 'tournament'\) \{ openTournamentsApp\(\); return; \}/,
            'the compatibility branch must remain for cached old markup');
    });

    test('4. Consumer admin writes nothing to the tournaments root', () => {
        const w = writesIn('admin.html');
        w.forEach(p => assert.ok(!/^tournaments\//.test(p),
            'admin.html writes to ' + p + ' - tournament data belongs to the other product'));
    });

    test('5 & 6. Consumer Trip writes neither tournaments/* nor trips/*/tournaments/*', () => {
        // The relationship record is written by the product that owns the tournament.
        const w = writesIn('trip.html');
        w.forEach(p => {
            assert.ok(!/^tournaments\//.test(p), 'trip.html writes to ' + p);
            assert.ok(!/^trips\/[^/]*\/tournaments/.test(p),
                'trip.html writes the relationship pointer at ' + p + ' - that is TournamentApp\u2019s write');
        });
        // And it does still own its own trip data, or something has been deleted.
        assert.ok(w.some(p => /^trips\//.test(p)), 'trip.html should still write its own trip data');
    });

    test('12. the Trip tournaments section is read-only', () => {
        const trip = codeOf('trip.html');
        assert.match(trip, /function renderTournamentsList\(\)/, 'the read-only list must survive');
        assert.match(trip, /tripData\.tournaments \|\| \{\}/, 'it reads from the trip snapshot');
        // No management verbs. Deleting, renaming or editing a tournament from the Trip
        // page would make Consumer an organizer again by the back door.
        ['deleteTournament', 'removeTournament', 'renameTournament', 'editTournament',
         'updateTournament', 'addTeam', 'renderTeamLinks', 'renderPayoutSpotInputs']
            .forEach(fn => assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(trip),
                'trip.html must not gain ' + fn + ' - that is organizer work'));
    });

    test('12b. the outbound Trip button tells the truth about what it does', () => {
        // It navigates. It has never created anything, and the old label said it did.
        const trip = read('trip.html');
        assert.ok(!/Create a Tournament for This Trip/.test(trip),
            'the button must not claim Consumer creates tournaments');
        assert.match(trip, /Manage in Tournaments/);
    });
});

// ===========================================================================
// 2. TOURNAMENT OWNS THE TOURNAMENT
// ===========================================================================

describe('TOURNAMENT — the only writer of tournament data', () => {

    test('7. every tournaments/* mutation in the repo lives in a Tournament page', () => {
        // The load-bearing assertion. Scanned across every production file rather than
        // the two we expect, so a write appearing somewhere new fails here.
        fs.readdirSync(REPO_ROOT)
            .filter(f => (f.endsWith('.html') || f.endsWith('.js')))
            .filter(f => !/_test\.js$|\.test\.js$/.test(f))
            .forEach(f => {
                const offending = writesIn(f).filter(p => /^tournaments\//.test(p));
                if (offending.length && !TOURNAMENT_PAGES.includes(f)) {
                    assert.fail(f + ' writes ' + offending.join(', ') + ' - only the Tournament product may');
                }
            });
        // And the ownership is real, not vacuous.
        assert.ok(writesIn('tournament.html').some(p => /^tournaments\//.test(p)),
            'tournament.html must still own tournament writes');
    });

    test('7b. organizer capabilities live only in tournament.html', () => {
        const t = codeOf('tournament.html');
        ['saveTournament', 'addTeam', 'saveNewTeam', 'updateTeamHandicap', 'setStartType',
         'autoAssignShotgunHoles', 'renderTeamLinks', 'renderPayoutResults', 'linkTournamentToTrip']
            .forEach(fn => assert.match(t, new RegExp('function\\s+' + fn + '\\s*\\('),
                'tournament.html must still own ' + fn));
    });

    test('8. the scorecard writes only team-scoped score keys', () => {
        const w = writesIn('tournament-scorecard.html');
        assert.ok(w.length > 0, 'the scoring page must still write scores');
        w.forEach(p => assert.match(p, /^tournaments\/\$\{currentCode\}\/scores\/team\$\{myTeamNum\}_/,
            'the scoring link may only write its own group\u2019s scores, got: ' + p));
    });

    test('23. the stored score keys are unchanged', () => {
        // UI wording may say group; storage stays team{n}. A rename here would orphan
        // every score already recorded.
        const t = codeOf('tournament-scorecard.html');
        assert.match(t, /scores\/team\$\{myTeamNum\}_h\$\{holeNum\}/);
        assert.match(t, /scores\/team\$\{myTeamNum\}_p\$\{playerIdx\}_h\$\{holeNum\}/);
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /team\$\{team\.num\}_h\$\{h\.hole\}/,
            'the engine must still read the scramble key shape');
        assert.match(eng, /team\$\{team\.num\}_p\$\{pIdx\}_h\$\{h\.hole\}/,
            'the engine must still read the per-player key shape');
    });

    test('9. the scorecard has no Consumer wagering dependency', () => {
        const src = read('tournament-scorecard.html');
        const scripts = [...src.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1].replace(/^\.\//, ''));
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'action-model.js',
         'bet-strip.js', 'hole-events.js'].forEach(f =>
            assert.ok(!scripts.includes(f), 'the scoring surface must not load ' + f));
        const code = codeOf('tournament-scorecard.html');
        ['calculateOverallBetEngine', 'calculateMatchEngine', 'computeCombinedNetTotals',
         'nassauStakeConfig', 'calcDotsEngine', 'sideMatch', 'holePresses']
            .forEach(sym => assert.ok(!new RegExp(sym).test(code),
                'the scoring surface must not reference ' + sym));
    });

    test('10. the scorecard exposes no organizer control', () => {
        const code = codeOf('tournament-scorecard.html');
        ['saveTournament', 'addTeam', 'saveNewTeam', 'setStartType', 'selectFormat',
         'renderTeamLinks', 'linkTournamentToTrip', 'renderPayoutSpotInputs',
         'updateTeamHandicap', 'autoAssignShotgunHoles', 'openShareModal']
            .forEach(fn => assert.ok(!new RegExp(fn).test(code),
                'the scoring golfer must not be given ' + fn));
        // Nor a way to walk into the organizer screens.
        assert.ok(!/tournament\.html/.test(code),
            'the scoring surface must not link into the organizer app');
    });

    test('11. the scorecard is declared Tournament-only', () => {
        const shared = declaredShell('SHARED_SHELL');
        const consumer = declaredShell('CONSUMER_SHELL');
        const tournament = declaredShell('TOURNAMENT_SHELL');
        assert.ok(tournament.includes('tournament-scorecard.html'));
        assert.ok(!consumer.includes('tournament-scorecard.html'));
        assert.ok(!shared.includes('tournament-scorecard.html'),
            'the player scoring surface belongs to the product that created the event');
    });
});

// ===========================================================================
// 3. THE RELATIONSHIP
// ===========================================================================

describe('TRIP \u2194 TOURNAMENT — one relationship, two pointers', () => {

    test('13. create-from-trip writes BOTH pointers', () => {
        // It used to write only the forward one, so a tournament created from a trip
        // showed the "link me to a trip" form as though it were unlinked.
        const t = codeOf('tournament.html');
        const save = t.slice(t.indexOf('function saveTournament'), t.indexOf('function saveTournament') + 3000);
        assert.match(save, /trips\/\$\{tripLinkCode\}\/tournaments\/\$\{currentCode\}/,
            'the forward pointer must be written');
        assert.match(save, /tournaments\/\$\{currentCode\}\/tripCode/,
            'the reverse pointer must be written on the create path too');
    });

    test('14. link-after-the-fact still writes both pointers', () => {
        const t = codeOf('tournament.html');
        const link = t.slice(t.indexOf('function linkTournamentToTrip'),
                             t.indexOf('function linkTournamentToTrip') + 1200);
        assert.match(link, /trips\/\$\{code\}\/tournaments\/\$\{currentCode\}/);
        assert.match(link, /tournaments\/\$\{currentCode\}\/tripCode/);
    });

    test('15. forward-pointer-only historical records still read as linked', () => {
        // NO MIGRATION. Records stored before the fix carry the forward pointer only,
        // and requiring tripCode offered to link them to a trip they were already in.
        const t = codeOf('tournament.html');
        assert.match(t, /function linkedTripCode\(\)[\s\S]{0,200}currentData\.tripCode \|\| tripLinkCode/,
            'the read must fall back to the forward relationship');
        assert.ok(!/if \(currentData\.tripCode\) \{\s*statusEl\.style\.display = 'block'/.test(t),
            'the status must not require tripCode');
        // And nothing rewrites the old records.
        assert.ok(!/repairTripLink|migrateTripCode|backfill/i.test(t),
            'historical records must be read, not rewritten');
    });

    test('16. both tournament.html entry points remain live', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /urlParams\.get\('tourney'\)/, '?tourney= is in shared links');
        assert.match(t, /urlParams\.get\('trip'\)/, '?trip= is how a trip hands off');
    });

    test('17. the scorecard contract remains ?tourney=X&team=N', () => {
        const s = codeOf('tournament-scorecard.html');
        assert.match(s, /urlParams\.get\('tourney'\)/);
        assert.match(s, /urlParams\.get\('team'\)/);
        // Both required, or the page must say so rather than half-render.
        assert.match(s, /if \(!currentCode \|\| !myTeamNum\)/);
    });

    test('18. scoring links stay SAME-ORIGIN inside the Tournament product', () => {
        // These are internal links, not cross-product ones. Routing them through
        // product-links.js would send a scoring golfer to the Consumer origin.
        const t = codeOf('tournament.html');
        assert.match(t, /function scorecardBaseUrl\(\)[\s\S]{0,220}replace\('tournament\.html', 'tournament-scorecard\.html'\)/);
        const linkFn = t.slice(t.indexOf('function renderTeamLinks'), t.indexOf('function renderTeamLinks') + 1400);
        assert.match(linkFn, /\$\{scorecardBaseUrl\(\)\}\?tourney=\$\{currentCode\}&team=\$\{t\.num\}/);
        assert.ok(!/consumerUrl\(`?tournament-scorecard|tournamentUrl\(`?tournament-scorecard/.test(t),
            'a scoring link must never be built through the cross-product seam');
    });

    test('19. cross-product navigation uses product-links.js in both directions', () => {
        assert.match(codeOf('admin.html'), /tournamentUrl\('tournament\.html'\)/);
        assert.match(codeOf('trip.html'), /tournamentUrl\(`tournament\.html\?trip=/);
        assert.match(codeOf('trip.html'), /tournamentUrl\(`tournament\.html\?tourney=/);
        assert.match(codeOf('tournament.html'), /consumerUrl\(`trip\.html\?trip=/);
        ['admin.html', 'trip.html', 'tournament.html'].forEach(p =>
            assert.match(read(p), /<script src="product-links\.js">/, p + ' must load the seam'));
    });

    test('19b. the seam is relative when unset and crosses when configured', () => {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(read('product-links.js'), sandbox);
        assert.equal(sandbox.tournamentUrl('tournament.html'), 'tournament.html');
        vm.runInContext("GOLF_PRODUCT_ORIGINS.tournament = 'https://t.example';", sandbox);
        assert.equal(sandbox.tournamentUrl('tournament.html'), 'https://t.example/tournament.html');
    });

    test('24. the organizer resume key is intact', () => {
        assert.match(codeOf('tournament.html'), /localStorage\.setItem\('lastTournamentCode', currentCode\)/);
    });
});

// ===========================================================================
// 4. DEPLOYMENT AND BACKEND
// ===========================================================================

describe('DEPLOYMENT — two products, one Firebase project', () => {

    test('20 & 21. neither shell declares the other product\u2019s pages', () => {
        const consumer = declaredShell('CONSUMER_SHELL');
        const tournament = declaredShell('TOURNAMENT_SHELL');
        TOURNAMENT_PAGES.forEach(p => assert.ok(!consumer.includes(p), p + ' must not be Consumer'));
        CONSUMER_PAGES.forEach(p => assert.ok(!tournament.includes(p), p + ' must not be Tournament'));
        assert.ok(!tournament.includes('tournament-engine.js') === false,
            'tournament-engine.js is Tournament-owned');
    });

    test('22. both products use the same Firebase project', () => {
        const ids = ['index.html', 'tournament.html', 'tournament-scorecard.html', 'trip.html']
            .map(p => /projectId:\s*"([^"]+)"/.exec(read(p))[1]);
        ids.forEach(id => assert.equal(id, 'golfapp-9fb21',
            'a deployment split must not become a backend split'));
    });

    test('22b. the Firebase roots are unchanged', () => {
        const rules = JSON.parse(read('database.rules.json')).rules;
        ['events', 'trips', 'tournaments', 'global_courses', 'app_settings'].forEach(root =>
            assert.ok(root in rules, 'the ' + root + ' root must survive a product-boundary batch'));
    });
});
