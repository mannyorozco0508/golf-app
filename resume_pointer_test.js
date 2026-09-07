// ============================================================================
// "RESUME" MUST MEAN A ROUND THAT EXISTS
//
// A phone was offering to resume round JLRL4H. That round is not in Firebase -
// events/JLRL4H reads null, proven against the same REST path that returns real
// data for app_settings and global_courses. It was never created.
//
// THE MECHANISM WAS TWO LINES FAR APART.
//
//   admin.html, on page load:  localStorage.setItem('lastRoomCode', currentMode)
//                              the instant the URL carries ?game=CODE
//   admin.html, inside Save:   db.ref(`events/${code}`).update(payload)
//                              the FIRST time the round is written at all
//
// Between them sits the entire setup wizard. Generate a code, land on the wizard,
// back out before saving, and the pointer outlives a round that never existed.
// Nothing cleared it: endAndClearRound removes the round and the pointer
// together, but abandoning the wizard clears neither.
//
// AND THE PREVIOUS WAVE MADE IT EASIER TO REACH. Minting a code used to take a
// deliberate press of a start button; picking the Game Day tile now does it
// immediately. That is the intended behaviour, but it means one stray tap mints
// a phantom round AND OVERWRITES a good pointer.
//
// TWO CHANGES.
//
//   THE POINTER IS WRITTEN ON SAVE, not on arrival. That is the whole bug: it
//   makes "resume" mean "a round that was actually created".
//
//   AND A POISONED POINTER CLEANS ITSELF UP. The fix above cannot help a device
//   that already stored one - and there is one in the wild right now. So a round
//   that comes back empty AND matches this device's own pointer clears it and
//   says the round is gone.
//
//   THE DISCRIMINATOR MATTERS. The empty round is also what a player sees when
//   they open a group link before the organizer has saved, and telling THEM the
//   round is gone would be wrong. index.html never writes lastRoomCode, so a
//   matching pointer means this device is the one that saved the round - and if
//   the round is empty now, it is gone. A player arriving early has no match and
//   keeps the "waiting for the organizer" message, which is true for them.
//
// WHAT MINI-DOM CANNOT PROVE. That the resume link reads "Resume ABC123" with a
// space. The control is display:inline-flex, and flex layout drops the anonymous
// whitespace between items, so the markup is right and the screen said
// "ResumeJLRL4H". There is no layout here, so a mini-dom test cannot see it at
// all: the gap is asserted as a declared rule below and MEASURED in a real
// browser by tools/home-screen-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const IDX = read('index.html');
const DEPS = ['course-data.js', 'action-model.js'];
const IDX_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
    'ryder-cup.js'];

// Arrives the way a browser does, with a store that actually remembers.
function home(search, seed) {
    const sb = loadHtmlInlineScript('admin.html', DEPS,
        { search: search, localStorage: true, seedStorage: seed });
    vm.runInContext('alert = function () {}; confirm = function () { return true; };', sb);
    return sb;
}
const run = (sb, e) => vm.runInContext(e, sb);
const pointer = sb => run(sb, "localStorage.getItem('lastRoomCode')");

describe('OPENING THE WIZARD DOES NOT CLAIM A ROUND EXISTS', () => {

    test('THE REPORTED BUG: arriving with a fresh code stores no pointer', () => {
        assert.equal(pointer(home('?game=NEWRND&eventType=quick')), null,
            'a round nobody has saved is already offered as resumable');
    });

    test('and neither does arriving at an existing round to edit it', () => {
        // Opening a saved round's setup is not the same as saving it. The pointer
        // this device already holds is the one that matters.
        assert.equal(pointer(home('?game=OTHERR')), null);
    });

    test('a pointer already stored is not overwritten by opening the wizard', () => {
        const sb = home('?game=NEWRND', { lastRoomCode: 'GOODRD' });
        assert.equal(pointer(sb), 'GOODRD',
            'one stray tap on a tile replaced a good pointer with a phantom');
    });

    test('the write lives in the save, not on the load path', () => {
        const at = ADMIN.indexOf('function saveSettings');
        const save = ADMIN.slice(at, ADMIN.indexOf('function endAndClearRound'));
        assert.match(save, /localStorage\.setItem\('lastRoomCode'/,
            'saving a round does not record it as resumable');
        const before = ADMIN.slice(0, at);
        assert.ok(!/localStorage\.setItem\('lastRoomCode'/.test(before),
            'the pointer is still written somewhere before the round is saved');
    });

    test('it is written exactly once in the whole page', () => {
        assert.equal((ADMIN.match(/localStorage\.setItem\('lastRoomCode'/g) || []).length, 1);
    });

    test('and only after the write to Firebase resolves', () => {
        // Inside the .then() of the round's own update, so a failed save leaves no
        // pointer to a round that is not there.
        const at = ADMIN.indexOf('db.ref(`events/${currentMode}`).update(payload)');
        assert.ok(at > -1, 'the round save moved');
        const after = ADMIN.slice(at, at + 1200);
        const thenAt = after.indexOf('.then(');
        const setAt = after.indexOf("localStorage.setItem('lastRoomCode'");
        assert.ok(setAt > -1 && thenAt > -1 && setAt > thenAt,
            'the pointer is written before the save is known to have succeeded');
    });

    test('resume still reads it, and ending a round still clears it', () => {
        assert.match(ADMIN, /localStorage\.getItem\('lastRoomCode'\)/);
        const end = ADMIN.slice(ADMIN.indexOf('function endAndClearRound'),
                                ADMIN.indexOf('function endAndClearRound') + 900);
        assert.match(end, /localStorage\.removeItem\('lastRoomCode'\)/,
            'ending a round no longer clears the pointer to it');
    });
});

describe('A POINTER TO A ROUND THAT IS GONE CLEANS ITSELF UP', () => {

    // The scorecard, arriving on a round with no data at all.
    function scorecard(code, seed) {
        const sb = loadHtmlInlineScript('index.html', IDX_DEPS,
            { search: '?game=' + code, localStorage: true, seedStorage: seed });
        vm.runInContext('alert = function () {};', sb);
        const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
        assert.ok(handlers.length > 0, 'the scorecard registered no value handler');
        handlers.forEach(h => h.cb({ val: () => null }));
        return sb;
    }
    const body = sb => run(sb, 'document.getElementById("card-body").innerHTML');

    test('this device’s own dead round clears the pointer', () => {
        const sb = scorecard('DEADRD', { lastRoomCode: 'DEADRD' });
        assert.equal(pointer(sb), null,
            'the home screen will offer this dead round again tomorrow');
    });

    test('and says the round is gone, not that someone is slow', () => {
        const t = body(scorecard('DEADRD', { lastRoomCode: 'DEADRD' }));
        assert.ok(!/Waiting for Admin/i.test(t),
            'it still blames an absent person for a round that was never created: ' + t);
        assert.match(t, /no longer|never|not found|gone/i,
            'it does not say what actually happened: ' + t);
    });

    // THE DISCRIMINATOR. A player who opens a group link before the organizer has
    // saved sees the same empty round, and for them the old message is true.
    test('a player arriving early is NOT told the round is gone', () => {
        const t = body(scorecard('LIVERD', { lastRoomCode: 'SOMEOTHER' }));
        assert.match(t, /Waiting for Admin/i,
            'a golfer who is simply early was told the round does not exist: ' + t);
    });

    test('and their own pointer is left alone', () => {
        const sb = scorecard('LIVERD', { lastRoomCode: 'SOMEOTHER' });
        assert.equal(pointer(sb), 'SOMEOTHER',
            'someone else’s empty round cleared this device’s good pointer');
    });

    // HOLE VIEW IS DELIBERATELY NOT PART OF THIS, and the reason is a bug I nearly
    // shipped. renderScorecard RETURNS on an absent round before Hole View is ever
    // reached, so Hole View's empty message answers a different question: a round
    // that EXISTS, with players, whose course has no hole data yet. Wiring the
    // dead-round message into it would tell a golfer on a live round that it no
    // longer exists - and clear the pointer that was doing its job.
    // Comments stripped first. The reason Hole View must not call this is explained
    // at length right where it would have gone, and counting that prose made these
    // fail for the wrong reason. What must be true is about the CODE.
    const CODE = IDX.replace(/\/\/.*$/gm, '');

    test('Hole View does NOT use the dead-round message', () => {
        const at = CODE.indexOf('function renderHoleView');
        const fn = CODE.slice(at, at + 1200);
        assert.ok(!/emptyRoundMessage\(\)/.test(fn),
            'a live round with an unmapped course would be declared dead');
    });

    test('and the builder is reached only from the absent-round branch', () => {
        assert.equal((CODE.match(/emptyRoundMessage\(\)/g) || []).length, 2,
            'the dead-round message reaches a path it does not describe');
    });

    test('Hole View still explains ITS condition, which is a real wait', () => {
        const at = CODE.indexOf('function renderHoleView');
        assert.match(CODE.slice(at, at + 1200), /No course data for this round yet/,
            'the incomplete-setup case lost its message');
    });

    test('a device with no pointer at all is unaffected', () => {
        const t = body(scorecard('LIVERD'));
        assert.match(t, /Waiting for Admin/i);
    });

    test('a round WITH data never shows either message', () => {
        const sb = loadHtmlInlineScript('index.html', IDX_DEPS,
            { search: '?game=REALRD', localStorage: true, seedStorage: { lastRoomCode: 'REALRD' } });
        vm.runInContext('alert = function () {};', sb);
        sb.__dbHandlers.filter(h => h.event === 'value').forEach(h => h.cb({
            val: () => ({ players: [{ id: 101, name: 'Ann', hcp: '0' }],
                          courseData: [{ hole: 1, par: 4, hcpIndex: 1 }], scores: {} })
        }));
        assert.equal(pointer(sb), 'REALRD', 'a live round cleared its own pointer');
        assert.ok(!/Waiting for Admin|no longer/i.test(body(sb)),
            'a working round is being described as missing');
    });
});

describe('THE RESUME LINK READS AS TWO WORDS', () => {

    // display:inline-flex makes the label and the badge flex items, and flex layout
    // drops the whitespace between them - so the markup can be right and the screen
    // still read "ResumeJLRL4H". A declared gap is the fix; the rendered spacing is
    // measured in a real browser, because there is no layout here.
    test('the control declares a gap between its parts', () => {
        const at = ADMIN.indexOf('.resume-link {');
        assert.ok(at > -1, 'the resume control lost its rule');
        const rule = ADMIN.slice(at, ADMIN.indexOf('}', at));
        assert.match(rule, /display: inline-flex/, 'the layout assumption changed');
        const m = /gap:\s*([\d.]+)px/.exec(rule);
        assert.ok(m && Number(m[1]) > 0,
            'inline-flex drops the whitespace, so the label and code run together');
    });

    test('the markup still has both parts and a space between them', () => {
        const box = ADMIN.slice(ADMIN.indexOf('id="resume-container"'),
                                ADMIN.indexOf('id="resume-container"') + 500);
        assert.match(box, /Resume <span id="resume-room-badge">/,
            'the space was deleted instead of the layout being fixed');
    });
});
