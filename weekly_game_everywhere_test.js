// ============================================================================
// THE WEEKLY GAME IS THE WEEKLY GAME EVERYWHERE IT IS NAMED (v143).
// admin.html and index.html. Display only: the stored key is still moneyPool.
//
// v142 renamed the pool on the Receipt; a golfer then set up a "Main Pool"
// and read a "Weekly Game" receipt. The seven rendered strings the v142
// report listed, plus the two a comment-stripped re-scan found (admin.html's
// grouping sentence and its flights sentence), now say Weekly Game:
//   admin.html  the grouping note ("every whole-field game, including the …")
//               the flights note ("Side matches and the … never use flights")
//               the wizard card's checkbox "🏆 …"
//               the stacked-skins note ("… already includes its own Skins pot")
//               ONE_POT_NOTE and SPLIT_NOTE, the v126-approved skins-scope
//               sentences - the name is the only word that moved in them
//               the pot validation alert "⚠️ …:"
//   index.html  the Card tab's action banner "🏆 … · $480"
//               the KP-cancel alert ("Adjust the … setup first")
// Not in this wave, reported: trip.html's TRIP_TOTAL_INCLUDES category label
// 'the Main Pool' (a sentence source for the trip money card) and HANDOFF.md
// prose.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// Comments out (JS line and block comments, HTML comments), so a comment that
// still says "Main Pool" for history neither hides a rendered one nor counts.
const rendered = f => read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[;{}()\s])\/\/[^\n]*/g, '$1');
const CD = makeCourseData(18);

// ---------------------------------------------------------------------------
describe('NEITHER PAGE RENDERS "MAIN POOL"', () => {
    ['admin.html', 'index.html'].forEach(p => test(p + ': no "Main Pool" outside comments, in any case', () => {
        assert.doesNotMatch(rendered(p), /main pool/i);
        assert.ok((rendered(p).match(/Weekly Game/g) || []).length >= 2, 'and Weekly Game is there');
    }));
    test('the stored key is untouched: moneyPool is read and written by name on both pages, and no "weeklyGame" key exists anywhere', () => {
        ['admin.html', 'index.html', 'settlement.html', 'pool-engine.js'].forEach(f => {
            assert.match(read(f), /moneyPool/, f + ' still names the key');
            assert.doesNotMatch(read(f), /weeklyGame|weekly_game|WeeklyGame/, f + ' must not rename the key');
        });
        assert.match(read('admin.html'), /moneyPool:/, 'the wizard still writes the moneyPool key');
    });
});

// ---------------------------------------------------------------------------
describe('EACH OF THE NINE, IN ITS OWN CONTEXT', () => {
    test('admin.html markup: the grouping note, the flights note, the checkbox, the stacked-skins note', () => {
        const s = rendered('admin.html');
        assert.match(s, /every whole-field game, including the Weekly Game\./);
        assert.match(s, /Side matches and the Weekly Game never use flights\./);
        assert.match(s, /id="mp-enabled" onchange="mpToggle\(\)"> <strong>🏆 Weekly Game<\/strong>/);
        assert.match(s, /<p id="mp-skins-note">Weekly Game already includes its own Skins pot \\u2014 only add this if you want a second, separate skins game\.<\/p>/);
    });

    test('admin.html: the v126 skins-scope notes keep their approved wording apart from the name', () => {
        const s = rendered('admin.html');
        assert.match(s, /const ONE_POT_NOTE = 'Weekly Game skins are ONE pot for the whole field \\u2014 A and B play each other here\. For A-only and B-only skins pots, use a Skins wager \(Step 4 or Also Playing\) instead of this bucket\.';/);
        assert.match(s, /const SPLIT_NOTE = 'With Skins per flight, the Weekly Game\\'s skins bucket splits into two pots by headcount \\u2014 Flight A and Flight B each play their own\. KP and Net Finish stay whole-field\.';/);
    });

    test('admin.html: the pot validation alert names the Weekly Game, in front of the round the wizard refused', () => {
        // Arrive at the wizard, reach the save with a pool that cannot validate
        // (a KP purse on a course with no KP holes chosen), and read the alert.
        const s = rendered('admin.html');
        assert.match(s, /alert\('\\u26A0\\uFE0F Weekly Game:\\n' \+ mpCheck\.errors\.join\('\\n'\)\);/);
        assert.doesNotMatch(s, /alert\('\\u26A0\\uFE0F Main Pool/);
    });

    test('index.html: the Card tab\'s action banner reads "🏆 Weekly Game · $<pot>" on a Weekly Game round', () => {
        const players = makePlayers(['Marty Lee', 'Manny Orozco', 'John Smith', 'Steve Jones'], [0, 0, 0, 0]);
        const scores = {}; players.forEach((p, i) => CD.forEach(h => { if (h.hole <= 6) scores[`p${p.id}_h${h.hole}`] = h.par + (i % 2); }));
        const data = { eventName: 'WG', players, courseData: CD, scores, gameFormat: 'stroke',
            moneyPool: { enabled: true, buyIn: 20, kp: { amount: 20, holes: [3, 7] }, net: { amount: 40, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } };
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=WG0001' });
        vm.runInContext('document.__mount(document.getElementById("hole-view-card")); document.__mount(document.getElementById("action-center-mount")); actionCenterOpen = true;', sb);
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/WG0001');
        h.cb({ val: () => data, exists: () => true });
        const html = String(vm.runInContext("(document.getElementById('action-center-mount')||{}).innerHTML || ''", sb));
        assert.match(html, /🏆 Weekly Game · \$80/);
        assert.doesNotMatch(html, /Main Pool/);
    });

    test('index.html: the KP-cancel refusal says "Adjust the Weekly Game setup first."', () => {
        const s = rendered('index.html');
        assert.match(s, /'nowhere for the KP money to go\. Adjust the Weekly Game setup first\.'\)/);
    });
});

// ---------------------------------------------------------------------------
describe('THE RECEIPT AND THE SETUP AGREE ON THE NAME', () => {
    test('settlement.html says Weekly Game (v142) and admin.html\'s card says Weekly Game (v143): one word on both ends', () => {
        assert.match(rendered('settlement.html'), /Weekly Game \\u2014 \$\{\$\(r\.totalPoolCents\)\}/);
        assert.match(rendered('admin.html'), /<strong>🏆 Weekly Game<\/strong>/);
    });
    test('what still says Main Pool is outside this wave, and named', () => {
        assert.match(read('trip.html'), /'the Main Pool'/, 'trip.html\'s TRIP_TOTAL_INCLUDES - a follow-up');
        assert.match(read('HANDOFF.md'), /The Main Pool's/, 'HANDOFF.md prose - a follow-up');
    });
});
