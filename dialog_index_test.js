// ============================================================================
// UI WAVE 2 — index.html's THREE DECISIONS, DRIVEN BOTH WAYS
//
// The scorecard's three confirms are the most consequential in the app:
//
//   frKpDeclareNoWinner   the KP share moves into the skins pot        MONEY
//   frCancelKps           the WHOLE KP allocation moves                MONEY
//   endAndClearRound      every score, bet, press and side match, gone DESTRUCTIVE
//
// EVERY ONE OF THEM IS DRIVEN BOTH WAYS HERE, and that is the lesson from the
// pilot rather than a matter of taste. In Wave 1, dropping the await on Remove
// Ryder Cup went red in the source scan AND NOWHERE ELSE, because nothing
// exercised the destructive path - a regex was the only thing between a missed
// await and a Cup removed without being asked. Each control below fails
// behaviourally.
//
// WHY BOTH ANSWERS. "No writes nothing" is satisfied by a function that never
// writes anything at all, and "yes writes" is satisfied by one that never asks.
// Neither half is a test on its own.
//
// AND A MISSED AWAIT IS NOT SYMMETRIC. endAndClearRound is written
// `if (ok) { ... }`, so without the await `ok` is a truthy Promise and the round
// is deleted EVERY TIME, including when the golfer says no. The other two are
// `if (!ok) return`, where a missed await makes the guard never fire. Both end in
// the action happening unasked; the delete one is the worse of the two because
// it is the one a golfer reaches for by accident.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
              'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];

// A scorecard whose writes are recorded and whose decision sheet answers to
// order. uiConfirm is driven, not removed: what is under test is whether the
// page ASKS and whether it takes the answer.
function boot(answer, extra) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const players = [
        { id: 101, name: 'Ann', hcp: '0', playingForMoney: true },
        { id: 102, name: 'Ben', hcp: '0', playingForMoney: true }
    ];
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    vm.runInContext(`
        window.__writes = []; window.__removed = []; window.__asked = 0;
        window.__notes = []; window.__toasts = [];
        uiConfirm = function () { window.__asked++; return Promise.resolve(${JSON.stringify(answer)}); };
        uiRefuse = function (m) { window.__notes.push({ kind: 'refuse', text: String(m) }); };
        uiFail   = function (m) { window.__notes.push({ kind: 'fail', text: String(m) }); };
        uiToast  = function (m) { window.__toasts.push(String(m)); };
        db.ref = function (p) { return {
            remove: function () { window.__removed.push(p); return Promise.resolve(); },
            set: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); },
            push: function () { return { key: 'k' }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ players, courseData: cd, scores: {}, gameFormat: 'stroke' })};
        courseData = currentData.courseData; savedScores = currentData.scores;
        isOrganizerView = function () { return true; };
        hasOrganizerAuthority = function () { return true; };
        requireOnlineForMoney = function () { return true; };
        ${extra || ''}
    `, sb);
    return {
        sb,
        run: (c) => vm.runInContext(c, sb),
        json: (e) => JSON.parse(vm.runInContext('JSON.stringify(' + e + ')', sb)),
        // Cross-realm arrays fail deepStrictEqual on prototype identity, so
        // everything is read back through JSON.
        removed: () => JSON.parse(vm.runInContext('JSON.stringify(window.__removed)', sb)),
        writes: () => JSON.parse(vm.runInContext('JSON.stringify(window.__writes)', sb)),
        asked: () => vm.runInContext('window.__asked', sb),
        notes: () => JSON.parse(vm.runInContext('JSON.stringify(window.__notes)', sb)),
        toasts: () => JSON.parse(vm.runInContext('JSON.stringify(window.__toasts)', sb))
    };
}
const settle = () => new Promise(r => setTimeout(r, 30));

describe('DELETE ROUND — the most destructive path in the app', () => {

    test('it ASKS before doing anything', async () => {
        const b = boot(false);
        b.run('endAndClearRound();');
        await settle();
        assert.equal(b.asked(), 1, 'the round was deleted without a question');
    });

    test('answering NO deletes nothing', async () => {
        const b = boot(false);
        b.run('endAndClearRound();');
        await settle();
        assert.deepEqual(b.removed(), [], 'the round was deleted after the golfer said no');
        assert.deepEqual(b.toasts(), [], 'and it claimed to have done it');
    });

    test('answering YES deletes the round, and says so', async () => {
        // The other half: "deletes nothing" is trivially true of a function that
        // never deletes anything.
        const b = boot(true);
        b.run('endAndClearRound();');
        await settle();
        assert.deepEqual(b.removed(), ['events/ABCD'],
            'saying yes did not delete the round: ' + JSON.stringify(b.removed()));
        assert.ok(b.toasts().some(t => /Round deleted/.test(t)),
            'the confirmation is a toast, after the write: ' + JSON.stringify(b.toasts()));
    });

    test('THE DESTRUCTIVE BUTTON IS NOT THE DEFAULT-FOCUSED CONTROL', () => {
        // Held on the component, because that is where the decision is made for
        // every caller. Cancel is rendered first and is the one focused; the
        // destructive button is never focused, so nobody deletes a round by
        // double-tapping where the previous button was.
        const src = read('ui-dialogs.js');
        const body = src.slice(src.indexOf('function uiConfirm'), src.indexOf('function uiAmount'));
        assert.ok(body.indexOf('ui-sheet-no') < body.indexOf('ui-sheet-yes'),
            'the confirm button must not come first in the markup');
        assert.match(body, /if \(no && no\.focus\)/, 'Cancel takes the focus');
        assert.ok(!/yes\.focus\(\)/.test(body), 'the destructive button must never be focused');
        // And the page asks for the danger styling on this one.
        const page = read('index.html');
        const fn = page.slice(page.indexOf('async function endAndClearRound'),
                              page.indexOf('async function endAndClearRound') + 1600);
        assert.match(fn, /danger: true/, 'Delete round must render as destructive');
        assert.match(fn, /cancelText: 'Keep the round'/, 'and Cancel must say what it keeps');
    });

    test('a REFUSED delete is a persistent note, and still tells the two causes apart', () => {
        // I had this wrong first time. Unlike admin.html, the SCORECARD does not
        // pre-check for scores - it attempts the delete and the rules refuse it.
        // The catch arm then has to tell "this round has scores" apart from a
        // dropped connection, because saying the first for a network failure
        // would be false half the time. That distinction predates this wave; what
        // this wave must not have done is turn either into something that floats
        // away, since both mean the round is still there.
        const page = read('index.html');
        const at = page.indexOf('async function endAndClearRound');
        const fn = page.slice(at, at + 2600);
        assert.ok(fn.indexOf('uiConfirm') < fn.indexOf('scores in it'),
            'the refusal is the server\'s answer, so it comes after the question');
        assert.match(fn, /uiRefuse\(|uiFail\(/, 'the refusal must be a note');
        const tail = fn.slice(fn.indexOf('.catch'));
        assert.ok(!/uiToast\(/.test(tail),
            'a refused delete must not be a toast - the round is still there and the '
            + 'golfer needs to know why');
    });
});

describe('THE TWO KP DECISIONS — both move money', () => {

    test('KP nobody-won: NO writes nothing, YES writes', async () => {
        const no = boot(false);
        no.run('frKpDeclareNoWinner(7);');
        await settle();
        assert.equal(no.asked(), 1, 'it did not ask');
        assert.deepEqual(no.writes(), [], 'the KP share moved after the golfer said no');

        const yes = boot(true);
        yes.run('frKpDeclareNoWinner(7);');
        await settle();
        assert.ok(yes.writes().length > 0, 'saying yes recorded nothing');
        assert.ok(JSON.stringify(yes.writes()).includes('kpNoWinner'),
            'the write should be the no-winner flag: ' + JSON.stringify(yes.writes()));
    });

    test('cancel all KPs: NO writes nothing, YES writes', async () => {
        // frCancelKps reads a receipt to find the KP amount, so it needs a round
        // with a KP allocation to get as far as the question.
        // frCancelKps reads frKpPool(), and refuses outright unless the skins
        // amount is the REMAINDER - with a fixed skins amount there is nowhere for
        // the KP money to go. Both conditions are needed to reach the question at
        // all, which my first fixture missed.
        const withKp = `
            currentData.moneyPool = { enabled: true, buyIn: 20, kpEnabled: true, kpPerHole: 5,
                                      skins: { mode: 'remainder' }, kpHoles: [7] };
            frKpPool = function () { return { kp: { amountCents: 2000, lines: [] }, skins: { lines: [] } }; };`;
        const no = boot(false, withKp);
        no.run('frCancelKps();');
        await settle();
        assert.equal(no.asked(), 1, 'it did not ask');
        assert.deepEqual(no.writes(), [], 'the KP allocation moved after the golfer said no');

        const yes = boot(true, withKp);
        yes.run('frCancelKps();');
        await settle();
        assert.ok(yes.writes().length > 0, 'saying yes cancelled nothing');
    });
});

describe('index.html speaks for itself now', () => {

    test('no bare alert / confirm / prompt is left', () => {
        const code = read('index.html')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        ['alert', 'confirm', 'prompt'].forEach(k => {
            const hits = code.match(new RegExp('(?<![\\w.$])' + k + '\\s*\\(', 'g')) || [];
            assert.deepEqual(hits, [], 'index.html still calls ' + k + '()');
        });
    });

    test('it REUSES ui-dialogs.js and did not fork it', () => {
        const s = read('index.html');
        assert.match(s, /<script src="ui-dialogs\.js"><\/script>/);
        assert.ok(!/\.ui-note\s*\{/.test(s), 'the component CSS was copied into the page');
        assert.ok(!/\.ui-sheet\s*\{/.test(s), 'the component CSS was copied into the page');
        assert.ok(!/function uiRefuse|function uiConfirm|function uiToast/.test(s),
            'the page defined its own copy of the component');
    });

    test('the three decision functions are async, and the page still parses', () => {
        const s = read('index.html');
        ['frKpDeclareNoWinner', 'frCancelKps', 'endAndClearRound'].forEach(fn =>
            assert.match(s, new RegExp('async function ' + fn + '\\s*\\('), fn + ' must be async'));
        const sb = loadHtmlInlineScript('index.html', PAGE);
        ['frKpDeclareNoWinner', 'frCancelKps', 'endAndClearRound'].forEach(fn =>
            assert.equal(vm.runInContext('typeof ' + fn, sb), 'function', fn + ' did not survive parse'));
    });

    test('the last-resort copy fallback is a NOTE, not an alert or a toast', () => {
        // Copying has already failed twice by the time this runs. The job is to
        // put the text where a golfer can SELECT it, which an alert cannot do and
        // a toast floats away from.
        const s = read('index.html');
        const at = s.indexOf('function fallbackCopy');
        const fn = s.slice(at, at + 900);
        assert.match(fn, /uiFail\(/, 'the fallback must leave the text on screen');
        assert.ok(!/uiToast\(/.test(fn), 'a toast would take the text away again');
        assert.match(fn, /select and copy/, 'and it must say what to do with it');
    });
});
