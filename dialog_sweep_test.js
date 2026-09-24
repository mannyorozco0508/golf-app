// ============================================================================
// UI WAVE 4 — THE END OF THE SWEEP
//
// trip.html (26 tells + THE LAST NATIVE DECISION IN THE APP), skins.html (5) and
// season.html (9). After this, no consumer page asks a golfer anything through
// the browser.
//
// THE ONE DECISION. removeRound() unlinks a round from a trip. The round itself
// survives - that is what its question says - but the trip's leaderboard, money
// settlement, points race and awards all stop counting it, so this is money on
// three surfaces. It is `if (!confirm(...)) return;`, so a missed await makes the
// guard never fire and the round is unlinked unasked. Driven both answers below,
// and its control fails here as well as in the source scan.
//
// THE PIECE THAT IS NOT A RENAME, and it is the only behaviour change in the wave:
// trip.html's "Trip not found." ran `alert(...)` and then immediately
// `window.location.href = 'trip.html'`. A native alert BLOCKS, so the sentence was
// read before the reload. An inline note does not block, and the reload would wipe
// it - converting that one line without touching the reload would have shipped an
// INVISIBLE message, which is worse than the browser dialog it replaced. So the
// reload is gone. It cost nothing: the page never hid #setup-screen on that path,
// so the screen a person lands on is the same one, minus a round trip. What the
// reload did supply was the resume row, and that is now shown explicitly instead.
// Every part of that is asserted below, including that the note SURVIVES.
//
// THE THREE CLIPBOARD FALLBACKS ON trip.html become notes, not toasts and not
// alerts, for the same reason index.html's did in Wave 2: by the time one runs,
// copying has already failed, and the job is to put the text where a person can
// SELECT it. An alert cannot be selected from and a toast takes it away again.
// sidematches.html's single native prompt() stays exactly as it is - decided in
// Wave 1, asserted here so "still native" cannot quietly become "forgotten".
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const TRIP = read('trip.html');
const settle = () => new Promise((r) => setTimeout(r, 40));
const DEPS = ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
              'pool-engine.js', 'score-marks.js'];

// A page with the decision sheet answered to order and every tell recorded by
// KIND, because which surface a message uses is half of what this wave changed.
// Read back through JSON.stringify inside the realm: a cross-realm array fails
// deepEqual on prototype identity alone and reads like a content mismatch.
function boot(page, opts) {
    const o = opts || {};
    // The harness's default localStorage is a deliberate no-op, and a test about
    // WHAT IS REMEMBERED cannot be written against a store that forgets - it would
    // pass whether the write happened or not. Opted in per test.
    const sb = loadHtmlInlineScript(page, o.deps || DEPS, {
        search: o.search || '',
        localStorage: !!o.storage,
        seedStorage: o.storage || undefined
    });
    vm.runInContext(`
        window.__notes = []; window.__toasts = []; window.__asked = [];
        alert = function (m) { window.__notes.push({ kind: 'alert', text: String(m) }); };
        uiRefuse = function (m) { window.__notes.push({ kind: 'refuse', text: String(m) }); };
        uiFail   = function (m) { window.__notes.push({ kind: 'fail', text: String(m) }); };
        uiToast  = function (m) { window.__toasts.push(String(m)); };
        uiConfirm = function (o) {
            window.__asked.push(JSON.parse(JSON.stringify(o || {})));
            return Promise.resolve(${JSON.stringify(!!o.answer)});
        };
        uiPrompt = function () { return Promise.resolve(null); };
        ${o.extra || ''}
    `, sb);
    const j = (e) => JSON.parse(vm.runInContext('JSON.stringify(' + e + ')', sb));
    return {
        sb,
        run: (c) => vm.runInContext(c, sb),
        asked: () => j('window.__asked'),
        notes: () => j('window.__notes'),
        toasts: () => j('window.__toasts'),
        writes: () => j('(window.__dbWrites || []).map(function (w) { return w.op + " " + w.path; })')
    };
}

// ---------------------------------------------------------------------------
describe('1. THE LAST NATIVE DECISION IN THE APP — unlinking a round from a trip', () => {

    const setup = "tripData = { name: 'Myrtle Beach 2026' }; currentTripCode = 'TRIP1';"
                + ' hasTripOrganizerAuthority = function () { return true; };';

    test('it asks, and the question says what SURVIVES as well as what stops', async () => {
        const b = boot('trip.html', { answer: false, extra: setup });
        b.run("removeRound('R0');");
        await settle();
        assert.equal(b.asked().length, 1, 'the round was unlinked without a question');
        const q = JSON.stringify(b.asked()[0]);
        assert.match(q, /trip/i, q);
        assert.match(q, /round itself is untouched|untouched/i,
            'the question must say the round itself survives: ' + q);
    });

    test('answering NO leaves the round linked', async () => {
        const b = boot('trip.html', { answer: false, extra: setup });
        b.run("removeRound('R0');");
        await settle();
        assert.deepEqual(b.writes(), [],
            'the round was unlinked after the organizer said no: ' + JSON.stringify(b.writes()));
        assert.deepEqual(b.toasts(), [], 'and it claimed to have done it');
    });

    test('answering YES unlinks exactly that round, and nothing else', async () => {
        // The other half: "unlinks nothing" is trivially true of a function that
        // never unlinks anything.
        const b = boot('trip.html', { answer: true, extra: setup });
        b.run("removeRound('R0');");
        await settle();
        assert.deepEqual(b.writes(), ['remove trips/TRIP1/rounds/R0'],
            'the wrong thing was removed, or nothing was: ' + JSON.stringify(b.writes()));
    });

    test('the destructive button is not the default, and Cancel says what it keeps', async () => {
        const b = boot('trip.html', { answer: false, extra: setup });
        b.run("removeRound('R0');");
        await settle();
        const o = b.asked()[0];
        assert.equal(o.danger, true, 'unlinking a round from the money is destructive');
        assert.ok(o.cancelText && /keep/i.test(o.cancelText),
            'Cancel must say what it keeps, got ' + JSON.stringify(o.cancelText));
        assert.ok(o.confirmText && o.confirmText !== 'Yes',
            'the confirm button must name the action, got ' + JSON.stringify(o.confirmText));
        // Held on the component, because that is where it is decided for every
        // caller at once.
        const comp = read('ui-dialogs.js');
        const body = comp.slice(comp.indexOf('function uiConfirm'), comp.indexOf('function uiAmount'));
        assert.ok(body.indexOf('ui-sheet-no') < body.indexOf('ui-sheet-yes'),
            'Cancel must be first in the markup');
        assert.ok(!/yes\.focus\(\)/.test(body), 'the destructive button must never be focused');
    });

    test('THE GATE STILL COMES FIRST: no authority means no question and no write', async () => {
        // A belt-and-braces check, proved in isolation as this repo's rule requires:
        // with the authority gate saying no, nothing is asked AND nothing is
        // written - so the sheet cannot have become the only thing standing there.
        const b = boot('trip.html', { answer: true,
            extra: "tripData = { name: 'T' }; currentTripCode = 'TRIP1';"
                 + ' hasTripOrganizerAuthority = function () { return false; };' });
        b.run("removeRound('R0');");
        await settle();
        assert.deepEqual(b.asked(), [], 'a non-organizer was asked the question');
        assert.deepEqual(b.writes(), [], 'a non-organizer unlinked a round');
    });

    test('and it is AWAITED in the source, which is the only thing that can see a missed await', () => {
        const at = TRIP.indexOf('async function removeRound');
        assert.ok(at > 0, 'removeRound must be async');
        const fn = TRIP.slice(at, TRIP.indexOf('\n    }', at));
        assert.match(fn, /await uiConfirm\(/, 'the decision must be awaited');
        assert.ok(fn.indexOf('hasTripOrganizerAuthority') < fn.indexOf('await uiConfirm'),
            'the gate is checked before the question is asked');
    });
});

// ---------------------------------------------------------------------------
describe('2. A TRIP CODE THAT IS NOT THERE — the one behaviour change', () => {

    function arrive(code, opts) {
        const o = opts || {};
        const b = boot('trip.html', { search: '?trip=' + code, answer: false,
            storage: o.lastTrip ? { lastTripCode: o.lastTrip } : {} });
        b.nav = null;
        try {
            Object.defineProperty(b.sb.window.location, 'href', {
                set: (v) => { b.nav = v; }, get: () => 'trip.html?trip=' + code, configurable: true });
        } catch (e) { /* mini-dom location may be plain */ }
        const h = (b.sb.__dbHandlers || []).find(x => x.event === 'value' && /^trips\//.test(x.path));
        assert.ok(h, 'the page never asked for the trip it was sent to');
        h.cb({ val: () => null, exists: () => false });
        return b;
    }

    test('it says so, as a persistent note — and the page DOES NOT RELOAD', () => {
        const b = arrive('NOPE');
        const notes = b.notes();
        assert.equal(notes.length, 1, 'it said nothing, or said it twice: ' + JSON.stringify(notes));
        assert.equal(notes[0].kind, 'refuse',
            'a trip that is not there is a refusal, not a failed write: ' + JSON.stringify(notes));
        assert.match(notes[0].text, /not found|no trip/i);
        assert.deepEqual(b.toasts(), [], 'this must not float away - it is the whole screen');
        // THE POINT. A reload would wipe the note before anyone read it.
        assert.equal(b.nav, null,
            'the page reloaded, which erases the message it just rendered: ' + b.nav);
    });

    test('the setup screen is what is on screen, which is why the reload cost nothing', () => {
        const b = arrive('NOPE');
        const d = b.run("(document.getElementById('setup-screen').style.display || '')");
        assert.notEqual(d, 'none', 'the setup screen was hidden, so there is nothing to read the note on');
        const m = b.run("(document.getElementById('manage-screen').style.display || '')");
        assert.notEqual(m, 'block', 'the manage screen was shown for a trip that does not exist');
    });

    test('the resume row the reload used to supply is shown explicitly now', () => {
        const b = arrive('NOPE', { lastTrip: 'REAL1' });
        assert.equal(b.run("document.getElementById('resume-trip-container').style.display"), 'block',
            'the trip the organizer actually has is no longer offered');
        assert.equal(b.run("document.getElementById('resume-trip-badge').textContent"), 'REAL1');
    });

    test('and no resume row is invented when there is no previous trip', () => {
        const b = arrive('NOPE');
        assert.notEqual(b.run("document.getElementById('resume-trip-container').style.display"), 'block',
            'a resume row appeared for a trip that was never opened');
    });

    test('a trip that IS there still opens, so this is not a page that refuses everything', () => {
        // Without this, every assertion above is satisfied by a loadTrip that never
        // succeeds at all.
        const b = boot('trip.html', { search: '?trip=REAL1', answer: false });
        const h = (b.sb.__dbHandlers || []).find(x => x.event === 'value' && /^trips\//.test(x.path));
        h.cb({ val: () => ({ name: 'Myrtle Beach 2026' }), exists: () => true });
        assert.equal(b.run("document.getElementById('setup-screen').style.display"), 'none');
        assert.equal(b.run("document.getElementById('manage-screen').style.display"), 'block');
        assert.deepEqual(b.notes(), [], 'a good trip was refused');
        assert.equal(b.run("document.getElementById('manage-room-badge').textContent"), 'REAL1');
    });
});

// ---------------------------------------------------------------------------
describe('3. THE CLIPBOARD FALLBACKS — a note, because the text must be selectable', () => {

    test('trip.html: all three leave the text on screen, and none of them floats', () => {
        // tripFallbackCopy's catch, and the two arms of shareRecap that give up on
        // both the share sheet and the clipboard API.
        const sites = ['function tripFallbackCopy', 'function shareRecap'];
        sites.forEach(s => {
            const at = TRIP.indexOf(s);
            assert.ok(at > 0, s + ' is gone');
        });
        // TO THE END OF THE FUNCTION, not a fixed window. Twice in Wave 3 a fixed
        // slice was outgrown by a comment added right above the line the test
        // guards, and each time it reported the guarded code MISSING. I wrote this
        // one with + 700 anyway and it failed the same way immediately.
        const fbAt = TRIP.indexOf('function tripFallbackCopy');
        const fb = TRIP.slice(fbAt, TRIP.indexOf('\n    }', fbAt));
        assert.match(fb, /uiFail\(/, 'the fallback must leave the text where it can be selected');
        assert.ok(!/uiToast\(/.test(fb), 'a toast would take the text away again');
        assert.match(fb, /select and copy/i, 'and it must say what to do with it');

        const srAt = TRIP.indexOf('function shareRecap');
        const sr = TRIP.slice(srAt, TRIP.indexOf('\n    }', srAt));
        assert.match(sr, /uiToast\(/, 'the SUCCESS is still a receipt and still floats');
        assert.equal((sr.match(/uiFail\(/g) || []).length, 2,
            'both give-up arms must leave the text on screen');
        assert.match(sr, /select and copy/i);
    });

    test('sidematches.html keeps its ONE native prompt, deliberately, and says why', () => {
        // Decided in UI Wave 1 and asserted here so that "left native on purpose"
        // and "missed" cannot be confused by anyone reading the counts later.
        const sm = read('sidematches.html');
        const hits = (codeOf(sm).match(/(?<![\w.$])prompt\s*\(/g) || []).length;
        assert.equal(hits, 1, 'sidematches.html should still have exactly its one native prompt');
        const at = codeOf(sm).search(/(?<![\w.$])prompt\s*\(/);
        const why = sm.slice(Math.max(0, at - 900), at);
        assert.match(why, /clipboard/i, 'the reason must still be written beside it');
    });
});

// ---------------------------------------------------------------------------
describe('4. skins.html — two refusals and three failures, driven', () => {

    test('a group-locked link refuses, inline and persistent', () => {
        // lockedGroup is `const lockedGroup = urlParams.get('group') ...` - assigning
        // to it throws, and the way to be on a group link is to ARRIVE on one.
        const b = boot('skins.html', { deps: ['action-model.js', 'pool-engine.js'], answer: false,
            search: '?group=2' });
        b.run("refuseConfigWrite('the skins pot');");
        const n = b.notes();
        assert.equal(n.length, 1, 'it said nothing: ' + JSON.stringify(n));
        assert.equal(n[0].kind, 'refuse',
            'a write the page refused is a refusal, not a failure: ' + JSON.stringify(n));
        assert.match(n[0].text, /Group 2/);
        assert.deepEqual(b.toasts(), [], 'a refusal must not float away from the dead control');
    });

    test('being offline refuses the money write, and does not claim it failed', () => {
        const b = boot('skins.html', { deps: ['action-model.js', 'pool-engine.js'], answer: false,
            extra: 'navigator = { onLine: false };' });
        const ok = b.run("requireOnlineForMoney('Skins not saved', 'Reconnect and try again.')");
        assert.equal(ok, false, 'the money write was allowed while offline');
        const n = b.notes();
        assert.equal(n.length, 1, JSON.stringify(n));
        assert.equal(n[0].kind, 'refuse', JSON.stringify(n));
        // And the positive half, so this is not satisfied by a page that refuses
        // everything.
        const on = boot('skins.html', { deps: ['action-model.js', 'pool-engine.js'], answer: false,
            extra: 'navigator = { onLine: true };' });
        assert.equal(on.run("requireOnlineForMoney('x', 'y')"), true, 'an online write was refused');
        assert.deepEqual(on.notes(), [], 'and it was scolded for being online');
    });

    test('a failed save is a FAILURE, persistent, on every one of the three writes', () => {
        const src = read('skins.html');
        const fails = (codeOf(src).match(/(?<![\w.$])uiFail\s*\(/g) || []).length;
        assert.equal(fails, 3, 'the three save paths must each report their own failure');
        assert.match(src, /uiFail\(`Failed to save: \$\{err\.message\}`\)/,
            'the sentence is unchanged; only the surface moved');
    });
});

// ---------------------------------------------------------------------------
describe('5. season.html — the validation refusals and the write failures', () => {

    const deps = ['season.js', 'code-issuer.js'];

    test('a season with no name is refused, inline, and nothing is written', () => {
        const b = boot('season.html', { deps, answer: false });
        b.run("document.getElementById('season-name-input').value = '   ';");
        b.run("document.getElementById('season-notes-input').value = '';");
        b.run('createSeason(null);');
        const n = b.notes();
        assert.equal(n.length, 1, 'it said nothing: ' + JSON.stringify(n));
        assert.equal(n[0].kind, 'refuse', JSON.stringify(n));
        assert.match(n[0].text, /name/i);
        assert.deepEqual(b.writes(), [], 'a nameless season was written');
    });

    test('a name that is too long, and notes that are too long, each refuse on their own', () => {
        const long = (n) => new Array(n + 1).join('x');
        const nameTooLong = boot('season.html', { deps, answer: false });
        nameTooLong.run("document.getElementById('season-name-input').value = " + JSON.stringify(long(81)) + ';');
        nameTooLong.run("document.getElementById('season-notes-input').value = '';");
        nameTooLong.run('createSeason(null);');
        // The KIND as well as the words. Matching only the sentence would pass on a
        // page that still used alert(), because this harness records all four
        // surfaces into one array on purpose - so that every existing assertion
        // about what a golfer was told keeps reading. That convenience has to be
        // paid for here.
        assert.equal(nameTooLong.notes().length, 1, JSON.stringify(nameTooLong.notes()));
        assert.equal(nameTooLong.notes()[0].kind, 'refuse', JSON.stringify(nameTooLong.notes()));
        assert.match(JSON.stringify(nameTooLong.notes()), /80 characters/);
        assert.deepEqual(nameTooLong.writes(), []);

        const notesTooLong = boot('season.html', { deps, answer: false });
        notesTooLong.run("document.getElementById('season-name-input').value = 'Winter League';");
        notesTooLong.run("document.getElementById('season-notes-input').value = " + JSON.stringify(long(281)) + ';');
        notesTooLong.run('createSeason(null);');
        assert.equal(notesTooLong.notes().length, 1, JSON.stringify(notesTooLong.notes()));
        assert.equal(notesTooLong.notes()[0].kind, 'refuse', JSON.stringify(notesTooLong.notes()));
        assert.match(JSON.stringify(notesTooLong.notes()), /280/);
        assert.deepEqual(notesTooLong.writes(), []);
    });

    test('a round code that names nothing refuses and says nothing was added', () => {
        const b = boot('season.html', { deps, answer: false,
            extra: "currentSeasonCode = 'S1'; seasonData = { name: 'Winter' }; seasonIsOwner = true;" });
        b.run("document.getElementById('season-attach-code').value = 'ZZZZ';");
        b.run('attachRound(null);');
        // The page reads events/<code> with once(); the stub answers from __dbReads,
        // which is empty here, so the round is genuinely absent.
        return settle().then(() => {
            const n = b.notes();
            assert.ok(n.length >= 1, 'it said nothing about a code that names nothing');
            assert.equal(n[n.length - 1].kind, 'refuse', JSON.stringify(n));
            assert.match(JSON.stringify(n), /Nothing was added|No round/i);
            assert.deepEqual(b.writes().filter(w => /^set|^update/.test(w)), [],
                'something was written for a round that does not exist');
        });
    });

    test('opening a season with no code refuses and does not navigate', () => {
        const b = boot('season.html', { deps, answer: false });
        let nav = null;
        try {
            Object.defineProperty(b.sb.window.location, 'href', {
                set: (v) => { nav = v; }, get: () => 'season.html', configurable: true });
        } catch (e) { /* plain location */ }
        b.run("document.getElementById('season-open-input').value = '';");
        b.run('openSeason(null);');
        assert.equal(b.notes().length, 1, JSON.stringify(b.notes()));
        assert.equal(b.notes()[0].kind, 'refuse');
        assert.equal(nav, null, 'it navigated on an empty code');
    });
});

// ---------------------------------------------------------------------------
describe('6. THE SWEEP IS FINISHED', () => {

    const PAGES = ['index.html', 'admin.html', 'sidematches.html', 'trip.html',
                   'skins.html', 'season.html', 'leaderboard.html', 'settlement.html',
                   'game.html'];

    test('no consumer page calls alert() or confirm() any more', () => {
        const left = [];
        PAGES.forEach(p => {
            const code = codeOf(read(p));
            ['alert', 'confirm'].forEach(k => {
                const n = (code.match(new RegExp('(?<![\\w.$])' + k + '\\s*\\(', 'g')) || []).length;
                if (n) left.push(p + ': ' + n + ' x ' + k + '()');
            });
        });
        assert.deepEqual(left, [], 'still speaking as a website: ' + left.join(', '));
    });

    test('and the only prompt() left in the app is the one that was kept on purpose', () => {
        const found = [];
        PAGES.forEach(p => {
            const n = (codeOf(read(p)).match(/(?<![\w.$])prompt\s*\(/g) || []).length;
            if (n) found.push(p + ':' + n);
        });
        assert.deepEqual(found, ['sidematches.html:1'],
            'the prompt inventory changed: ' + JSON.stringify(found));
    });

    test('every consumer page that speaks loads the ONE shared component', () => {
        PAGES.forEach(p => {
            const src = read(p);
            const speaks = /(?<![\w.$])(uiRefuse|uiFail|uiToast|uiConfirm|uiAmount|uiPrompt)\s*\(/.test(codeOf(src));
            if (!speaks) return;
            assert.match(src, /<script src="ui-dialogs\.js"><\/script>/,
                p + ' calls the component without loading it - every call would be a ReferenceError');
        });
    });

    test('and not one of them forked it', () => {
        PAGES.concat(['tournament.html']).forEach(p => {
            const src = read(p);
            assert.ok(!/function (uiRefuse|uiFail|uiToast|uiConfirm|uiAmount|uiPrompt)\s*\(/.test(src),
                p + ' declares its own copy of the component');
            assert.ok(!/\.ui-note\s*\{|\.ui-sheet\s*\{|\.ui-toast\s*\{/.test(src),
                p + ' copied the component CSS');
        });
        const comp = read('ui-dialogs.js');
        ['uiRefuse', 'uiFail', 'uiToast', 'uiConfirm', 'uiAmount', 'uiPrompt'].forEach(fn =>
            assert.equal((comp.match(new RegExp('function ' + fn + '\\s*\\(', 'g')) || []).length, 1,
                fn + ' must be declared exactly once, in ui-dialogs.js'));
    });

    test('TOURNAMENT.HTML IS STILL EXPLICITLY OUT, not silently absent', () => {
        // The other product (Rattle Golf), its own release train. Held as a POSITIVE
        // assertion: it still uses its own browser dialogs and still does not load
        // the shared component, so if someone converts it the exclusion has to be
        // revisited rather than quietly outgrown. An empty list would prove nothing.
        const t = read('tournament.html');
        assert.ok(!/ui-dialogs\.js/.test(t),
            'tournament.html has started using the shared dialogs - widen the scope '
            + 'deliberately or take it back out');
        const code = codeOf(t);
        const alerts = (code.match(/(?<![\w.$])alert\s*\(/g) || []).length;
        assert.ok(alerts > 50,
            'tournament.html is down to ' + alerts + ' native alerts - somebody has '
            + 'started sweeping the other product; say so on purpose');
        // And it is named in the guard's own out-of-scope list, not merely missing
        // from its in-scope one.
        assert.match(read('dialog_await_guard_test.js'),
            /OUT_OF_SCOPE = \[[^\]]*'tournament\.html'/,
            'the guard no longer names tournament.html as out of scope');
    });

    test('the split per page: what refuses, what fails, what floats', () => {
        const n = (src, k) => (codeOf(src).match(new RegExp('(?<![\\w.$])' + k + '\\s*\\(', 'g')) || []).length;
        const rows = {
            'trip.html':    { refuse: 14, fail: 11, toast: 1, confirm: 1 },
            'skins.html':   { refuse: 2, fail: 3, toast: 0, confirm: 0 },
            'season.html':  { refuse: 6, fail: 3, toast: 0, confirm: 0 }
        };
        Object.keys(rows).forEach(p => {
            const src = read(p);
            const got = { refuse: n(src, 'uiRefuse'), fail: n(src, 'uiFail'),
                          toast: n(src, 'uiToast'), confirm: n(src, 'uiConfirm') };
            assert.deepEqual(got, rows[p], p + ' split moved: ' + JSON.stringify(got));
        });
        // Receipts are the minority on all three, and always should be: almost
        // everything these pages say is "no, because".
        Object.keys(rows).forEach(p =>
            assert.ok(rows[p].toast <= rows[p].refuse, p + ' floats more than it refuses'));
    });
});

// ---------------------------------------------------------------------------
// The guard's own scanner, imported by copying rather than reinvented: in Wave 1
// my recon counter and the guard had the SAME regex-chain bug and agreed with each
// other while both were wrong. Comments are blanked, never deleted, so a reported
// line number is the file's own; STRINGS ARE KEPT, because one of admin.html's 38
// alerts lives inside a template string and a scanner that blanks strings reports
// 37.
function codeOf(src) {
    const out = new Array(src.length);
    let i = 0;
    const NORMAL = 0, LINE = 1, BLOCK = 2, HTML = 3, STR = 4;
    let state = NORMAL, quote = '';
    while (i < src.length) {
        const c = src[i], c2 = src.substr(i, 2), c4 = src.substr(i, 4);
        if (state === NORMAL) {
            if (c2 === '//') { state = LINE; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c2 === '/*') { state = BLOCK; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c4 === '<!--') { state = HTML; for (let k = 0; k < 4; k++) out[i + k] = ' '; i += 4; continue; }
            if (c === '"' || c === "'" || c === '`') { state = STR; quote = c; out[i] = c; i++; continue; }
            out[i] = c; i++; continue;
        }
        if (state === STR) {
            if (c === '\\') { out[i] = c; out[i + 1] = src[i + 1]; i += 2; continue; }
            if (c === quote) { state = NORMAL; }
            out[i] = c; i++; continue;
        }
        if (state === LINE && c === '\n') { state = NORMAL; out[i] = c; i++; continue; }
        if (state === BLOCK && c2 === '*/') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
        if (state === HTML && src.substr(i, 3) === '-->') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; out[i + 2] = ' '; i += 3; continue; }
        out[i] = (c === '\n') ? '\n' : ' ';
        i++;
    }
    return out.join('');
}
