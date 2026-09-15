// ============================================================================
// authReady RESOLVES ON A COLD CONSUMER ARRIVAL (2026-09-15).
//
// THE GAP THIS CLOSES. For a week every Chrome check ran against a firebase
// stand-in that was signed out and had NO signInAnonymously, so auth-boot.js
// reached for a function that was not there and window.authReady REJECTED
// ('anonymous-unavailable') on every cold arrival - a state no real visitor is
// in since anonymous sign-in went live. Nothing noticed, because no check
// asserted authReady's outcome. This one does.
//
// THE HARNESS NOW. tools/lib/cold-arrival.js (and journey.js) deliver an
// anonymous user BY DEFAULT - currentUser { uid: 'anon-cold', isAnonymous:
// true }, onAuthStateChanged emitting it, signInAnonymously resolving it - and
// take an `auth` option for the other two states by name: 'signed-out' (no
// user; signInAnonymously rejects with the SDK's offline code, so the state is
// stable) and an email organizer { uid, email, isAnonymous: false }.
// helpers/load-script.js (mini-dom) defaults the same way, with __auth.setUser
// as its override.
//
// Every row is a cold arrival on index.html through cold-arrival.js: the round
// through the data stub, no page function called. A pre-script only attaches
// .then to the promise the page creates, so its settlement is observed, not
// provoked.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');

const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [2, 9, 15, 4], 101);
const ROUND = { eventName: 'Cold Auth', courseName: 'Test', players: P, gameFormat: 'stroke', courseData: CD, scores: { p101_h1: 4 }, settlementMode: 'whole-dollar' };
const DB = { events: { COLDAUTH: ROUND }, global_courses: {}, trips: {}, tournaments: {} };

// Attaches to the promise the page creates; records the outcome and when.
const WATCH = `(function(){ var iv = setInterval(function(){ if (window.authReady) { clearInterval(iv); window.__seenAt = performance.now();
  window.authReady.then(function(u){ window.__settled = { ok: true, uid: u, at: performance.now() }; }, function(e){ window.__settled = { ok: false, code: e && e.code, at: performance.now() }; }); } }, 1); })();`;
const READ = `(function(){ var s = window.authBootState; var cu = null; try { cu = firebase.auth().currentUser; } catch (e) {}
  var card = document.getElementById('hole-view-card');
  return JSON.stringify({ settled: window.__settled || null, seenAt: window.__seenAt || null, state: s ? { status: s.status, uid: s.uid, reason: s.reason } : null,
    currentUser: cu ? { uid: cu.uid, isAnonymous: cu.isAnonymous, email: cu.email || null } : null,
    rendered: !!(card && (card.innerText || '').length > 50), boxes: card ? card.querySelectorAll('.score-input').length : 0 }); })()`;

async function arrive(auth) {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=COLDAUTH'), db: DB, preScript: WATCH, expression: READ, settleMs: 2500, auth });
    if (!r.ok) return { ran: false, reason: r.reason };
    return Object.assign({ ran: true }, JSON.parse(r.value));
}

const S = {};
before(async () => {
    S.dflt = await arrive(undefined);
    S.out = await arrive('signed-out');
    S.email = await arrive({ uid: 'u-org', email: 'org@example.com', isAnonymous: false });
});

describe('THE DEFAULT: a consumer cold arrival is an anonymous user, and authReady RESOLVES', () => {
    test('ran', () => assert.ok(S.dflt && S.dflt.ran, S.dflt && S.dflt.reason));
    test('authReady resolved to the anonymous uid; authBootState says signed-in; currentUser is anonymous', () => {
        const s = S.dflt;
        assert.ok(s.settled, 'the promise settled within the settle window');
        assert.equal(s.settled.ok, true, 'RESOLVED, not rejected: ' + JSON.stringify(s.settled));
        assert.equal(s.settled.uid, 'anon-cold');
        assert.deepEqual(s.state, { status: 'signed-in', uid: 'anon-cold', reason: null });
        assert.deepEqual(s.currentUser, { uid: 'anon-cold', isAnonymous: true, email: null });
    });
    test('the round rendered regardless (nothing waited): the hole view is on screen with its boxes', () => {
        assert.equal(S.dflt.rendered, true); assert.equal(S.dflt.boxes, 4);
    });
});

describe('THE NAMED STATES', () => {
    test('signed-out: no user, authReady REJECTS with the offline code, the round still renders', () => {
        const s = S.out; assert.ok(s.ran, s.reason);
        assert.ok(s.settled && s.settled.ok === false, 'rejected: ' + JSON.stringify(s.settled));
        assert.equal(s.settled.code, 'auth/network-request-failed');
        assert.equal(s.state.status, 'failed'); assert.equal(s.currentUser, null);
        assert.equal(s.rendered, true); assert.equal(s.boxes, 4);
    });
    test('an email user: authReady resolves to THAT uid (a persisted session is never clobbered), isAnonymous false', () => {
        const s = S.email; assert.ok(s.ran, s.reason);
        assert.ok(s.settled && s.settled.ok === true, JSON.stringify(s.settled));
        assert.equal(s.settled.uid, 'u-org');
        assert.deepEqual(s.currentUser, { uid: 'u-org', isAnonymous: false, email: 'org@example.com' });
    });
});

describe('THE SEAM (source, comments stripped): both harnesses and mini-dom default to an anonymous user', () => {
    ['tools/lib/cold-arrival.js', 'tools/lib/journey.js'].forEach(f => test(f, () => {
        const code = stripComments(read(f));
        assert.match(code, /if \(auth === undefined \|\| auth === 'anonymous'\) return \{ mode: 'anonymous', user: \{ uid: 'anon-cold', isAnonymous: true, email: null \} \};/);
        assert.match(code, /if \(auth === null \|\| auth === 'signed-out'\) return \{ mode: 'signed-out', user: null \};/);
        assert.match(code, /signInAnonymously: function \(\)/);
        assert.match(code, /get currentUser\(\) \{ return AUTH_USER; \}/);
        assert.match(code, /err\.code = 'auth\/network-request-failed';/);
        assert.ok(!/currentUser: null,/.test(code), 'the permanently signed-out stand-in is gone');
    }));
    test('helpers/load-script.js', () => {
        const code = stripComments(read('helpers/load-script.js'));
        assert.match(code, /const authState = \{ user: \{ uid: 'anon-stub', isAnonymous: true, email: null \} \};/);
        assert.match(code, /__auth: \{ setUser\(u\)/);
    });
});
