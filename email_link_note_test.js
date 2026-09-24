// ============================================================================
// v214 — THE CONFIRMATION IS WRITTEN ON EVERY RUN.
//
// THE RACE, measured before anything was changed. email-link-auth.js's install()
// runs at parse time, in the HEAD (admin.html:45), and wraps window.authReady so
// that the moment the anonymous session resolves the link is completed and the
// note published. #email-link-status is in the BODY (admin.html:507). So whether
// the note lands depended on which won: the auth promise, or the parser.
//
// Five cold Chrome runs, instrumented on document.getElementById, on HEAD:
//   run 1  note=""     lookup at t=20ms  found=false  readyState=loading
//   run 2  note=""     lookup at t=18ms  found=false  readyState=loading
//   run 3  note="Signed in. This is the same organi…"  t=38ms  found=true
//   run 4  note="Signed in. This is the same organi…"  t=37ms  found=true
//   run 5  note=""     lookup at t=20ms  found=false  readyState=loading
// linked=1 and uid=anon-cold in ALL FIVE - the credential was always taken onto
// the anonymous user, exactly as v213 reported. setStatus looked the element up
// ONCE, and when it was not parsed yet:
//       var el = document.getElementById('email-link-status');
//       if (!el) return;                     // ... and the sentence was gone
// Nothing retried, which is why more settle time never helped: the write had
// already happened and been dropped.
//
// THE FIX. setStatus REMEMBERS the note and flushes it when the element exists -
// on DOMContentLoaded and on load, and through an exposed flushStatus() for a
// caller that renders the area itself. Every call site (publish, submitSend,
// submitPaste, and install()'s two error arms) goes through that one function,
// so there is one place to fix and one place to test.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. mini-dom's document.addEventListener is a
// NO-OP and it has no document.readyState, so it cannot fire DOMContentLoAded and
// must not be asked to: these tests drive the REMEMBER-and-FLUSH mechanism
// directly. That the browser's own events reach it is measured by
// tools/email-link-note-check.js, which opens the real page cold - five runs of
// each of the three outcomes - and is the only proof of the wiring.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('email-link-auth.js');
const run = (sb, c) => vm.runInContext(c, sb);

// The module in a realm where getElementById('email-link-status') answers NULL -
// the state the page is really in when install()'s chain resolves before the
// parser has reached the body.
//
// HOW, and why it looks indirect: mini-dom's getElementById AUTO-CREATES a
// registry element for any id it has not seen, so "the element is not there yet"
// cannot be reached by simply not declaring it. Declaring it and removing it is
// how this harness answers null - the same way a browser does after remove() -
// and it is the only absence it can express.
function moduleNoElement() {
    const sb = loadJsFile('email-link-auth.js');
    run(sb, "document.__declare('email-link-status', 'p').remove();");
    assert.equal(run(sb, "document.getElementById('email-link-status')"), null,
        'the harness really does answer null for it');
    return sb;
}
// ... and the same realm once the element is in the tree, the way the parser
// puts it there. getElementById looks in the tree first, so this is found.
function mountStatus(sb) {
    run(sb, "(function () { var e = document.createElement('p'); e.id = 'email-link-status'; document.__mount(e); })();");
    return sb;
}
const statusText = (sb) => String(run(sb, "(function () { var el = document.getElementById('email-link-status'); return el ? String(el.textContent || '') : null; })()"));

// ---------------------------------------------------------------------------
describe('1. THE NOTE IS REMEMBERED WHEN THERE IS NOWHERE TO PUT IT YET', () => {
    test('a note set before the element exists is not lost - it is held', () => {
        const sb = moduleNoElement();
        run(sb, "window.emailLinkAuth.setStatus('Signed in. Held for the parser.');");
        assert.equal(run(sb, 'window.emailLinkAuth.lastNote'), 'Signed in. Held for the parser.',
            'the note is remembered: ' + run(sb, 'JSON.stringify(window.emailLinkAuth.lastNote)'));
    });
    test('and it lands the moment the element is there', () => {
        const sb = moduleNoElement();
        run(sb, "window.emailLinkAuth.setStatus('Signed in. Held for the parser.');");
        mountStatus(sb);
        assert.equal(statusText(sb), '', 'nothing has flushed it yet');
        run(sb, 'window.emailLinkAuth.flushStatus();');
        assert.equal(statusText(sb), 'Signed in. Held for the parser.');
    });
    test('with the element already there it is written straight away, no flush needed', () => {
        const sb = mountStatus(moduleNoElement());
        run(sb, "window.emailLinkAuth.setStatus('Written at once.');");
        assert.equal(statusText(sb), 'Written at once.');
    });
    test('the LAST note wins - a flush cannot resurrect an earlier one', () => {
        const sb = moduleNoElement();
        run(sb, "window.emailLinkAuth.setStatus('Finishing sign-in…');");
        run(sb, "window.emailLinkAuth.setStatus('Signed in. This is the same organizer account.');");
        mountStatus(sb);
        run(sb, 'window.emailLinkAuth.flushStatus();');
        assert.equal(statusText(sb), 'Signed in. This is the same organizer account.');
    });
    test('THE ARMING: a note with nowhere to go registers the flush on the browser\'s own events', () => {
        // This is the one unit assertion that the RACE itself would break. The
        // rest of this block tests remember-and-flush as parts; only this says
        // that setStatus asks to be called back. mini-dom's addEventListener is a
        // no-op, so it is WRAPPED here to record what was registered - the page is
        // untouched, and what is asserted is what the page asked for.
        const sb = moduleNoElement();
        run(sb, "window.__reg = [];"
            + " document.addEventListener = function (t, f) { window.__reg.push('document:' + t + ':' + (f === window.emailLinkAuth.flushStatus)); };"
            + " window.addEventListener = function (t, f) { window.__reg.push('window:' + t + ':' + (f === window.emailLinkAuth.flushStatus)); };");
        run(sb, "window.emailLinkAuth.setStatus('Held, and asking to be called back.');");
        const reg = JSON.parse(run(sb, 'JSON.stringify(window.__reg)'));
        assert.ok(reg.indexOf('document:DOMContentLoaded:true') > -1,
            'DOMContentLoaded is registered, with flushStatus itself: ' + JSON.stringify(reg));
        assert.ok(reg.indexOf('window:load:true') > -1,
            'and load, for a note set after DOMContentLoaded had gone: ' + JSON.stringify(reg));
    });
    test('and it arms only once, however many notes are set', () => {
        const sb = moduleNoElement();
        run(sb, "window.__reg = [];"
            + " document.addEventListener = function (t) { window.__reg.push('document:' + t); };"
            + " window.addEventListener = function (t) { window.__reg.push('window:' + t); };");
        run(sb, "window.emailLinkAuth.setStatus('one'); window.emailLinkAuth.setStatus('two'); window.emailLinkAuth.setStatus('three');");
        const reg = JSON.parse(run(sb, 'JSON.stringify(window.__reg)'));
        assert.equal(reg.length, 2, 'two listeners, not six: ' + JSON.stringify(reg));
        assert.equal(run(sb, 'window.emailLinkAuth.lastNote'), 'three', 'and the latest note is the one held');
    });
    test('a flush with nothing remembered writes nothing, rather than blanking a note the page put there', () => {
        const sb = mountStatus(moduleNoElement());
        run(sb, "document.getElementById('email-link-status').textContent = 'the page said this';");
        run(sb, 'window.emailLinkAuth.flushStatus();');
        assert.equal(statusText(sb), 'the page said this', 'an empty memory does not clear the element');
    });
});

// ---------------------------------------------------------------------------
// EVERY SENTENCE THIS MODULE CAN SAY survives a late element. The mapping from
// an error code to its sentence is messageFor's, and the existing suite covers
// that; what is new here is that NONE of them can be dropped on the way out.
describe('2. EVERY OUTCOME\'S SENTENCE SURVIVES A LATE ELEMENT', () => {
    const L = loadJsFile('email-link-auth.js');
    const NOTES = {
        preserved: run(L, 'window.emailLinkAuth.NOTE_PRESERVED'),
        adopted: run(L, 'window.emailLinkAuth.NOTE_ADOPTED'),
        fresh: run(L, 'window.emailLinkAuth.NOTE_FRESH'),
        sent: run(L, 'window.emailLinkAuth.NOTE_SENT'),
        needEmail: run(L, 'window.emailLinkAuth.NOTE_NEED_EMAIL')
    };
    const CODES = ['auth/operation-not-allowed', 'auth/unauthorized-domain', 'sdk-absent',
        'auth/invalid-email', 'auth/invalid-action-code', 'auth/expired-action-code',
        'link-unavailable', 'link-uid-changed', 'auth/missing-email', 'something-nobody-mapped'];

    test('the three success sentences', () => {
        Object.keys(NOTES).forEach(k => {
            assert.ok(NOTES[k] && String(NOTES[k]).length > 10, k + ' is a real sentence: ' + NOTES[k]);
            const sb = moduleNoElement();
            run(sb, 'window.emailLinkAuth.setStatus(' + JSON.stringify(NOTES[k]) + ');');
            mountStatus(sb);
            run(sb, 'window.emailLinkAuth.flushStatus();');
            assert.equal(statusText(sb), NOTES[k], k + ' was dropped');
        });
    });
    test('and every failure code\'s sentence, including an unmapped one', () => {
        CODES.forEach(code => {
            const sb = moduleNoElement();
            const msg = run(sb, 'window.emailLinkAuth.messageFor(' + JSON.stringify({ code }) + ')');
            assert.ok(msg && String(msg).length > 10, code + ' has a sentence: ' + msg);
            run(sb, 'window.emailLinkAuth.setStatus(' + JSON.stringify(msg) + ');');
            mountStatus(sb);
            run(sb, 'window.emailLinkAuth.flushStatus();');
            assert.equal(statusText(sb), msg, code + '’s sentence was dropped');
        });
    });
    test('THE SECOND-DEVICE SENTENCE is the adopted one, and it is not the preserved one', () => {
        // migrationNote decides which of the three a completion earns: the same uid
        // back is "preserved", a different uid is the second device "adopting" the
        // account, and no uid before is "fresh".
        const before = { uid: 'anon-cold' };
        assert.equal(run(L, 'window.emailLinkAuth.migrationNote(' + JSON.stringify(before) + ', ' + JSON.stringify({ uid: 'anon-cold' }) + ')'), NOTES.preserved);
        assert.equal(run(L, 'window.emailLinkAuth.migrationNote(' + JSON.stringify(before) + ', ' + JSON.stringify({ uid: 'u-email' }) + ')'), NOTES.adopted);
        assert.equal(run(L, 'window.emailLinkAuth.migrationNote(null, ' + JSON.stringify({ uid: 'u-email' }) + ')'), NOTES.fresh);
        assert.notEqual(NOTES.adopted, NOTES.preserved);
    });
});

// ---------------------------------------------------------------------------
describe('3. THE SEAM: one function, armed for the parser', () => {
    test('every call site goes through the note mechanism - no third writer of that element', () => {
        // Two lookups, and both belong to the mechanism: setStatus (write now) and
        // flushStatus (write when it arrives). A third would be a path that could
        // drop a sentence again.
        //
        // COMMENTS STRIPPED FIRST. The fix's own comment quotes the line it
        // replaced, so counting raw source found three and called a correct file
        // wrong - the repo has paid for that mistake before.
        const code = SRC.replace(/\/\/[^\n]*/g, '');
        const writers = (code.match(/getElementById\('email-link-status'\)/g) || []).length;
        assert.equal(writers, 2, 'looked up in exactly two places: ' + writers);
        ['function setStatus(', 'function flushStatus('].forEach(fnName => {
            const at = code.indexOf(fnName);
            assert.ok(at > 0, fnName + ' exists');
            const body = code.slice(at, code.indexOf('\n    function ', at + 30));
            assert.match(body, /getElementById\('email-link-status'\)/, fnName + ' is one of the two');
        });
        // and the page does not write it either.
        const admin = read('admin.html').replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/getElementById\(['"]email-link-status['"]\)/.test(admin),
            'admin.html does not write the note itself - email-link-auth.js owns it');
        assert.match(admin, /id="email-link-status"/, 'but the page does provide the element');
    });
    test('setStatus remembers before it writes, so no path can drop a sentence', () => {
        const at = SRC.indexOf('function setStatus(');
        assert.ok(at > 0, 'setStatus is still there');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
        assert.match(fn, /lastNote/, 'it keeps the note: ' + fn);
        // The old shape - look up, bail, forget - must not come back.
        assert.ok(!/^\s*var el = document\.getElementById\('email-link-status'\);\s*\n\s*if \(!el\) return;\s*\n/m.test(fn),
            'the drop-and-forget shape is gone: ' + fn);
    });
    test('the flush is armed on the browser\'s own events, and mini-dom cannot fire them', () => {
        const at = SRC.indexOf('function armFlush(');
        assert.ok(at > 0, 'the arming is its own function');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
        assert.match(fn, /DOMContentLoaded/, 'DOMContentLoaded: ' + fn);
        assert.match(fn, /'load'/, 'and load, for a note set after DOMContentLoaded had already passed');
        assert.match(fn, /readyState/, 'and it only arms while the document is still coming in');
        // Said plainly, because this is the half tools/email-link-note-check.js owns:
        // mini-dom's document.addEventListener is a no-op, so a test here that
        // "fired" DOMContentLoaded would be asserting the mock.
    });
});
