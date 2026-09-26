// ============================================================================
// 🏠 HOME LEAVES THE ROUND (Wave 14)
//
// Manny, on a group link on the scorecard: tapping 🏠 Home scrolled the page down to
// the score boxes instead of leaving the round. "🚪 Save & Return to Home" at the
// bottom of the same page worked.
//
// IT WAS NEVER AN IN-PAGE SCROLL. The pill is a plain anchor - no target, no onclick,
// no preventDefault. What happened was a ROUND TRIP, measured with a real tap on one
// round, one parameter apart:
//     bare link   ?game=X          index.html -> admin.html              LANDS
//     group link  ?game=X&group=1  index.html -> admin.html -> index.html  BOUNCES
//
// TWO CORRECT MECHANISMS CONTRADICTING EACH OTHER. The nav rewriter appends
// ?game=&group= to EVERY .nav-link, so Home became admin.html?game=X&group=1. Wave
// 189's redirectGroupScorekeeper then saw both params, concluded "a group scorekeeper
// has landed on setup" - exactly what it exists to catch - and location.replace'd back
// to the scorecard. No history entry, so it read as "nothing happened"; the page
// reloaded at the same URL and the browser restored the scroll position, which on a
// scorecard is down among the score boxes.
//
// THE REDIRECT IS NOT THE BUG and is not touched: it is a real safety rule and it
// cannot tell a deliberate Home tap from the case it guards. The fix is that Home stops
// carrying the round at all - Home means the home screen, and Save & Return already
// navigates to a bare admin.html from the same page.
//
// AND AN EXISTING GUARD ASSERTED THE CAUSE. nav_bar_test.js required every nav href to
// end in ?game=...&group=..., Home included - the very parameter that broke it. That
// assertion is re-pointed to exempt Home, with the reason inline.
//
// SEVEN PAGES, because all seven carry the Home pill as a .nav-link and all seven run
// the same rewriter. Over four golfers everyone gets a group link, so this is the common
// case rather than an edge.
//
// THE FIXTURE IS A FOURSOME, deliberately: on a bare link to a MULTI-group round the
// group picker covers the nav bar at z-index 999 and, once answered, converts the bare
// link into a group link - so a bare link on such a round cannot stay bare and the
// comparison would not be a comparison.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// Every page that carries the bar AND rewrites it. admin.html rewrites too, but a group
// scorekeeper never sees its bar - redirectGroupScorekeeper sends them away at parse.
const PAGES = ['index.html', 'leaderboard.html', 'settlement.html', 'skins.html',
    'sidematches.html', 'game.html', 'stats.html'];

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
// A FOURSOME: one group, so no picker stands between the tap and the pill.
const ROUNDS = {
    W14HOME: {
        eventName: 'Wave 14', gameFormat: 'stroke',
        players: ['Ann', 'Ben', 'Cal', 'Dee'].map((n, i) => ({
            id: 101 + i, name: n, hcp: '10', playingForMoney: true })),
        courseData: CD, scores: {}, settlementMode: 'whole-dollar',
    },
};

const READ = `(function () {
    var a = [].slice.call(document.querySelectorAll('.top-nav-item'))
        .filter(function (x) { return /Home/.test(x.innerText || ''); })[0];
    return JSON.stringify({
        at: location.pathname.split('/').pop() + location.search,
        homeHref: a ? a.getAttribute('href') : null,
        pickerShown: (function () {
            var o = document.getElementById('group-pick-overlay');
            return !!(o && getComputedStyle(o).display !== 'none');
        })()
    });
})();`;

// Tapped, not read. The whole point is where the browser ENDS UP.
async function tapHome(page, search) {
    const r = await arriveCold({
        url: fileUrl(page, search), rounds: ROUNDS, settleMs: 2800,
        viewport: { width: 390, height: 844 },
        steps: [
            { expression: READ },
            { tap: '.top-nav-item.nav-link[href*="admin.html"]' },
            { sleep: 2000 },
            { expression: READ },
        ],
    });
    assert.equal(r.ok, true, page + ': the arrival failed, so NOTHING is proven: ' + r.reason);
    const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
    const chain = (r.requests || []).map(u => u.split('/').pop().split('?')[0])
        .filter(u => /\.html$/.test(u));
    return { before: objs[0], after: objs[objs.length - 1], chain, finalUrl: String(r.finalUrl || '') };
}

const results = {};

describe('A TAP ON 🏠 HOME LANDS ON THE LOBBY, FROM EVERY PAGE, ON A GROUP LINK', () => {
    before(async () => {
        for (const pg of PAGES) {
            results[pg] = await tapHome(pg, 'game=W14HOME&group=1');
        }
    }, { timeout: 300000 });

    PAGES.forEach(pg => {
        test(pg + ': the tap leaves the round', () => {
            const r = results[pg];
            // POSITIVE FIRST: the page rendered its bar and the picker was not in the way,
            // or the tap proves nothing about the pill.
            assert.ok(r.before, pg + ': no measurement before the tap');
            assert.equal(r.before.pickerShown, false,
                pg + ': the group picker covered the bar, so the tap did not reach the pill');
            assert.ok(r.before.homeHref, pg + ': no Home pill found');

            // THE CLAIM. Not how the href looks - where the browser ended up.
            assert.match(r.finalUrl, /admin\.html/,
                pg + ': Home did not land on admin.html. chain: ' + r.chain.join(' -> ')
                + '  final: ' + r.finalUrl);
            assert.ok(!/[?&]group=/.test(r.finalUrl),
                pg + ': Home landed carrying a group, which is what bounces it back. final: '
                + r.finalUrl);
            assert.ok(!/[?&]game=/.test(r.finalUrl),
                pg + ': Home landed carrying the round. Home means the lobby - the same place '
                + 'Save & Return goes. final: ' + r.finalUrl);
            // AND IT DID NOT BOUNCE: admin.html must be the LAST page requested.
            assert.equal(r.chain[r.chain.length - 1], 'admin.html',
                pg + ': the navigation bounced. chain: ' + r.chain.join(' -> '));
        });
    });

    test('the bounce is really gone - no page is requested twice', () => {
        // The old shape was index -> admin -> index. Naming it so a future rewriter that
        // re-adds a param cannot pass by landing on admin.html after a detour.
        PAGES.forEach(pg => {
            const chain = results[pg].chain;
            assert.ok(chain.length <= 2,
                pg + ': more than one navigation happened: ' + chain.join(' -> '));
        });
    });
});

describe('THE SOURCE: HOME IS EXEMPT FROM THE ROUND PARAMETERS, ON ALL SEVEN', () => {
    test('every rewriter leaves the Home pill alone', () => {
        PAGES.concat(['admin.html']).forEach(f => {
            const src = read(f);
            const at = src.indexOf("querySelectorAll('.nav-link')");
            assert.ok(at > -1, f + ' has no nav rewriter');
            const fn = src.slice(at, src.indexOf('});', at) + 3);
            assert.ok(fn.length > 80, f + ': the rewriter could not be sliced');
            // It must name admin.html as the exception, and say so.
            assert.match(fn, /admin\.html/,
                f + ": the rewriter does not exempt Home, so it will carry the round again");
        });
    });

    test('and redirectGroupScorekeeper is untouched - it is the safety rule, not the bug', () => {
        const src = read('admin.html');
        const at = src.indexOf('function redirectGroupScorekeeper');
        assert.ok(at > -1, 'redirectGroupScorekeeper is gone');
        const fn = src.slice(at, src.indexOf('})();', at) + 5);
        assert.match(fn, /if \(!gameParam \|\| !groupParam\) return;/,
            'the guard clause changed - it must still bail without BOTH params');
        assert.match(fn, /loc\.replace\(/, 'it no longer redirects');
        assert.match(fn, /index\.html\?game=/, 'it no longer sends a scorekeeper to their card');
    });
});
