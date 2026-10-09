#!/usr/bin/env node
// ============================================================================
// A TAP IS VISIBLE, AND SO IS ITS ANSWER (2026-10-08)
//
// Manny reported a button doing nothing three times in two days. ONCE it
// genuinely did nothing. TWICE the app was answering and the sentence rendered
// below the fold - measured at top 832 of an 844px viewport on build 13. From
// the thumb those are the same thing, which is why this measures geometry and
// not just presence.
//
// WHAT ONLY A BROWSER CAN PROVE HERE, and why tap_feedback_test.js is not
// enough on its own: mini-dom's getBoundingClientRect is all-zero, so the
// suite cannot tell an on-screen answer from an off-screen one. That is the
// defect that shipped. It is measured here and nowhere else.
//
// TWO ARMS, because the failure path and the success path print different
// sentences and the harness can only reach one of them unaided:
//
//   A. NOTHING REPLACED. cold-arrival's stand-in has no
//      sendSignInLinkToEmail, so the app refuses with its own
//      auth/operation-not-allowed copy. That is correct behaviour, not a
//      fault: the arm proves a refusal is marked as a refusal, lands on
//      screen, and gives the button back.
//
//   B. THE BACKEND CALL REPLACED, and only that. A step defines
//      sendSignInLinkToEmail on the stand-in auth so it resolves after 900ms.
//      That is the same kind of substitution as the `db` fixture - the network
//      is stubbed, the page's own handler still runs. NO PAGE FUNCTION IS
//      CALLED by this check; every state change comes from a real .click().
//      The delay exists so the in-flight state can be read while it is still
//      in flight.
//
// EXIT: 0 when every arm is clean, 2 otherwise.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// Read one button and the answer line beside it. String.raw: a single
// backslash in a template literal is eaten, and that has produced two
// confidently wrong results in this repo already.
const LOOK = String.raw`function __look(id) {
    var b = document.getElementById(id);
    if (!b) return { missing: true };
    // THE LINE BOUND TO THIS BUTTON. Reading the first .tap-note in the box is
    // what hid the shared-line defect from the first run of this check: the
    // send's success note was reported as Finish sign-in's answer.
    var note = b.parentNode
      ? b.parentNode.querySelector('.tap-note[data-tap-for="' + id + '"]') : null;
    var r = note ? note.getBoundingClientRect() : null;
    return {
      label: String(b.innerHTML || '').replace(/<[^>]*>/g, '').trim().slice(0, 70),
      disabled: !!b.disabled,
      pressed: /is-pressed/.test(String(b.className || '')),
      note: note ? String(note.innerText || '').trim().slice(0, 120) : null,
      kind: note ? String(note.className || '') : null,
      noteTop: r ? Math.round(r.top) : null,
      noteBottom: r ? Math.round(r.bottom) : null,
      viewport: window.innerHeight,
      onScreen: r ? (r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0) : null
    };
}
'look installed'`;

const READ = "JSON.stringify({ send: __look('email-link-send'), finish: __look('email-link-finish'),"
    + " errs: (window.__errs || []).slice(0, 2) })";

async function run(served, arm) {
    const PRE = "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});";
    const steps = [{ sleep: 1500 }, { expression: LOOK },
        { expression: "(function(){var b=document.getElementById('oauth-email-toggle');"
            + "if(!b)return 'no email toggle on the account sheet';b.click();return 'tapped Use email instead';})()" },
        { sleep: 500 }];

    if (arm === 'resolves') {
        // THE BACKEND, NOT THE PAGE. Nothing below this line touches a function
        // the page defines.
        // firebase.auth() hands back a FRESH object literal on every call -
        // measured: a method set on one instance is gone by the next. So the
        // FACTORY is wrapped, not an instance.
        steps.push({ expression: "(function(){var orig=firebase.auth;"
            + "firebase.auth=function(){var a=orig.apply(firebase,arguments);"
            + "a.sendSignInLinkToEmail=function(){return new Promise(function(r){setTimeout(r,900);});};"
            + "return a;};"
            + "return 'the send now resolves after 900ms';})()" });
    }
    steps.push(
        // THE CLICK AND THE READ IN ONE EXPRESSION: no microtask can run
        // between them, so this is the state a thumb sees, not a state 600ms
        // later with the answer already in place.
        { expression: "(function(){var e=document.getElementById('email-link-input');"
            + "if(e)e.value='someone@example.com';var b=document.getElementById('email-link-send');"
            + "if(!b)return 'no send button';b.click();return 'tapped send -> ' + JSON.stringify(__look('email-link-send'));})()" },
        { sleep: 400 }, { expression: READ },
        { sleep: 2200 }, { expression: READ },
        { expression: "(function(){var p=document.getElementById('email-link-paste');"
            + "if(p)p.value='nonsense that is not a link';var b=document.getElementById('email-link-finish');"
            + "if(!b)return 'no finish button';b.click();return 'tapped finish with rubbish';})()" },
        { sleep: 1500 }, { expression: READ });

    const r = await arriveCold({
        url: 'http://127.0.0.1:' + served.port + '/admin.html?account=1',
        db: { events: {}, trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'anon-1', isAnonymous: true }, viewport: { width: 390, height: 844 },
        settleMs: 3800, preScript: PRE, steps
    });
    if (!r.ok) throw new Error('arrival: ' + r.reason);
    const vals = (r.value || []).map(v => String(v));
    const out = { taps: vals.filter(v => /^tapped|^no |^the send/.test(v)).map(v => v.slice(0, 60)) };
    const atClick = vals.find(v => v.indexOf('tapped send -> ') === 0);
    out.atClick = atClick ? JSON.parse(atClick.slice('tapped send -> '.length)) : null;
    const reads = vals.filter(v => v.charAt(0) === '{').map(v => JSON.parse(v));
    out.inFlight = reads[0]; out.settled = reads[1]; out.afterRubbish = reads[2];
    return out;
}

function judge(arm, a, faults) {
    const tag = '[' + arm + '] ';
    if ((a.settled && (a.settled.errs || []).length)) faults.push(tag + 'the page threw: ' + JSON.stringify(a.settled.errs));
    // 1. THE TAP IS VISIBLE THE INSTANT IT HAPPENS.
    const c = a.atClick || {};
    if (!(c.pressed || c.disabled || /Sending/.test(c.label || ''))) {
        faults.push(tag + 'the button showed nothing at the moment of the tap: ' + JSON.stringify(c));
    }
    // 2. THE ANSWER IS ON SCREEN, next to the button, and it is the right KIND.
    const s = a.settled || {};
    if (!s.send || !s.send.note) faults.push(tag + 'no answer line at all once the work finished: ' + JSON.stringify(s.send));
    else {
        if (s.send.onScreen !== true) {
            faults.push(tag + 'the answer is off screen (top ' + s.send.noteTop + ', bottom '
                + s.send.noteBottom + ', viewport ' + s.send.viewport + ') - this is exactly how '
                + '"it did nothing" happened on build 13');
        }
        if (arm === 'resolves') {
            // AND THE BUSY STATE SURVIVES REAL WORK, not only the synchronous
            // instant of the tap: read 400ms into a send that takes 900ms.
            const fl = a.inFlight && a.inFlight.send;
            if (!(fl && (fl.disabled || fl.pressed || /Sending/.test(fl.label || '')))) {
                faults.push(tag + 'the button went back to normal while the work was still running: '
                    + JSON.stringify(fl));
            }
            if (!/tap-note-ok/.test(s.send.kind || '')) faults.push(tag + 'a success is not marked as one: ' + s.send.kind);
            if (!/paste it below/i.test(s.send.note) || !/Gmail/i.test(s.send.note)) {
                faults.push(tag + 'the success line does not name the next step: ' + s.send.note);
            }
        } else {
            if (!/tap-note-fail/.test(s.send.kind || '')) faults.push(tag + 'a refusal is dressed as a success: ' + s.send.kind);
            if (!/not turned on/i.test(s.send.note)) faults.push(tag + 'the refusal is not the app’s own reason: ' + s.send.note);
        }
    }
    if (s.send && s.send.disabled) faults.push(tag + 'the button was left disabled after the work finished');
    // 3. A REFUSAL ON THE OTHER BUTTON IS MARKED, ON SCREEN, AND GIVES IT BACK.
    const f = a.afterRubbish || {};
    if (!f.finish || !f.finish.note) faults.push(tag + 'rubbish in the paste box produced no answer at all');
    else {
        if (!/tap-note-fail/.test(f.finish.kind || '')) faults.push(tag + 'the paste refusal is not marked as a refusal: ' + f.finish.kind);
        if (f.finish.disabled) faults.push(tag + 'Finish sign-in is stuck disabled after a refusal');
        if (f.finish.onScreen !== true) faults.push(tag + 'the paste refusal is off screen (top ' + f.finish.noteTop + ')');
    }
}

(async () => {
    const out = { what: 'a tap is visible, and so is its answer', faults: [] };
    const served = await serveRepo(REPO);
    try {
        out.refuses = await run(served, 'refuses');
        out.resolves = await run(served, 'resolves');
        judge('refuses', out.refuses, out.faults);
        judge('resolves', out.resolves, out.faults);
    } catch (e) {
        out.faults.push('check error: ' + String(e && e.message || e));
    } finally {
        try { served.server.close(); } catch (e) {}
    }
    out.ok = out.faults.length === 0;
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.ok ? 0 : 2);
})();
