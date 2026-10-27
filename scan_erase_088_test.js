// ============================================================================
// 088 item 1 (078 "ADDED Oct 26" must-have): DELETE ACCOUNT ALSO ERASES THE
// SCORECARD-SCAN COUNTS - the app half (account-exit.js scanEraser /
// retryScanErase, wired by admin.html). The server half (POST /api/scan-erase,
// functions/api/_scan.js handleScanErase) and its own tests are on the web branch
// 088-scan-erase-web; this branch carries only the client.
//
// What is held:
//   - Delete account calls the erase AFTER the data removals and BEFORE the
//     account itself goes (the token is still good), with this account's own
//     ID token and nothing else - no uid, no body fields.
//   - THE DELETE STILL COMPLETES when the scan server cannot be reached
//     (offline / timeout / not deployed), and a pending note is kept so the next
//     page load retries it; the retry clears the note on success, drops an
//     expired or refused token, and keeps it on another failure.
//   - A delete that STOPS (a hard removal refused) never touches the counts.
//   - Negative control: with no scanErase dep (an older page) nothing is fetched
//     and the delete is exactly what it was.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const NOW = Date.parse('2026-10-26T21:00:00Z');
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenFor = (uid, expMs) => b64u('{"alg":"RS256"}') + '.' + b64u(JSON.stringify({ sub: uid, exp: Math.floor(expMs / 1000) })) + '.sig';

function memStore() {
    const m = new Map();
    return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function load() {
    const sb = loadJsFile('account-exit.js');
    sb.atob = (s) => Buffer.from(s, 'base64').toString('binary');
    return sb;
}
// A fetch that records every call. reply(url, init) -> a Response-ish, or throws.
function recFetch(reply, log) {
    const calls = [];
    const fn = (url, init) => {
        calls.push({ url: String(url), init });
        if (log) log.push('fetch ' + String(url));
        return Promise.resolve().then(() => reply(url, init));
    };
    fn.calls = calls;
    return fn;
}
const okErase = () => ({ status: 200, json: () => Promise.resolve({ status: 'erased', erased: 3 }) });
const offline = () => { throw new TypeError('Load failed'); };

function userFor(uid, log, tok) {
    return {
        uid, isAnonymous: false, email: 'test@example.com', providerData: [{ providerId: 'google.com' }],
        getIdToken: () => Promise.resolve(tok || tokenFor(uid, NOW + 3600 * 1000)),
        delete: () => { log.push('user.delete'); return Promise.resolve(); }
    };
}
function dbFor(log, refuse) {
    return {
        ref: (p) => ({
            once: () => Promise.resolve({ val: () => null }),
            remove: () => {
                log.push('remove ' + p);
                if (refuse && refuse(p)) return Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }));
                return Promise.resolve();
            }
        })
    };
}

describe('088 Delete account erases the scan counts (app)', () => {
    test('the erase runs after the data removals and before the account goes, with this account\'s own token only', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const log = [];
        const user = userFor('uid-me', log);
        const auth = { currentUser: user };
        const f = recFetch(okErase, log);
        const store = memStore();
        const out = await X.deleteAccount({
            auth, db: dbFor(log), reload: () => {},
            scanErase: X.scanEraser({ auth, fetch: f, base: 'https://golf-app-5a5.pages.dev', storage: store })
        });
        assert.equal(out.deleted, true);
        assert.equal(out.scanErased, true);
        assert.equal(out.scanErasePending, false);
        assert.equal(f.calls.length, 1);
        const c = f.calls[0];
        assert.equal(c.url, 'https://golf-app-5a5.pages.dev/api/scan-erase');
        assert.equal(c.init.method, 'POST');
        assert.equal(c.init.headers.Authorization, 'Bearer ' + tokenFor('uid-me', NOW + 3600 * 1000));
        assert.equal(c.init.body, '{}', 'no uid or anything else in the body: the server takes the uid from the token');
        const iFetch = log.indexOf('fetch https://golf-app-5a5.pages.dev/api/scan-erase');
        const iLastRemove = Math.max(...log.map((l, i) => (/^remove /.test(l) ? i : -1)));
        assert.ok(iFetch > iLastRemove, 'after the removals: ' + log.join(' | '));
        assert.ok(iFetch < log.indexOf('user.delete'), 'before the Auth user goes: ' + log.join(' | '));
        assert.equal(store.getItem(X.SCAN_PENDING_KEY), null, 'nothing left pending');
    });

    test('OFFLINE: the delete still completes, and the erase is kept to retry on the next load', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const log = [];
        const tok = tokenFor('uid-me', NOW + 3600 * 1000);
        const user = userFor('uid-me', log, tok);
        const auth = { currentUser: user };
        const store = memStore();
        const out = await X.deleteAccount({
            auth, db: dbFor(log), reload: () => {},
            scanErase: X.scanEraser({ auth, fetch: recFetch(offline), base: '', storage: store })
        });
        assert.equal(out.deleted, true, 'no signal for the scan server is never a reason to keep an account');
        assert.ok(log.includes('user.delete'));
        assert.equal(out.scanErased, false);
        assert.equal(out.scanErasePending, true);
        const rec = JSON.parse(store.getItem(X.SCAN_PENDING_KEY));
        assert.equal(rec.token, tok);
        assert.equal(rec.until, Math.floor((NOW + 3600 * 1000) / 1000) * 1000);
        // THE NEXT LOAD, with signal.
        const f2 = recFetch(okErase);
        assert.equal(await X.retryScanErase({ fetch: f2, base: '', storage: store, now: () => NOW + 60000 }), 'erased');
        assert.equal(f2.calls[0].init.headers.Authorization, 'Bearer ' + tok);
        assert.equal(store.getItem(X.SCAN_PENDING_KEY), null, 'the note is cleared once it worked');
    });

    test('a server that answers but is not deployed / not configured / slow-failing also never stops the delete', async () => {
        for (const reply of [
            () => ({ status: 404, json: () => Promise.resolve({ status: 'unavailable', reason: 'no_such_route' }) }),
            () => ({ status: 503, json: () => Promise.resolve({ status: 'not_configured' }) }),
            () => ({ status: 200, json: () => Promise.reject(new Error('not json')) })
        ]) {
            const sb = load();
            const X = sb.window.accountExit;
            const log = [];
            const auth = { currentUser: userFor('uid-me', log) };
            const store = memStore();
            const out = await X.deleteAccount({ auth, db: dbFor(log), reload: () => {},
                scanErase: X.scanEraser({ auth, fetch: recFetch(reply), base: '', storage: store }) });
            assert.equal(out.deleted, true);
            assert.equal(out.scanErasePending, true);
        }
        // and a scanErase that throws outright is swallowed too
        const sb = load();
        const log = [];
        const out = await sb.window.accountExit.deleteAccount({ auth: { currentUser: userFor('uid-me', log) }, db: dbFor(log), reload: () => {},
            scanErase: () => { throw new Error('boom'); } });
        assert.equal(out.deleted, true);
        assert.equal(out.scanErased, false);
    });

    test('the retry drops an expired or refused token, and keeps one that failed again', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const store = memStore();
        store.setItem(X.SCAN_PENDING_KEY, JSON.stringify({ token: 't', until: NOW - 1 }));
        const f = recFetch(okErase);
        assert.equal(await X.retryScanErase({ fetch: f, base: '', storage: store, now: () => NOW }), 'expired');
        assert.equal(f.calls.length, 0, 'an expired token is never sent');
        assert.equal(store.getItem(X.SCAN_PENDING_KEY), null);

        store.setItem(X.SCAN_PENDING_KEY, JSON.stringify({ token: 't', until: NOW + 1000 }));
        assert.equal(await X.retryScanErase({ fetch: recFetch(() => ({ status: 401, json: () => Promise.resolve({}) })), base: '', storage: store, now: () => NOW }), 'refused');
        assert.equal(store.getItem(X.SCAN_PENDING_KEY), null, 'a refused token cannot ever work: dropped');

        store.setItem(X.SCAN_PENDING_KEY, JSON.stringify({ token: 't', until: NOW + 1000 }));
        assert.equal(await X.retryScanErase({ fetch: recFetch(offline), base: '', storage: store, now: () => NOW }), 'failed');
        assert.notEqual(store.getItem(X.SCAN_PENDING_KEY), null, 'still offline: kept for the next load');

        assert.equal(await X.retryScanErase({ fetch: f, base: '', storage: memStore(), now: () => NOW }), 'none');
        assert.equal(f.calls.length, 0, 'nothing pending, nothing sent');
    });

    test('a 401 at delete time is not kept (the token was refused)', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const log = [];
        const auth = { currentUser: userFor('uid-me', log) };
        const store = memStore();
        const out = await X.deleteAccount({ auth, db: dbFor(log), reload: () => {},
            scanErase: X.scanEraser({ auth, fetch: recFetch(() => ({ status: 401, json: () => Promise.resolve({ status: 'refused', reason: 'sign_in' }) })), base: '', storage: store }) });
        assert.equal(out.deleted, true);
        assert.equal(out.scanErasePending, false);
        assert.equal(store.getItem(X.SCAN_PENDING_KEY), null);
    });

    test('a delete that STOPS (a hard removal refused) never erases the counts', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const log = [];
        const auth = { currentUser: userFor('uid-me', log) };
        const f = recFetch(okErase);
        // groups with a co-organizer pointer, and that pointer refused (a HARD removal)
        const db = dbFor(log, (p) => /^sharedGroups/.test(p));
        db.ref = ((orig) => (p) => Object.assign(orig(p), p === 'organizers/uid-me/groups'
            ? { once: () => Promise.resolve({ val: () => ({ g1: { coOrganizers: { 'a,b@c,com': true } } }) }) } : {}))(db.ref);
        await assert.rejects(X.deleteAccount({ auth, db, reload: () => {}, scanErase: X.scanEraser({ auth, fetch: f, base: '', storage: memStore() }) }),
            (e) => e.code === 'removal-failed');
        assert.equal(f.calls.length, 0, 'the account stays, so its counts stay');
        assert.ok(!log.includes('user.delete'));
    });

    test('NEGATIVE CONTROL: no scanErase dep (an older page) = no fetch, and the delete is as before', async () => {
        const sb = load();
        const X = sb.window.accountExit;
        const log = [];
        const out = await X.deleteAccount({ auth: { currentUser: userFor('uid-me', log) }, db: dbFor(log), reload: () => {} });
        assert.equal(out.deleted, true);
        assert.equal(out.scanErased, false);
        assert.equal(out.scanErasePending, false);
        assert.ok(!log.some((l) => /^fetch/.test(l)));
    });

    test('admin.html hands Delete account the eraser (delete2 only, never on Sign out)', () => {
        const html = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.match(html, /if \(step === 'delete2' && typeof fetch === 'function' && typeof window\.accountExit\.scanEraser === 'function'\) \{\s*deps\.scanErase = window\.accountExit\.scanEraser\(\{ auth: auth, fetch: \(u, o\) => fetch\(u, o\) \}\);/);
    });
});
