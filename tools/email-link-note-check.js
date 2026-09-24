#!/usr/bin/env node
// ============================================================================
// THE EMAIL-LINK CONFIRMATION IS WRITTEN ON EVERY RUN - in Chrome (v214).
//
// WHY THIS TOOL EXISTS. The sentence was dropped about half the time, and no
// unit test could see it: mini-dom's document.addEventListener is a no-op and it
// has no document.readyState, so the thing that decided the outcome - whether
// window.authReady resolved before or after the parser reached
// #email-link-status - does not exist in that harness at all.
//
// MEASURED ON HEAD, five cold runs, instrumented on document.getElementById:
//   note=""  lookup t=20ms  found=false  readyState=loading
//   note=""  lookup t=18ms  found=false  readyState=loading
//   note="Signed in. This is the same organi…"  t=38ms  found=true
//   note="Signed in. This is the same organi…"  t=37ms  found=true
//   note=""  lookup t=20ms  found=false  readyState=loading
// linked=1 and uid=anon-cold in all five: the credential was ALWAYS taken onto
// the anonymous user. Only the sentence was lost, and only when the parser was
// slower than the promise.
//
// WHAT THIS RUNS. Three outcomes, five cold arrivals each, on the real
// admin.html with the real email-link-auth.js:
//   preserved  linkWithCredential resolves on the same uid  -> NOTE_PRESERVED
//   adopted    linkWithCredential rejects credential-already-in-use and
//              signInWithEmailLink returns a DIFFERENT uid   -> NOTE_ADOPTED
//              (the second device, the case that carries the trial and the pass)
//   bad link   linkWithCredential rejects auth/invalid-action-code -> NOTE_BAD_LINK
// Each run also records whether the element existed at the moment setStatus
// looked for it, so a green run that never raced is not mistaken for a fix.
//
// IT CALLS NOTHING THE PAGE DEFINES. The stubs replace the DATA SOURCE - the
// firebase auth object - before any page script runs, and the only thing read
// afterwards is innerText.
//
// RUN IT: node tools/email-link-note-check.js [runs]
// Exit 0 = every run of every outcome wrote its sentence; 1 = one did not;
// 2 = the harness could not run.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const RUNS = Number(process.argv[2] || 5);
const DB = { events: {}, organizers: {}, global_courses: {}, trips: {}, tournaments: {} };

// The sentences, read from the module itself so this tool cannot drift from it.
const SRC = fs.readFileSync(path.join(REPO_ROOT, 'email-link-auth.js'), 'utf8');
const noteConst = (name) => {
    const m = SRC.match(new RegExp('var ' + name + " = '((?:[^'\\\\]|\\\\.)*)'"));
    if (!m) throw new Error('could not read ' + name + ' from email-link-auth.js');
    return m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
};
const EXPECT = {
    preserved: noteConst('NOTE_PRESERVED'),
    adopted: noteConst('NOTE_ADOPTED'),
    badlink: noteConst('NOTE_BAD_LINK')
};

// WATCH: did the element exist when setStatus looked for it? This is what tells a
// fixed run from a lucky one.
const WATCH = `
window.__lookups = [];
(function () {
  var orig = document.getElementById.bind(document);
  document.getElementById = function (id) {
    var el = orig(id);
    if (id === 'email-link-status') {
      window.__lookups.push({ found: !!el, readyState: document.readyState, t: Math.round(performance.now()) });
    }
    return el;
  };
})();
`;
const PENDING = `
try {
  localStorage.setItem('golfapp_email_for_sign_in', 'marty@example.com');
  localStorage.setItem('golfapp_email_link_uid', 'anon-cold');
} catch (e) {}
`;
// The three auth stubs. Each replaces firebase.auth before the page's own
// scripts run; nothing of the page is called.
const STUBS = {
    preserved: `
(function () {
  var orig = window.firebase.auth;
  var cached = null;                       // a singleton, as the real SDK is
  function wrapped() {
    if (cached) return cached;
    var a = orig();
    a.isSignInWithEmailLink = function (u) { var s = String(u || ''); return /[?&]oobCode=/.test(s) && /[?&]mode=signIn/.test(s); };
    a.signInWithEmailLink = function () { window.__signedIn = (window.__signedIn || 0) + 1; return Promise.reject(new Error('should not run')); };
    var u = a.currentUser;
    if (u && typeof u.linkWithCredential !== 'function') {
      u.linkWithCredential = function (cred) {
        window.__linked = (window.__linked || 0) + 1;
        u.isAnonymous = false; u.email = cred && cred.email;
        return Promise.resolve({ user: { uid: u.uid, isAnonymous: false, email: u.email } });
      };
    }
    cached = a;
    return a;
  }
  wrapped.EmailAuthProvider = { credentialWithLink: function (e, u) { return { email: e, url: u }; } };
  window.firebase.auth = wrapped;
})();`,
    adopted: `
(function () {
  var orig = window.firebase.auth;
  // CACHED, because firebase.auth() is a SINGLETON in the real SDK. The first
  // version of this stub called orig() on every access, so replacing
  // currentUser on the second-device path was lost the moment anything asked
  // for auth() again - and the check read that as the page reporting the wrong
  // sentence. A harness fault, not a page fault.
  var cached = null;
  function wrapped() {
    if (cached) return cached;
    var a = orig();
    a.isSignInWithEmailLink = function (u) { var s = String(u || ''); return /[?&]oobCode=/.test(s) && /[?&]mode=signIn/.test(s); };
    // THE NEW USER COMES BACK ON THE CREDENTIAL, not by assigning currentUser:
    // cold-arrival exposes currentUser as a GETTER, so assigning to it silently
    // does nothing in non-strict mode and the second device looked like it had
    // stayed on the anonymous uid. email-link-auth.js's userFrom reads the
    // credential's user first, which is what the real SDK hands back too.
    a.signInWithEmailLink = function () {
      window.__signedIn = (window.__signedIn || 0) + 1;
      return Promise.resolve({ user: { uid: 'u-email-account', isAnonymous: false, email: 'marty@example.com' } });
    };
    var u = a.currentUser;
    if (u && typeof u.linkWithCredential !== 'function') {
      u.linkWithCredential = function () {
        window.__linked = (window.__linked || 0) + 1;
        var e = new Error('already'); e.code = 'auth/credential-already-in-use';
        return Promise.reject(e);
      };
    }
    cached = a;
    return a;
  }
  wrapped.EmailAuthProvider = { credentialWithLink: function (e, u) { return { email: e, url: u }; } };
  window.firebase.auth = wrapped;
})();`,
    badlink: `
(function () {
  var orig = window.firebase.auth;
  var cached = null;                       // a singleton, as the real SDK is
  function wrapped() {
    if (cached) return cached;
    var a = orig();
    a.isSignInWithEmailLink = function (u) { var s = String(u || ''); return /[?&]oobCode=/.test(s) && /[?&]mode=signIn/.test(s); };
    a.signInWithEmailLink = function () {
      var e = new Error('expired'); e.code = 'auth/invalid-action-code';
      return Promise.reject(e);
    };
    var u = a.currentUser;
    if (u && typeof u.linkWithCredential !== 'function') {
      u.linkWithCredential = function () {
        var e = new Error('expired'); e.code = 'auth/invalid-action-code';
        return Promise.reject(e);
      };
    }
    cached = a;
    return a;
  }
  wrapped.EmailAuthProvider = { credentialWithLink: function (e, u) { return { email: e, url: u }; } };
  window.firebase.auth = wrapped;
})();`
};

const PROBE = `JSON.stringify({
    note: (function () { var el = document.getElementById('email-link-status'); return el ? String(el.innerText || '').trim() : null; })(),
    lookups: window.__lookups || [],
    linked: window.__linked || 0,
    signedIn: window.__signedIn || 0,
    uid: (window.authBootState && window.authBootState.uid) || null
})`;

const log = (...a) => console.log(...a);
let failures = 0;

async function once(kind) {
    const r = await arriveCold({
        url: fileUrl('admin.html', 'apiKey=test-key&oobCode=oob-cold&mode=signIn&lang=en'),
        db: DB, settleMs: 4000, viewport: { width: 390, height: 844 },
        preScript: WATCH + PENDING + STUBS[kind],
        expression: PROBE
    });
    if (!r.ok) return { harness: r.reason };
    try { return JSON.parse(r.value); } catch (e) { return { harness: 'unreadable probe: ' + r.value }; }
}

(async () => {
    log('THE EMAIL-LINK CONFIRMATION, ' + RUNS + ' cold runs of each outcome');
    for (const kind of ['preserved', 'adopted', 'badlink']) {
        log('');
        log(kind.toUpperCase() + '  expecting: ' + JSON.stringify(EXPECT[kind].slice(0, 60) + '…'));
        let wrote = 0, raced = 0;
        for (let i = 1; i <= RUNS; i++) {
            const v = await once(kind);
            if (v.harness) { log('  run ' + i + '  HARNESS: ' + v.harness); process.exitCode = 2; return; }
            const ok = v.note === EXPECT[kind];
            // "raced" = setStatus looked the element up before the parser got to it.
            // A run that never raced proves nothing about the fix, so the count is
            // reported and a run where NONE raced is called out.
            const missed = (v.lookups || []).filter(l => !l.found).length;
            if (missed > 0) raced++;
            if (ok) wrote++; else failures++;
            log('  run ' + i + '  ' + (ok ? 'wrote' : 'MISSING') + '  linked=' + v.linked + ' signedIn=' + v.signedIn
                + ' uid=' + v.uid + '  lookups=' + JSON.stringify((v.lookups || []).map(l => (l.found ? 'found' : 'absent') + '@' + l.t + 'ms'))
                + (ok ? '' : '  note=' + JSON.stringify(v.note)));
        }
        log('  => ' + wrote + '/' + RUNS + ' wrote the sentence; ' + raced + '/' + RUNS + ' hit the race (element absent at first lookup)');
        if (raced === 0) log('  NOTE: no run hit the race, so these runs do not exercise the fix - re-run, or the timing has shifted');
    }
    log('');
    log(failures ? failures + ' run(s) did not write the sentence' : 'every run of every outcome wrote its sentence');
    process.exitCode = failures ? 1 : 0;
})();
