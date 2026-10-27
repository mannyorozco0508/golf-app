// ============================================================================
// DELETE ACCOUNT, FINISHED BY THE SERVER (store-legal, 2026-10-17)
//
// App Review 5.1.1(v): deleting an account must revoke Sign in with Apple and
// leave nothing behind. account-exit.js now (1) asks the native Apple sheet for a
// fresh authorization code BEFORE touching anything, (2) removes what the rules
// let it, including pushTokens/<uid> and pushPrefs/<uid>, then (3) hands the code
// to the accountDelete Cloud Function, which revokes it and removes the whole
// organizers record and the Auth user with the Admin SDK.
//
// While the function is NOT deployed (404, or no answer) the old client delete
// runs, so every account type can still delete itself from this build.
//
// Every test here goes through the Account panel the way a golfer does - the two
// Delete taps, then the go button - with fetch and the Apple sheet stubbed. The
// default-state test is the first one: a page that does nothing special must
// reach the server.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');

const FN_URL = 'https://us-central1-golfapp-9fb21.cloudfunctions.net/accountDelete';
const tick = () => new Promise(r => setTimeout(r, 20));

function page(o) {
    const opts = o || {};
    const sb = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
    sb.__dbReads = { 'organizers/u9/groups': { g1: { name: 'Thursday game', coOrganizers: { 'a,b@c,com': true } } } };
    const events = [];
    sb.location.reload = () => events.push('reload');
    sb.uiConfirm = () => Promise.resolve(true);
    sb.uiPrompt = () => Promise.resolve('DELETE');
    sb.uiToast = () => {};
    sb.uiRefuse = () => {};
    const user = {
        uid: 'u9', isAnonymous: false, email: 'a@b.com',
        providerData: [{ providerId: opts.provider || 'apple.com' }],
        getIdToken: () => Promise.resolve('id-token-u9'),
        delete: () => { events.push('user.delete@' + sb.__dbWrites.length); return Promise.resolve(); }
    };
    sb.firebase.auth().signOut = () => { events.push('signOut'); return Promise.resolve(); };
    sb.__auth.setUser(user);
    sb.window.oauthSignin = {
        signIn: () => Promise.resolve({ uid: 'u9' }),
        appleAuthorizationCode: () => {
            events.push('apple-sheet@' + sb.__dbWrites.length);
            if (opts.appleCancel) return Promise.reject(Object.assign(new Error('The user canceled the sign-in flow.'), { code: '1001' }));
            return Promise.resolve({ code: 'apple-code-1', bundleId: 'com.rattlegolf.gpsbeta' });
        }
    };
    sb.oauthSignin = sb.window.oauthSignin;
    const posts = [];
    const scanPosts = [];   // 088: Delete account also calls /api/scan-erase - kept apart from the accountDelete posts and events
    if (opts.fetch !== false) {
        sb.fetch = (url, init) => {
            if (/\/api\/scan-erase$/.test(String(url))) {
                scanPosts.push({ url, init, at: sb.__dbWrites.length, before: events.slice() });
                if (opts.network) return Promise.reject(new TypeError('Load failed'));
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ status: 'erased', erased: 1 }) });
            }
            posts.push({ url, init, at: sb.__dbWrites.length });
            events.push('server@' + sb.__dbWrites.length);
            if (opts.network) return Promise.reject(new TypeError('Load failed'));
            if (opts.status === 404) return Promise.resolve({ status: 404, ok: false, json: () => Promise.reject(new Error('html')) });
            const body = opts.answer || { result: { status: 'deleted', appleRevoked: true, removed: ['organizers/u9'] } };
            return Promise.resolve({ status: body.error ? 400 : 200, ok: !body.error, json: () => Promise.resolve(body) });
        };
    }
    const go = async () => { sb.exitTap('delete'); sb.exitTap('delete'); await sb.exitGo(); await tick(); };
    const text = id => sb.document.getElementById(id).textContent;
    return { sb, events, posts, scanPosts, go, text, writes: () => sb.__dbWrites.map(w => w.op + ' ' + w.path) };
}

describe('THE SERVER FINISHES A DELETE', () => {

    test('088: the scan counts are erased after the client removals and before accountDelete, with the same token', async () => {
        const p = page({ provider: 'google.com' });
        p.sb.refreshAccountState();
        await p.go();
        assert.equal(p.scanPosts.length, 1);
        assert.match(p.scanPosts[0].url, /\/api\/scan-erase$/);
        assert.equal(p.scanPosts[0].init.headers.Authorization, 'Bearer id-token-u9');
        assert.equal(p.scanPosts[0].at, 4, 'after the four client removals');
        assert.deepEqual(p.scanPosts[0].before, [], 'before accountDelete is asked');
        assert.deepEqual(p.events, ['server@4', 'signOut', 'reload'], 'and the delete itself is unchanged');
    });

    test('088: no signal for the scan server and accountDelete still runs (offline: the client delete, as before)', async () => {
        const p = page({ network: true });
        p.sb.refreshAccountState();
        await p.go();
        assert.equal(p.scanPosts.length, 1);
        assert.deepEqual(p.events, ['apple-sheet@0', 'server@4', 'user.delete@4', 'reload']);
    });

    test('DEFAULT PATH, an Apple account: the Apple sheet FIRST, then the client removals, then accountDelete, and the client never deletes the user itself', async () => {
        const p = page();
        p.sb.refreshAccountState();
        await p.go();
        assert.deepEqual(p.writes(), [
            'remove sharedGroups/a,b@c,com/u9/g1',
            'remove pushTokens/u9',
            'remove pushPrefs/u9',
            'remove organizers/u9'
        ]);
        assert.deepEqual(p.events, ['apple-sheet@0', 'server@4', 'signOut', 'reload'],
            'the Apple code is asked for before any write; the server is asked after them; the Auth user is the server\'s job');
        assert.equal(p.posts.length, 1);
        assert.equal(p.posts[0].url, FN_URL);
        assert.equal(p.posts[0].init.method, 'POST');
        assert.equal(p.posts[0].init.headers.Authorization, 'Bearer id-token-u9');
        assert.deepEqual(JSON.parse(p.posts[0].init.body), { data: { appleAuthorizationCode: 'apple-code-1', appleClientId: 'com.rattlegolf.gpsbeta' } });
    });

    test('CANCELLING THE APPLE SHEET deletes nothing at all', async () => {
        const p = page({ appleCancel: true });
        p.sb.refreshAccountState();
        await p.go();
        assert.deepEqual(p.writes(), [], 'not one write');
        assert.deepEqual(p.events, ['apple-sheet@0']);
        assert.match(p.text('account-exit-status'), /cancelled, so nothing was deleted/);
    });

    test('APPLE REFUSED THE REVOKE: the account is NOT deleted, and the screen says so', async () => {
        const p = page({ answer: { error: { status: 'FAILED_PRECONDITION', message: 'Apple did not confirm', details: { reason: 'apple-revoke-failed' } } } });
        p.sb.refreshAccountState();
        await p.go();
        assert.ok(!p.events.some(e => /user\.delete|reload/.test(e)), 'no client delete behind the server\'s back: ' + p.events.join(','));
        assert.match(p.text('account-exit-status'), /account was NOT deleted/);
    });

    test('A GOOGLE account: no Apple sheet, the server gets an empty request', async () => {
        const p = page({ provider: 'google.com' });
        p.sb.refreshAccountState();
        await p.go();
        assert.ok(!p.events.some(e => /apple-sheet/.test(e)));
        assert.deepEqual(JSON.parse(p.posts[0].init.body), { data: {} });
        assert.deepEqual(p.events.slice(-2), ['signOut', 'reload']);
    });

    test('AN EMAIL-LINK account deletes through the server too - no recent sign-in needed', async () => {
        const p = page({ provider: 'password' });
        p.sb.refreshAccountState();
        await p.go();
        assert.deepEqual(p.events, ['server@4', 'signOut', 'reload']);
    });

    test('NOT DEPLOYED YET (404, or no answer): the client deletes the user itself, as before', async () => {
        for (const o of [{ status: 404 }, { network: true }]) {
            const p = page(o);
            p.sb.refreshAccountState();
            await p.go();
            assert.deepEqual(p.events, ['apple-sheet@0', 'server@4', 'user.delete@4', 'reload'], JSON.stringify(o) + ': ' + p.events.join(','));
        }
    });

    test('A PAGE WITH NO fetch never asks for the Apple sheet and deletes the old way', async () => {
        const p = page({ fetch: false });
        p.sb.refreshAccountState();
        await p.go();
        assert.deepEqual(p.events, ['user.delete@4', 'reload']);
    });

    test('a server error that is not a refusal still deletes NOTHING on the client', async () => {
        const p = page({ answer: { error: { status: 'INTERNAL', message: 'x' } } });
        p.sb.refreshAccountState();
        await p.go();
        assert.ok(!p.events.some(e => /user\.delete|reload/.test(e)));
        assert.match(p.text('account-exit-status'), /NOT deleted/);
    });
});

describe('THE NATIVE APPLE CODE', () => {
    test('oauthSignin.appleAuthorizationCode asks the plugin with skipNativeAuth and returns the code and the bundle id', async () => {
        const asked = [];
        const sb = loadJsFile('oauth-signin.js');
        sb.window.Capacitor = { Plugins: {
            FirebaseAuthentication: { signInWithApple: (o) => { asked.push(o); return Promise.resolve({ credential: { idToken: 'id', authorizationCode: 'c-77' } }); } },
            App: { getInfo: () => Promise.resolve({ id: 'com.rattlegolf.app' }) }
        } };
        const r = await sb.window.oauthSignin.appleAuthorizationCode();
        assert.deepEqual(JSON.parse(JSON.stringify(r)), { code: 'c-77', bundleId: 'com.rattlegolf.app' });
        assert.deepEqual(JSON.parse(JSON.stringify(asked)), [{ skipNativeAuth: true }], 'never signs in natively');
        const web = loadJsFile('oauth-signin.js');
        assert.equal(await web.window.oauthSignin.appleAuthorizationCode(), null, 'the web has no Apple sheet: null, not an error');
    });
});
