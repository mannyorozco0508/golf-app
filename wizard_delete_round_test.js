// ============================================================================
// THE WIZARD'S WIPE TELLS THE TRUTH (2026-09-19).
//
// MEASURED ON A PHONE (v177, RV64U5 - Marty's Monday, 432 scores): the wizard's
// "🗑️ End & wipe this round" confirmed "permanently wipe the game clean for a
// fresh start", sent the delete, and alerted "Error clearing game:
// PERMISSION_DENIED: Permission denied". The rule refused it - Rule A,
// events/$eventCode .write "(data.exists() && (newData.exists() ||
// !data.hasChild('scores')))", 2cb98f3 - exactly as built. The page already
// HELD the 432 scores (loadedScores, filled from the round's own snapshot) and
// said nothing; the confirm promised a fresh start a scored round can never
// have; the refusal was the SDK's string. The scorecard's twin control had
// been rewritten at 2cb98f3 and the wizard's copy left behind.
//
// NOW, admin.html endAndClearRound():
//   1. CHECK BEFORE WRITING. On a round with any score held, no confirm and no
//      write: the scores sentence, at once.
//   2. SAY WHAT THE SCORECARD SAYS. Every sentence is index.html's
//      (:6555-6575), character for character; ONE new line answers what the
//      golfer came for: "To play again, start a new round from Home — 🔁 Start
//      from it copies this round's golfers and setup into a new code."
//   3. THE LABEL AND THE CONFIRM are the scorecard's: "🗑️ Delete this round",
//      the helper line, the confirm naming the code and the golfer count.
//   4. A DROPPED CONNECTION still shows the real thing: the write was sent and
//      did not land -> the signal sentence; a late PERMISSION_DENIED (a score
//      landed after the page loaded) -> the scores sentence. Told apart by the
//      error's own text, as index.html does.
// THE RULE IS THE BACKSTOP and stays. The unscored round wipes as before - Rule
// A depends on it. The two-write walk-around (clear the scores on the card,
// then delete) is neither blocked nor advertised.
//
// HARNESS. mini-dom: the wizard arrives on ?game=CODE and its OWN arrival
// loader (admin.html:6735 once() -> loadModeData) finds the record in the
// stub's __dbReads, seeded before the script runs; confirm/alert are replaced
// to record; the stub's remove() is recorded in __dbWrites and, for the
// failure arms, made to reject through __dbRefuse. Nothing calls the loader.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const CODE = 'WDR1';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const settle = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));

const SCORES_SENTENCE = 'This round has scores in it, so it cannot be deleted.\n\n'
    + 'That is deliberate — it stops a round being wiped by accident once anyone has started playing.\n\n'
    + 'To play again, start a new round from Home — 🔁 Start from it copies this round’s golfers and setup into a new code.';
const SIGNAL_SENTENCE = '⚠️ Could not delete the round — check your signal and try again.';
const SUCCESS = 'Round deleted. The scorecard is now clear.';

function round(withScores) {
    const players = [{ id: 101, name: 'Marty', hcp: '3', playingForMoney: true }, { id: 102, name: 'Dale', hcp: '8', playingForMoney: true }];
    const rec = { eventName: 'Monday', courseName: 'Camas Meadows Golf Club', activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD, players, settlementMode: 'whole-dollar' };
    if (withScores) rec.scores = { p101_h1: 4, p102_h1: 5 };
    return rec;
}
// The wizard reads an existing round with once() at load (admin.html:5574), so the
// record is seeded through __dbReads BEFORE the script runs, and the test waits for
// that read's .then - which is what fills loadedScores - before touching anything.
async function arrive(rec, opts) {
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=' + CODE,
        beforeRun(sandbox) { sandbox.__dbReads = { ['events/' + CODE]: JSON.parse(JSON.stringify(rec)) }; } });
    await new Promise((r) => setTimeout(r, 60));   // the arrival's once() -> loadModeData -> its once(): real microtask chains
    // UI WAVE 3: this page speaks through ui-dialogs.js now. The three tells feed
    // the SAME array, so every assertion below about what the organizer was told
    // reads unchanged - what changed is HOW the page says it, not what it says.
    sb.__alerts = []; sb.__kinds = [];
    const say = (kind) => (m) => { sb.__alerts.push(String(m)); sb.__kinds.push(kind); };
    sb.alert = say('alert'); sb.uiRefuse = say('refuse'); sb.uiFail = say('fail'); sb.uiToast = say('toast');
    // And the decision is a PROMISE now. A test that stubbed it synchronously
    // would be asserting against its own mock rather than the page's await.
    sb.__confirms = [];
    sb.uiConfirm = (o) => {
        sb.__confirms.push(JSON.parse(JSON.stringify(o || {})));
        return Promise.resolve(!(opts && opts.confirm === false));
    };
    sb.__nav = null; try { Object.defineProperty(sb.window.location, 'href', { set: (v) => { sb.__nav = v; }, get: () => 'admin.html?game=' + CODE, configurable: true }); } catch (e) { /* mini-dom location may be plain */ }
    if (opts && opts.refuse) sb.__dbRefuse = (p, op) => (op === 'remove' && /^events\/WDR1$/.test(p)) ? Object.assign(new Error(opts.refuse.message), { code: opts.refuse.code }) : null;
    return sb;
}
const removes = (sb) => sb.__dbWrites.filter((w) => w.op === 'remove' && w.path === 'events/' + CODE);
// let-scoped page state is read through the context, not as a sandbox property.
const held = (sb) => vm.runInContext('Object.keys(loadedScores || {}).length', sb);

describe('1. A SCORED ROUND: the sentence, no confirm, no write, the round intact', () => {
    test('two scores held: endAndClearRound alerts the scores sentence and sends nothing', async () => {
        const sb = await arrive(round(true));
        assert.equal(held(sb), 2, 'the wizard holds the round\'s scores after its own load');
        sb.endAndClearRound(); await settle();
        assert.deepEqual(sb.__alerts, [SCORES_SENTENCE]);
        assert.deepEqual(sb.__confirms, [], 'no confirm is asked on a round that cannot be deleted');
        assert.equal(removes(sb).length, 0, 'NO delete was attempted: ' + JSON.stringify(sb.__dbWrites));
        assert.equal(sb.__dbWrites.length, 0, 'nothing at all was written');
        assert.equal(sb.__nav, null, 'the page stays where it is');
    });
    test('the three sentences are the scorecard\'s, plus the one new line (decoded before matching)', () => {
        const idx = decodeEscapes(read('index.html'));
        assert.ok(idx.includes('This round has scores in it, so it cannot be deleted.'), 'index.html still owns sentence one');
        assert.ok(idx.includes('it stops a round being wiped by accident ') && idx.includes('once anyone has started playing.'), 'and sentence two (index.html splits it over two literals)');
        assert.ok(idx.includes('Could not delete the round — check your signal and try again.'), 'and the signal sentence');
        const adm = decodeEscapes(ADMIN);
        assert.ok(adm.includes('This round has scores in it, so it cannot be deleted.'));
        assert.ok(adm.includes('it stops a round being wiped by accident once anyone has started playing.'));
        assert.ok(adm.includes('To play again, start a new round from Home — 🔁 Start from it copies this round’s golfers and setup into a new code.'), 'the new line, verbatim');
        assert.ok(adm.includes('Could not delete the round — check your signal and try again.'));
        // Comments are not copy: the code's own notes name the old strings. Strip them first.
        const admCopy = adm.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!admCopy.includes('Error clearing game'), 'the SDK string is gone');
        assert.ok(!admCopy.includes('wipe the game clean for a fresh start'), 'the fresh-start promise is gone');
        assert.ok(!admCopy.includes('Game reset successfully'), 'the old success line is gone');
    });
});

describe('2. AN UNSCORED ROUND wipes as it always did - Rule A\'s legitimate case', () => {
    test('no scores: the confirm names the code and the golfer count; one remove; the pointer cleared; the success line; the lobby', async () => {
        const sb = await arrive(round(false));
        sb.localStorage.setItem('lastRoomCode', CODE);
        sb.endAndClearRound(); await settle();
        assert.equal(sb.__confirms.length, 1);
        // The same sentences, split across the sheet's title and body. The title
        // is the question; the body is what it costs.
        assert.equal(sb.__confirms[0].title, 'Delete round WDR1 for everyone?');
        assert.equal(sb.__confirms[0].body,
            'This erases all scores for all 2 golfers, and every bet, press and side match with them. It cannot be undone.\n\n'
            + 'You do not need to delete a round when you finish playing.');
        // AND THE DESTRUCTIVE BUTTON IS NOT THE DEFAULT. Cancel says what it
        // keeps, the confirm says what it does, and ui-dialogs.js renders and
        // focuses Cancel first - driven in real Chrome in
        // dialog_admin_delete_chrome_test.js.
        assert.equal(sb.__confirms[0].confirmText, 'Delete it');
        assert.equal(sb.__confirms[0].cancelText, 'Keep the round');
        assert.equal(sb.__confirms[0].danger, true);
        assert.equal(removes(sb).length, 1, 'exactly one delete of the round');
        assert.equal(sb.__dbWrites.length, 1);
        assert.deepEqual(sb.__alerts, [SUCCESS]);
        assert.equal(sb.localStorage.getItem('lastRoomCode'), null, 'the resume pointer is cleared');
        assert.equal(sb.__nav, 'admin.html');
    });
    test('no scores, the confirm declined: nothing happens', async () => {
        const sb = await arrive(round(false), { confirm: false });
        sb.endAndClearRound(); await settle();
        assert.equal(sb.__confirms.length, 1);
        assert.equal(sb.__dbWrites.length, 0);
        assert.deepEqual(sb.__alerts, []);
    });
    test('the walk-around is not blocked: a round whose scores were cleared (no scores child) deletes', async () => {
        const sb = await arrive(round(false));
        assert.equal(held(sb), 0);
        sb.endAndClearRound(); await settle();
        assert.equal(removes(sb).length, 1);
    });
});

describe('3. A WRITE THAT DOES NOT LAND - told apart by the error\'s own text', () => {
    test('a dropped connection: the signal sentence, not the scores sentence', async () => {
        const sb = await arrive(round(false), { refuse: { code: 'NETWORK_ERROR', message: 'network error' } });
        sb.endAndClearRound(); await settle();
        assert.equal(removes(sb).length, 1, 'the write WAS attempted');
        assert.deepEqual(sb.__alerts, [SIGNAL_SENTENCE]);
        assert.equal(sb.__nav, null);
    });
    test('a late PERMISSION_DENIED (a score landed after the page loaded): the scores sentence', async () => {
        const sb = await arrive(round(false), { refuse: { code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED: Permission denied' } });
        sb.endAndClearRound(); await settle();
        assert.equal(removes(sb).length, 1);
        assert.deepEqual(sb.__alerts, [SCORES_SENTENCE]);
    });
});

describe('4. THE LABEL, THE HELPER LINE, THE SOURCE', () => {
    test('the button reads "🗑️ Delete this round" with the scorecard\'s helper line under it, on step 7, quiet as before', () => {
        // Comments are not copy: the note above the button records the old wording by name.
        const step7 = ADMIN.slice(ADMIN.indexOf('id="wizard-step-7"'), ADMIN.indexOf('THE TOURNAMENT EXIT CARD')).replace(/<!--[\s\S]*?-->/g, '');
        assert.match(step7, /<button type="button" class="end-round-btn" onclick="endAndClearRound\(\)">🗑️ Delete this round<\/button>/u);
        assert.doesNotMatch(step7, /End &amp; wipe|End & wipe|fresh start/);
        assert.match(decodeEscapes(step7), /Erases every score for everyone in this round\. You do not need to do this when you finish — scores save as you enter them\./);
        assert.match(ADMIN, /\.end-round-btn \{ display: inline-flex/, 'the quiet style is unchanged');
    });
    test('the check reads loadedScores - the scores the wizard already holds - and runs before confirm()', () => {
        const at = ADMIN.indexOf('function endAndClearRound()');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    }', at));
        assert.ok(fn.length > 200, 'the function exists');
        const check = fn.indexOf('loadedScores');
        const conf = fn.indexOf('uiConfirm(');
        assert.ok(check > 0 && conf > 0 && check < conf, 'loadedScores is read before the confirm');
        // AWAITED. Without the await `ok` is a truthy Promise and `if (!ok)` never
        // returns, so the round is deleted even when the organizer says no - and
        // the harness cannot see that, which is what dialog_await_guard_test.js is
        // for. Pinned here too because this is the file that owns this function.
        assert.match(fn, /await uiConfirm\(/, 'the decision must be awaited');
        assert.ok(/async function endAndClearRound\s*\(/.test(ADMIN),
            'endAndClearRound must be async');
        assert.match(fn, /PERMISSION_DENIED/i, 'the late refusal is told apart by the error text');
        assert.match(fn, /localStorage\.removeItem\('lastRoomCode'\)/);
        assert.doesNotMatch(fn, /currentData\.scores|snapshot|once\(/, 'the check reads what the page holds, not a fresh read');
    });
    test('the scorecard\'s own control (index.html) is untouched by this wave', () => {
        const idx = read('index.html');
        // Both pages went through the dialog waves (index.html in Wave 2, this one
        // in Wave 3) and both still say the same thing - which is the point of the
        // twin. The title is now the sheet's title rather than a confirm() string.
        assert.ok(idx.includes('Delete round ${currentMode} for everyone?'),
            'the scorecard\'s question changed');
        assert.match(idx, /Round deleted\. The scorecard is now clear\./);
        assert.match(idx, /await uiConfirm\(/, 'and the scorecard still awaits it');
    });
    test('sw.js moved for this wave (v178) and has not moved back', () => {
        assert.match(read('sw.js'), /Moved to v178:/);
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(c && Number(c[1]) >= 178, 'consumer key at or past v178: ' + (c && c[0]));
    });
});
