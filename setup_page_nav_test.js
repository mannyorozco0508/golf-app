// ============================================================================
// GETTING BACK OUT, AND ARRIVING ON THE JOB
//
// TWO CHANGES, ONE WAVE.
//
// 1. A BACK CONTROL on the two action-setup pages. Matches and Bets are both
//    reached FROM somewhere - the scorecard, Game Day, a shared link - and
//    neither offered a way back to it. The nav bar lists destinations, not a
//    return. instructions.html already had the pattern and it is reused rather
//    than reinvented: history.back() when the referrer is this app, and a fall
//    back to admin.html for a cold link or a bookmark, so the button is never a
//    dead end.
//
// 2. THE SIDE-MATCHES BLOCK IS GONE FROM THE CUP ARRIVAL, not collapsed.
//    v61 collapsed it behind a summary line. That was still the wrong shape: an
//    organizer sent by Game Day to build a Cup does not need side betting on the
//    screen in any form, and side action already lives in the More tab where it
//    always has. Collapsing left a heading, a chevron and a tap target for
//    something nobody arriving to build a Cup wants.
//
//    So the whole collapse apparatus from v61 is removed with it - the <details>
//    wrapper, its summary, the CSS, the sessionStorage remembering, and the
//    smBlockReady guard that existed only to stop a parse-time toggle poisoning
//    that stored state. None of it has a purpose once the block is simply absent
//    on arrival and untouched otherwise. Dead machinery kept "just in case" is
//    how a page accumulates behaviour nobody can explain.
//
// WITHOUT ?setup=ryder NOTHING CHANGES. An ordinary visit to Matches shows the
// side-matches card exactly as it always did, un-collapsed and un-wrapped.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SM_SRC = read('sidematches.html');
const SKINS_SRC = read('skins.html');

const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
           { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

// Arrives the way a browser does - real query string, and the page's OWN value
// handler fired with round data. No render function is called by name.
function arrive(setupParam) {
    const search = '?game=ARRIVE' + (setupParam ? '&setup=ryder' : '');
    const sb = loadHtmlInlineScript('sidematches.html', DEPS, { search: search });
    vm.runInContext('alert = function () {}; isOrganizerView = function () { return true; };', sb);
    const round = { players: P, courseData: CD, scores: {} };
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(round)) }));
    return sb;
}

const run = (sb, e) => vm.runInContext(e, sb);
const cardShown = sb => run(sb, '(function(){var c=document.getElementById("sidematches-card");'
    + 'return c ? (c.style.display !== "none") : null;})()');

// EXTENDED AFTER THE WAVE ABOVE. Matches and Bets got a back control; the other
// pages a golfer is SENT to during a round had none at all - Final Results is
// reached from a button on Matches, Stats and the Leaderboard from the nav bar,
// and a Trip from the Home tile. Every one of them was a dead end: the nav bar
// lists destinations, not a return.
//
// The round-setup WIZARD was already covered and is not touched here. All seven
// steps carry a Back, and the first step's is hidden rather than dead, because
// any step can be first now and the button follows the workflow.
const PAGES_WITH_BACK = [
    { file: 'sidematches.html', backs: 1 },
    { file: 'skins.html', backs: 1 },
    { file: 'settlement.html', backs: 1 },
    { file: 'stats.html', backs: 1 },
    { file: 'leaderboard.html', backs: 1 },
    // Two screens, two dead ends. Giving only the first a way back is the
    // "just some" problem this wave exists to fix.
    { file: 'trip.html', backs: 2 }
];

describe('A WAY BACK OUT — EVERY PAGE THAT IS SENT TO', () => {

    PAGES_WITH_BACK.forEach(p => {
        const src = read(p.file);

        test(p.file + ' offers a back control on every screen it has', () => {
            assert.equal((src.match(/class="back-btn"/g) || []).length, p.backs,
                p.file + ' has the wrong number of back controls');
        });

        test(p.file + ' defines goBack exactly once', () => {
            assert.equal((src.match(/function goBack\(\)/g) || []).length, 1);
            assert.match(src, /onclick="goBack\(\)"/);
        });

        test(p.file + ' back falls back to a real destination', () => {
            const fn = src.slice(src.indexOf('function goBack()'),
                                 src.indexOf('function goBack()') + 400);
            assert.match(fn, /document\.referrer/, 'it does not check where it came from');
            assert.match(fn, /history\.back\(\)/);
            assert.match(fn, /admin\.html/, 'a cold arrival would have nowhere to go');
        });

        // Small text on a phone is still something a thumb has to hit.
        test(p.file + ' back control is a usable touch target', () => {
            const at = src.indexOf('.back-btn {');
            assert.ok(at > -1, p.file + ' has no .back-btn rule');
            const m = /min-height:\s*(\d+)px/.exec(src.slice(at, src.indexOf('}', at)));
            assert.ok(m && Number(m[1]) >= 40,
                p.file + ' back control is below a usable touch target');
        });
    });

    test('the setup wizard already had one on every step but the first', () => {
        const admin = read('admin.html');
        const steps = [...admin.matchAll(/class="wizard-step" id="wizard-step-(\d+)"/g)]
            .map(m => ({ n: m[1], at: m.index }));
        assert.ok(steps.length >= 5, 'the wizard lost its steps');
        steps.forEach((s, i) => {
            const seg = admin.slice(s.at, i + 1 < steps.length ? steps[i + 1].at : admin.length);
            assert.match(seg, /wizard-btn-back/, 'wizard step ' + s.n + ' has no Back');
        });
        // Hidden, not absent: any step can be first, so it follows the workflow.
        assert.match(admin, /back\.style\.display = \(steps\.indexOf\(n\) === 0\) \? 'none' : ''/,
            'the first step would show a Back that goes nowhere');
    });
});

describe('A WAY BACK OUT', () => {

    ['sidematches.html', 'skins.html'].forEach(page => {
        const src = page === 'skins.html' ? SKINS_SRC : SM_SRC;

        test(page + ' offers a back control', () => {
            assert.match(src, /class="back-btn"/,
                page + ' is reached from elsewhere and offers no way back');
        });

        test(page + ' back control calls goBack', () => {
            assert.match(src, /onclick="goBack\(\)"/);
            assert.match(src, /function goBack\(\)/, 'goBack is not defined on the page');
        });

        // A cold link or a bookmark has no referrer inside the app, and
        // history.back() there either does nothing or leaves the app entirely.
        test(page + ' back falls back to a real destination', () => {
            const fn = src.slice(src.indexOf('function goBack()'),
                                 src.indexOf('function goBack()') + 400);
            assert.match(fn, /document\.referrer/, 'it does not check where it came from');
            assert.match(fn, /history\.back\(\)/);
            assert.match(fn, /admin\.html/, 'a cold arrival would have nowhere to go');
        });
    });
});

describe('THE CUP ARRIVAL HAS NO SIDE BETTING ON IT', () => {

    test('the side-matches card is not shown on ?setup=ryder', () => {
        assert.equal(cardShown(arrive(true)), false,
            'an organizer sent to build a Cup still lands on side betting');
    });

    test('the Cup surface is there instead', () => {
        assert.match(run(arrive(true), 'document.getElementById("ryder-cup-setup").innerHTML'),
            /Ryder Cup/, 'the Cup did not render on arrival');
    });

    test('an ordinary visit shows side matches exactly as before', () => {
        assert.equal(cardShown(arrive(false)), true,
            'an ordinary visit to Matches lost its side action');
    });

    test('and its content is untouched', () => {
        const sb = arrive(false);
        assert.ok(run(sb, 'document.getElementById("sidematches-list") !== null'));
        ['ADD ACTION', 'Auto-Pair Whole Field', 'Final Results'].forEach(t =>
            assert.ok(SM_SRC.includes(t), t + ' was lost'));
    });
});

describe('THE v61 COLLAPSE MACHINERY IS GONE', () => {

    // Removed with the thing it existed for. Each of these was introduced in v61
    // purely to support collapsing, and none has a purpose now.
    ['id="sm-block"', 'sm-block-summary', 'smBlockKey', 'smWriteBlockState',
     'smSetBlockOpen', 'smRememberBlockState', 'smBlockReady', 'sm-block-open:'
    ].forEach(dead => {
        test(JSON.stringify(dead) + ' is gone', () => {
            assert.ok(!SM_SRC.includes(dead),
                'collapse machinery kept after the collapse was removed');
        });
    });

    test('nothing writes view state to sessionStorage any more', () => {
        assert.ok(!/sessionStorage/.test(SM_SRC),
            'the page still remembers a preference it no longer has');
    });

    test('the side-matches card is a plain card again', () => {
        const card = SM_SRC.slice(SM_SRC.indexOf('id="sidematches-card"'));
        const head = card.slice(0, 400);
        assert.ok(!/<details/.test(head), 'the card is still wrapped in a details element');
        assert.match(head, /<h3[^>]*>.*Side Matches/,
            'the card lost its heading in the unwrap');
    });
});
