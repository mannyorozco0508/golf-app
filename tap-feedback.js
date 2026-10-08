// ============================================================================
// EVERY TAP SHOWS IT REGISTERED (2026-10-08)
//
// Manny, across three builds in two days: "Finish sign-in does NOTHING", "the
// tap does nothing". Twice the app WAS answering and the answer rendered below
// the fold - measured at top 832 of an 844px viewport. Once it genuinely did
// nothing. From the thumb there is no difference between those three, and that
// is the whole problem: a button that looks dead gets tapped again, and again,
// and then gets reported as broken.
//
// So one module answers for every button that goes and does something:
//
//   tapBusy(btn, 'Sending…')   pressed, disabled, and SAYING what it is doing
//   tapDone(btn, '✓ Email sent — copy the link from Gmail and paste it below')
//   tapFail(btn, 'That link has expired — send yourself a new one')
//
// THREE RULES IT EXISTS TO KEEP:
//   1. the tap is VISIBLE before the work finishes - a pressed state and words
//   2. the result lands NEXT TO THE BUTTON and is scrolled into view, because
//      the two "it did nothing" reports were both a sentence off the screen
//   3. a FAILURE restores the button. A button stuck on "Sending…" is worse
//      than the original defect: now it is dead AND lying.
//
// NO FRAMEWORK AND NO TIMERS. A result line stays until the next tap on that
// button - a self-dismissing receipt is exactly what a golfer misses while
// looking at the keyboard.
// ============================================================================
'use strict';

var TAP_ORIGINAL = '__tapOriginalLabel';

var TAP_NOTE_FOR = 'data-tap-for';
var TAP_NOTE_KEY = 'data-tap-key';
var TAP_SEQ = 0;

// THE ANSWER BELONGS TO ONE BUTTON, NOT TO THE BOX IT SITS IN (2026-10-08).
//
// The first version of this looked up `.tap-note` on the button's PARENT. The
// account sheet's email card holds two buttons in one container - "Email me a
// sign-in link" and "Finish sign-in" - so they shared a single line: tapping
// Finish overwrote the send's "copy the link from Gmail" instruction, and drew
// its own refusal up beside the OTHER button. Measured in Chrome by
// tools/tap-feedback-check.js, which is what caught it.
//
// Keyed by button, and the scan is over `children` with getAttribute rather
// than an attribute selector, because mini-dom's querySelector is not a
// selector engine and this has to work identically in both.
function tapNoteKey(btn) {
    if (btn.id) return String(btn.id);
    var own = btn.getAttribute(TAP_NOTE_KEY);
    if (own) return String(own);
    TAP_SEQ += 1;
    var made = 'tap-' + TAP_SEQ;
    btn.setAttribute(TAP_NOTE_KEY, made);
    return made;
}

function tapNoteFor(btn) {
    if (!btn || !btn.parentNode) return null;
    var key = tapNoteKey(btn);
    var kids = btn.parentNode.children || [];
    for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (!el || typeof el.getAttribute !== 'function') continue;
        if (/\btap-note\b/.test(String(el.className || ''))
            && String(el.getAttribute(TAP_NOTE_FOR) || '') === key) return el;
    }
    var note = document.createElement('div');
    note.className = 'tap-note';
    note.setAttribute('role', 'status');
    note.setAttribute(TAP_NOTE_FOR, key);
    // AFTER the button, so it reads as the answer to it rather than a caption
    // above it.
    if (btn.nextSibling) btn.parentNode.insertBefore(note, btn.nextSibling);
    else btn.parentNode.appendChild(note);
    return note;
}

function tapBusy(btn, workingText) {
    if (!btn) return;
    // REMEMBERED ONCE. A double tap used to overwrite the remembered label with
    // "Sending…", and the button never got its name back.
    if (btn.getAttribute(TAP_ORIGINAL) === null || btn.getAttribute(TAP_ORIGINAL) === undefined) {
        btn.setAttribute(TAP_ORIGINAL, btn.innerHTML);
    }
    btn.disabled = true;
    if (String(btn.className || '').indexOf('is-pressed') === -1) {
        btn.className = String(btn.className || '') + ' is-pressed';
    }
    if (workingText) btn.innerHTML = workingText;
}

function tapRestore(btn) {
    if (!btn) return;
    var was = btn.getAttribute(TAP_ORIGINAL);
    if (was !== null && was !== undefined) {
        btn.innerHTML = was;
        btn.removeAttribute(TAP_ORIGINAL);
    }
    btn.disabled = false;
    btn.className = String(btn.className || '').replace(/\s*is-pressed\b/g, '').trim();
}

function tapSay(btn, text, fail) {
    tapRestore(btn);
    var note = tapNoteFor(btn);
    if (!note) return;
    note.className = 'tap-note' + (fail ? ' tap-note-fail' : ' tap-note-ok');
    note.textContent = String(text || '');
    // SCROLLED INTO VIEW, which is the point. Both "it did nothing" reports
    // were a sentence the app had written and the golfer could not see.
    if (typeof note.scrollIntoView === 'function') {
        try { note.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        catch (e) { try { note.scrollIntoView(); } catch (e2) { /* nothing more to try */ } }
    }
}

function tapDone(btn, text) { tapSay(btn, text, false); }
function tapFail(btn, text) { tapSay(btn, text, true); }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tapBusy: tapBusy, tapDone: tapDone, tapFail: tapFail, tapRestore: tapRestore };
}
