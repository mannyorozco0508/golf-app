// ============================================================================
// ANONYMOUS AUTH AT BOOT (MONETIZATION.md step 1). auth-boot.js, one tag per
// Consumer page, fire-and-forget: it makes auth.uid exist and exposes
// window.authReady - a promise resolving to the uid or rejecting on failure -
// for the create path to await in a later wave. Nothing awaits it here.
//
// THE CONTRACT
//   - window.authReady exists from parse time on every Consumer page.
//   - it resolves to a uid when the SDK signs in (or restores a persisted
//     user); it rejects when sign-in fails (offline: auth/network-request-
//     failed), when the SDK is absent, or when it throws - and the rejection
//     reaches nobody who did not ask: no unhandledrejection, no alert, one
//     console.warn at most.
//   - no page waits for it: the round renders identically whether auth
//     succeeds, fails, or the SDK is missing entirely, and no inline script
//     awaits or .then()s authReady.
//   - tournament.html is EXCLUDED (step 0: its gates treat any user as an
//     organizer; an anonymous user would hide its sign-in form and become a
//     tournament's ownerUid). It keeps its own auth tag and email sign-in.
//
// HARNESS. mini-dom's firebase.auth() stub now carries signInAnonymously()
// (resolving a stub user) so auth-boot completes quietly in every page test;
// the rows below swap it for a rejecting one to reproduce offline.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CONSUMER = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html', 'sidematches.html', 'skins.html', 'stats.html', 'trip.html', 'shared.html'];
const tick = () => new Promise(r => setTimeout(r, 5));
const settled = (p, ms) => Promise.race([
    p.then(v => ({ state: 'resolved', value: v }), e => ({ state: 'rejected', error: e })),
    new Promise(r => setTimeout(() => r({ state: 'pending' }), ms || 60))
]);

function round() {
    const players = makePlayers(['Avery', 'Blake', 'Casey', 'Drew'], [0, 0, 0, 0]);
    const courseData = makeCourseData(18); const scores = {};
    players.forEach((p, i) => courseData.forEach(h => { if (h.hole <= 9) scores[`p${p.id}_h${h.hole}`] = h.par + (i % 2); }));
    return { eventName: 'Auth Boot', players, courseData, scores, gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: false };
}
// Arrive the way a golfer does: the page loads with the link; the round comes
// through the listener the page registered. `shape` reshapes the auth stub
// BEFORE auth-boot's zero-delay start fires.
function arrive(page, shape, search) {
    const sb = loadHtmlInlineScript(page, [], { search: search || '?game=AUTH01', beforeRun: shape });
    return sb;
}
function feed(sb, code) {
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/' + (code || 'AUTH01'));
    if (h) h.cb({ val: () => round(), exists: () => true });
    return sb;
}

// ---------------------------------------------------------------------------
describe('authReady — the promise every Consumer page exposes', () => {
    CONSUMER.forEach(p => test(p + ' exposes window.authReady at parse time, as a promise', () => {
        const sb = arrive(p);
        assert.ok(sb.authReady && typeof sb.authReady.then === 'function', 'window.authReady is a promise');
        assert.equal(sb.authReady, sb.window.authReady);
    }));

    test('resolves to the uid when sign-in succeeds', async () => {
        // A device with NO persisted user - the sign-in path. The harness defaults
        // to an anonymous user since 2026-09-15, so this starts from nobody.
        const sb = arrive('index.html', s => {
            s.__auth.setUser(null);
            s.firebase.auth().signInAnonymously = () => Promise.resolve({ user: { uid: 'anon-abc123', isAnonymous: true } });
        });
        const r = await settled(sb.authReady, 200);
        assert.equal(r.state, 'resolved');
        assert.equal(r.value, 'anon-abc123');
        assert.equal(sb.authBootState.status, 'signed-in');
        assert.equal(sb.authBootState.uid, 'anon-abc123');
    });

    test('THE HARNESS DEFAULT (2026-09-15): with nothing set, the page finds an anonymous user already there and authReady resolves to it without signInAnonymously', async () => {
        let called = 0;
        const sb = arrive('index.html', s => { s.firebase.auth().signInAnonymously = () => { called++; return Promise.resolve({ user: { uid: 'new' } }); }; });
        const r = await settled(sb.authReady, 200);
        assert.equal(r.state, 'resolved'); assert.equal(r.value, 'anon-stub');
        assert.equal(called, 0, 'the persisted path, as on a returning device');
        assert.equal(sb.firebase.auth().currentUser.isAnonymous, true);
    });

    test('a persisted user is used as-is; signInAnonymously is not called', async () => {
        let called = 0;
        const sb = arrive('index.html', s => {
            s.__auth.setUser({ uid: 'persisted-777', isAnonymous: true });
            s.firebase.auth().signInAnonymously = () => { called++; return Promise.resolve({ user: { uid: 'new' } }); };
        });
        const r = await settled(sb.authReady, 200);
        assert.equal(r.state, 'resolved'); assert.equal(r.value, 'persisted-777');
        assert.equal(called, 0, 'the restored session is the session');
    });

    test('rejects on network failure (offline), with the SDK\'s code, and throws nowhere else', async () => {
        const warns = [];
        const unhandled = [];
        const onUnhandled = e => unhandled.push(e);
        process.on('unhandledRejection', onUnhandled);
        try {
            const sb = arrive('index.html', s => {
                s.console = Object.assign({}, console, { warn: (...a) => warns.push(a.join(' ')) });
                s.__auth.setUser(null);   // no persisted user: the sign-in path
                s.firebase.auth().signInAnonymously = () => Promise.reject(Object.assign(new Error('network'), { code: 'auth/network-request-failed' }));
            });
            const r = await settled(sb.authReady, 200);
            assert.equal(r.state, 'rejected');
            assert.equal(r.error.code, 'auth/network-request-failed');
            assert.equal(sb.authBootState.status, 'failed');
            assert.equal(sb.authBootState.reason, 'auth/network-request-failed');
            await tick(); await tick();
            assert.equal(unhandled.length, 0, 'an un-awaited authReady must never surface as an unhandled rejection');
            assert.equal(warns.length, 1, 'one warn, no more: ' + JSON.stringify(warns));
            assert.match(warns[0], /auth-boot/);
        } finally { process.off('unhandledRejection', onUnhandled); }
    });

    test('rejects when the SDK is absent entirely (no firebase.auth), quietly', async () => {
        const unhandled = []; const onUnhandled = e => unhandled.push(e);
        process.on('unhandledRejection', onUnhandled);
        try {
            const sb = arrive('index.html', s => { delete s.firebase.auth; s.console = Object.assign({}, console, { warn: () => {} }); });
            const r = await settled(sb.authReady, 200);
            assert.equal(r.state, 'rejected');
            assert.equal(sb.authBootState.status, 'failed');
            assert.match(String(sb.authBootState.reason), /sdk-absent/);
            await tick();
            assert.equal(unhandled.length, 0);
        } finally { process.off('unhandledRejection', onUnhandled); }
    });

    test('rejects when signInAnonymously itself throws synchronously', async () => {
        const sb = arrive('index.html', s => {
            s.console = Object.assign({}, console, { warn: () => {} });
            s.__auth.setUser(null);   // no persisted user: the sign-in path
            s.firebase.auth().signInAnonymously = () => { throw Object.assign(new Error('boom'), { code: 'auth/operation-not-allowed' }); };
        });
        const r = await settled(sb.authReady, 200);
        assert.equal(r.state, 'rejected'); assert.equal(r.error.code, 'auth/operation-not-allowed');
    });
});

// ---------------------------------------------------------------------------
describe('FIRE AND FORGET — the page never waits', () => {
    // The scorecard renders from the value listener. Under three auth outcomes
    // the rendered hole view must be byte-identical.
    function renderUnder(shape) {
        const sb = arrive('index.html', shape);
        vm.runInContext('document.__mount(document.getElementById("hole-view-card")); document.__mount(document.getElementById("live-ticker-mount"));', sb);
        feed(sb);
        return String(vm.runInContext("document.getElementById('hole-view-card').innerHTML", sb));
    }
    test('the round renders identically whether auth succeeds, fails, or the SDK is absent', async () => {
        const ok = renderUnder(s => { s.firebase.auth().signInAnonymously = () => Promise.resolve({ user: { uid: 'u1' } }); });
        const fail = renderUnder(s => { s.console = Object.assign({}, console, { warn: () => {} }); s.firebase.auth().signInAnonymously = () => Promise.reject(Object.assign(new Error('x'), { code: 'auth/network-request-failed' })); });
        const absent = renderUnder(s => { s.console = Object.assign({}, console, { warn: () => {} }); delete s.firebase.auth; });
        const never = renderUnder(s => { s.firebase.auth().signInAnonymously = () => new Promise(() => {}); });
        assert.ok(ok.length > 500, 'the hole view rendered: ' + ok.length);
        assert.equal(fail, ok); assert.equal(absent, ok); assert.equal(never, ok);
        await tick();
    });

    test('the round renders BEFORE auth settles - authReady is still pending when the hole view is on screen', async () => {
        let resolveLater;
        const sb = arrive('index.html', s => { s.__auth.setUser(null); s.firebase.auth().signInAnonymously = () => new Promise(r => { resolveLater = r; }); });
        vm.runInContext('document.__mount(document.getElementById("hole-view-card"));', sb);
        feed(sb);
        const html = String(vm.runInContext("document.getElementById('hole-view-card').innerHTML", sb));
        assert.ok(html.length > 500);
        assert.equal((await settled(sb.authReady, 30)).state, 'pending', 'render did not wait for auth');
        resolveLater({ user: { uid: 'late' } });
        assert.equal((await settled(sb.authReady, 100)).value, 'late');
    });

    CONSUMER.forEach(p => test(p + ' never awaits or chains authReady in its own script', () => {
        const inline = read(p).replace(/<script src=[^>]*><\/script>/g, '');
        assert.doesNotMatch(inline, /authReady\s*\.\s*then|await\s+(window\.)?authReady|authReady\s*\.\s*catch/,
            'nothing on the page waits for auth in this wave');
    }));

    test('auth-boot.js itself awaits nothing at parse: the sign-in starts on a zero-delay timer, after initializeApp', () => {
        const src = read('auth-boot.js');
        assert.match(src, /window\.authReady = /);
        assert.match(src, /setTimeout\(start, 0\)/, 'the work is deferred past the parse');
        const code = src.replace(/\/\/[^\n]*/g, '');   // the comments talk about awaiting; the code must not
        assert.doesNotMatch(code, /\bawait\b|async function|async \(/, 'no await anywhere in the code (s.async is the script attribute)');
        assert.match(src, /ready\.catch\(function \(\) \{ \}\)/, 'an un-awaited rejection is swallowed by auth-boot itself');
        assert.doesNotMatch(src, /alert\(/, 'never an alert');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — one tag per page, the shell, and tournament.html left alone', () => {
    CONSUMER.forEach(p => test(p + ': one auth-boot.js tag, after firebase-app-compat.js and before the inline initializeApp; no auth SDK tag', () => {
        const s = read(p);
        const tags = s.match(/<script src="auth-boot\.js"><\/script>/g) || [];
        assert.equal(tags.length, 1, 'exactly one tag');
        const app = s.indexOf('firebase-app-compat.js'), boot = s.indexOf('<script src="auth-boot.js">'), inline = s.indexOf('<script>');
        assert.ok(app > -1 && app < boot && boot < inline, 'app-compat, then auth-boot, then the inline block');
        assert.doesNotMatch(s, /<script src="\.?\/?firebase-auth-compat\.js"/, 'the SDK is loaded by auth-boot, not by a blocking tag');
        assert.match(s, /<script src="auth-boot\.js">/, 'a synchronous tag: authReady exists from parse time');
    }));

    test('tournament.html keeps its own auth tag and loads no auth-boot tag', () => {
        const s = read('tournament.html');
        assert.match(s, /<script src="\.\/firebase-auth-compat\.js"><\/script>/);
        // The TAG is what is pinned. The page's own comment names auth-boot.js
        // since 2026-09-15, when it learned that leaving the tag out never kept
        // the anonymous user out (tournament_anonymous_owner_test.js).
        assert.doesNotMatch(s, /<script[^>]*src="[^"]*auth-boot\.js"/);
        assert.match(s, /signInWithEmailAndPassword/);
    });

    test('auth-boot.js loads the SDK itself when it is not already on the page, from its own directory', () => {
        const src = read('auth-boot.js');
        assert.match(src, /firebase-auth-compat\.js/);
        assert.match(src, /document\.createElement\('script'\)/);
        assert.match(src, /currentScript/);
        assert.match(src, /signInAnonymously/);
        assert.match(src, /onAuthStateChanged/, 'a persisted user is asked for before a new one is made');
        assert.match(src, /auth\/network-request-failed|err && err\.code/, 'the SDK\'s failure code is the reason');
    });

    test('the shell: auth-boot.js and firebase-auth-compat.js in SHARED_SHELL, the SDK no longer in TOURNAMENT_SHELL, and precached', () => {
        const sync = read('sync-mobile-web.js');
        const shared = sync.slice(sync.indexOf('const SHARED_SHELL'), sync.indexOf('const CONSUMER_SHELL'));
        const tourn = sync.slice(sync.indexOf('const TOURNAMENT_SHELL'), sync.indexOf('const FILES_TO_SYNC'));
        assert.match(shared, /'auth-boot\.js'/); assert.match(shared, /'firebase-auth-compat\.js'/);
        assert.doesNotMatch(tourn, /'firebase-auth-compat\.js'/);
        const sw = read('sw.js');
        assert.match(sw, /'\.\/auth-boot\.js'/); assert.match(sw, /'\.\/firebase-auth-compat\.js'/);
    });
});
