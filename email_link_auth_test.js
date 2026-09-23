// ============================================================================
// EMAIL-LINK SIGN-IN THAT KEEPS THE ANONYMOUS UID (Consumer, Wave 1).
//
// The organizer's trial clock and founder pass live at organizers/<uid>, and
// every round they create stamps ownerUid with that uid. Anonymous auth is a
// different uid per browser origin. email-link-auth.js attaches an email to
// the anonymous user with linkWithCredential so the uid does not change, and
// uses signInWithEmailLink only when there is no anonymous user, the user is
// already linked, or the email is already on an account (the second device
// adopts the original uid).
//
// TWO HARNESSES, AND WHAT EACH CAN PROVE.
//   mini-dom (loadHtmlInlineScript) runs the page's own scripts. It does not
//   parse static markup into elements, so a getElementById of the lobby card
//   is an empty stub until script writes it. The arrival below waits for the
//   page to finish an email link on its own — the test never calls
//   completeLink — and reads the status the module wrote. It cannot see the
//   card's HTML.
//   Headless Chrome (tools/lib/cold-arrival.js) opens admin.html and touches
//   nothing the page defines. innerText on #email-link-card is the rendered
//   card, which mini-dom cannot see. A second arrival types an email and taps
//   Send. A third opens the continue-URL shape and reads the preserved-uid
//   sentence. Chrome is required for those three; the path is CHROME_PATH or
//   /usr/bin/google-chrome.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const decoded = (f) => decodeEscapes(read(f));
const LINK = '?apiKey=test-key&oobCode=oob-wave1&mode=signIn&lang=en';
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 40));
const MONEY = /buy|purchase|checkout|StoreKit|credit card|App Store/i;

function memoryStorage(seed) {
    const mem = new Map();
    if (seed) Object.keys(seed).forEach((k) => mem.set(k, String(seed[k])));
    return {
        mem,
        getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
        setItem: (k, v) => { mem.set(String(k), String(v)); },
        removeItem: (k) => { mem.delete(String(k)); }
    };
}

function authModule(seed) {
    const sb = loadJsFile('email-link-auth.js');
    sb.localStorage = memoryStorage(seed);
    sb.__calls = { link: 0, signIn: 0, send: 0 };
    sb.firebase.auth.EmailAuthProvider = {
        credentialWithLink(email, url) { return { email, url, providerId: 'password' }; }
    };
    const user = sb.firebase.auth().currentUser;
    user.linkWithCredential = (cred) => {
        sb.__calls.link++;
        sb.__calls.cred = cred;
        user.isAnonymous = false;
        user.email = cred && cred.email;
        return Promise.resolve({ user: { uid: user.uid, isAnonymous: false, email: user.email } });
    };
    sb.firebase.auth().signInWithEmailLink = (email, url) => {
        sb.__calls.signIn++;
        sb.__calls.signInArgs = { email, url };
        const next = { uid: 'adopted-uid', isAnonymous: false, email };
        sb.__auth.setUser(next);
        return Promise.resolve({ user: next });
    };
    sb.firebase.auth().sendSignInLinkToEmail = (email, settings) => {
        sb.__calls.send++;
        sb.__calls.sent = { email, settings };
        return Promise.resolve();
    };
    return sb;
}

describe('THE PLAN: link the anonymous user, sign in otherwise', () => {
    test('an anonymous user is linked; nobody, or an already-linked user, signs in', () => {
        const sb = authModule();
        const plan = sb.emailLinkAuth.planCompletion;
        const anon = plan({ uid: 'anon-1', isAnonymous: true }, null);
        assert.equal(anon.action, 'link');
        assert.equal(anon.reason, 'anonymous');
        const none = plan(null, null);
        assert.equal(none.action, 'sign-in');
        assert.equal(none.reason, 'no-user');
        const linked = plan({ uid: 'email-1', isAnonymous: false, email: 'a@b.co' }, null);
        assert.equal(linked.action, 'sign-in');
        assert.equal(linked.reason, 'already-linked');
        const other = plan({ uid: 'anon-other', isAnonymous: true }, { email: 'a@b.co', uid: 'anon-1' });
        assert.equal(other.action, 'sign-in');
        assert.equal(other.reason, 'different-anonymous-user');
        assert.equal(plan({ uid: 'anon-1', isAnonymous: true }, { email: 'a@b.co', uid: 'anon-1' }).action, 'link');
    });

    test('the migration sentences name the trial and the founder pass, and sell nothing', () => {
        const sb = authModule();
        const note = sb.emailLinkAuth.migrationNote;
        const same = note({ uid: 'anon-1', isAnonymous: true }, { uid: 'anon-1', isAnonymous: false });
        const adopted = note({ uid: 'anon-2', isAnonymous: true }, { uid: 'anon-1', isAnonymous: false });
        const fresh = note(null, { uid: 'anon-1', isAnonymous: false });
        [same, adopted, fresh, sb.emailLinkAuth.NOTE_SENT].forEach((line) => {
            assert.match(line, /free trial/);
            assert.match(line, /founder pass/);
            assert.doesNotMatch(line, MONEY);
        });
        assert.doesNotMatch(sb.emailLinkAuth.NOTE_CONSOLE, MONEY);
        assert.match(sb.emailLinkAuth.NOTE_CONSOLE, /Firebase console/);
        assert.match(same, /same organizer account/);
        assert.match(same, /Rounds you already set up stay yours/);
        assert.match(adopted, /not copied/);
        assert.match(adopted, /not moved/);
        assert.equal(sb.emailLinkAuth.sameOrganizer('anon-1', 'anon-1'), true);
        assert.equal(sb.emailLinkAuth.sameOrganizer('anon-1', 'anon-2'), false);
    });
});

describe('THE LINK: same uid in, same uid out', () => {
    test('linkWithCredential keeps the uid and does not call signInWithEmailLink', async () => {
        const sb = authModule({ golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-stub' });
        const href = 'https://golf-app-5a5.pages.dev/admin.html' + LINK;
        const result = await sb.emailLinkAuth.completeLink(href);
        assert.equal(result.status, 'signed-in');
        assert.equal(result.how, 'link');
        assert.equal(result.preserved, true);
        assert.equal(result.after.uid, 'anon-stub');
        assert.equal(result.before.uid, 'anon-stub');
        assert.equal(sb.__calls.link, 1);
        assert.equal(sb.__calls.signIn, 0);
        assert.equal(sb.__calls.cred.email, 'marty@example.com');
        assert.equal(sb.localStorage.getItem('golfapp_email_for_sign_in'), null);
        assert.equal(sb.__dbWrites.length, 0, 'linking writes nothing to the database');
        assert.equal(result.note, sb.emailLinkAuth.NOTE_PRESERVED);
    });

    test('a link that comes back as a different uid is a failure, not a preserved organizer', async () => {
        const sb = authModule({ golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-stub' });
        sb.firebase.auth().currentUser.linkWithCredential = () => {
            sb.__calls.link++;
            return Promise.resolve({ user: { uid: 'brand-new', isAnonymous: false, email: 'marty@example.com' } });
        };
        await assert.rejects(
            () => sb.emailLinkAuth.completeLink('https://golf-app-5a5.pages.dev/admin.html' + LINK),
            (err) => err.code === 'link-uid-changed'
        );
        assert.equal(sb.__calls.signIn, 0, 'it must not fall through into a new sign-in');
        assert.equal(sb.emailLinkAuth.messageFor({ code: 'link-uid-changed' }), sb.emailLinkAuth.NOTE_UID_CHANGED);
    });

    test('email already on an account: sign in as that account, and say the trial was not copied', async () => {
        const sb = authModule({ golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-stub' });
        sb.firebase.auth().currentUser.linkWithCredential = () => {
            sb.__calls.link++;
            const err = new Error('already');
            err.code = 'auth/email-already-in-use';
            return Promise.reject(err);
        };
        const result = await sb.emailLinkAuth.completeLink('https://golf-app-5a5.pages.dev/admin.html' + LINK);
        assert.equal(sb.__calls.link, 1);
        assert.equal(sb.__calls.signIn, 1);
        assert.equal(result.how, 'sign-in');
        assert.equal(result.preserved, false);
        assert.equal(result.after.uid, 'adopted-uid');
        assert.equal(result.note, sb.emailLinkAuth.NOTE_ADOPTED);
    });

    test('no anonymous user signs in and does not try to link', async () => {
        const sb = authModule({ golfapp_email_for_sign_in: 'marty@example.com' });
        sb.__auth.setUser(null);
        const result = await sb.emailLinkAuth.completeLink('https://golf-app-5a5.pages.dev/admin.html' + LINK);
        assert.equal(sb.__calls.link, 0);
        assert.equal(sb.__calls.signIn, 1);
        assert.equal(result.how, 'sign-in');
        assert.equal(result.note, sb.emailLinkAuth.NOTE_FRESH);
    });

    test('an already-linked user signs in; a different anonymous uid is not linked', async () => {
        const sb = authModule({ golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-original' });
        sb.__auth.setUser({ uid: 'email-keep', isAnonymous: false, email: 'marty@example.com' });
        await sb.emailLinkAuth.completeLink('https://golf-app-5a5.pages.dev/admin.html' + LINK);
        assert.equal(sb.__calls.link, 0);
        assert.equal(sb.__calls.signIn, 1);

        const other = authModule({ golfapp_email_for_sign_in: 'marty@example.com', golfapp_email_link_uid: 'anon-original' });
        assert.equal(other.firebase.auth().currentUser.uid, 'anon-stub');
        await other.emailLinkAuth.completeLink('https://golf-app-5a5.pages.dev/admin.html' + LINK);
        assert.equal(other.__calls.link, 0, 'pending uid is a different anonymous user');
        assert.equal(other.__calls.signIn, 1);
    });
});

describe('SENDING THE LINK', () => {
    test('stores the email and the uid, and the continue URL is admin.html on this origin', async () => {
        const sb = authModule();
        const sent = await sb.emailLinkAuth.sendLink('  Marty@Example.com ');
        assert.equal(sent.email, 'marty@example.com');
        assert.equal(sent.uid, 'anon-stub');
        assert.equal(sb.__calls.send, 1);
        assert.equal(sb.__calls.sent.settings.url, 'https://golf-app-5a5.pages.dev/admin.html');
        assert.equal(sb.__calls.sent.settings.handleCodeInApp, true);
        assert.equal(sb.__calls.sent.settings.iOS.bundleId, 'com.rattlegolf.app');
        assert.equal(sb.__calls.sent.settings.android.packageName, 'com.rattlegolf.app');
        assert.equal(sb.__calls.sent.settings.android.installApp, false);
        assert.equal(sb.localStorage.getItem('golfapp_email_for_sign_in'), 'marty@example.com');
        assert.equal(sb.localStorage.getItem('golfapp_email_link_uid'), 'anon-stub');
        assert.match(sent.note, /another browser/);
    });

    test('the shell continues at the web origin; a preview stays on the preview; localhost stays local', () => {
        const sb = loadJsFile('email-link-auth.js', ['product-links.js']);
        sb.Capacitor = { isNativePlatform() { return true; } };
        sb.location = { origin: 'capacitor://localhost', href: 'capacitor://localhost/admin.html', pathname: '/admin.html', search: '' };
        assert.equal(sb.emailLinkAuth.continueUrl(), 'https://golf-app-5a5.pages.dev/admin.html');
        sb.Capacitor = { isNativePlatform() { return false; } };
        sb.location = { origin: 'https://preview-7.pages.dev', href: 'https://preview-7.pages.dev/admin.html', pathname: '/admin.html', search: '' };
        assert.equal(sb.emailLinkAuth.continueUrl(), 'https://preview-7.pages.dev/admin.html');
        sb.location = { origin: 'http://localhost:8080', href: 'http://localhost:8080/admin.html', pathname: '/admin.html', search: '' };
        assert.equal(sb.emailLinkAuth.continueUrl(), 'http://localhost:8080/admin.html');
    });

    test('a provider the console has not enabled is said as such, and the address is not kept', async () => {
        const sb = authModule();
        sb.firebase.auth().sendSignInLinkToEmail = () => Promise.reject(Object.assign(new Error('off'), { code: 'auth/operation-not-allowed' }));
        await assert.rejects(() => sb.emailLinkAuth.sendLink('marty@example.com'), (err) => err.code === 'auth/operation-not-allowed');
        assert.equal(sb.localStorage.getItem('golfapp_email_for_sign_in'), null);
        assert.match(sb.emailLinkAuth.messageFor({ code: 'auth/operation-not-allowed' }), /Firebase console/);
        assert.match(sb.emailLinkAuth.messageFor({ code: 'auth/unauthorized-domain' }), /Firebase console/);
        await assert.rejects(() => sb.emailLinkAuth.sendLink('not-an-email'), (err) => err.code === 'auth/invalid-email');
    });
});

describe('THE ROUND KEEPS THE LIVE UID', () => {
    test('ensureOrganizer stamps whoever is signed in now, and still stamps the boot uid when nobody has replaced them', async () => {
        const sb = loadJsFile('organizer-gate.js');
        sb.authReady = Promise.resolve('anon-old');
        sb.__auth.setUser({ uid: 'linked-keep', isAnonymous: false, email: 'marty@example.com' });
        const uid = await sb.organizerGate.ensureOrganizer(sb.db);
        assert.equal(uid, 'linked-keep');
        assert.ok(sb.__dbWrites.some((w) => w.op === 'set' && w.path === 'organizers/linked-keep/firstSeenAt'));
        assert.ok(!sb.__dbWrites.some((w) => /anon-old/.test(w.path)));

        const same = loadJsFile('organizer-gate.js');
        same.authReady = Promise.resolve('anon-stub');
        const uid2 = await same.organizerGate.ensureOrganizer(same.db);
        assert.equal(uid2, 'anon-stub');
        assert.ok(same.__dbWrites.some((w) => w.path === 'organizers/anon-stub/firstSeenAt'));
    });

    test('Save on the wizard stamps the live uid, not the uid authReady already resolved', async () => {
        const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=GATE01' });
        vm.runInContext(`
            window.crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } };
        `, sb);
        await tick(80);
        assert.equal(sb.authBootState.uid, 'anon-stub', 'boot resolved before the session moved');
        sb.__auth.setUser({ uid: 'linked-keep', isAnonymous: false, email: 'marty@example.com' });
        vm.runInContext(`
            var key = Object.keys(coursePresets)[0];
            courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
            saveSettings();
        `, sb);
        for (let i = 0; i < 20; i++) await tick(30);
        const round = sb.__dbWrites.find((w) => w.path === 'events/GATE01' && w.op === 'update');
        assert.ok(round, 'the round was written: ' + sb.__dbWrites.map((w) => w.op + ' ' + w.path).join(' | '));
        assert.equal(round.value.ownerUid, 'linked-keep');
        assert.ok(sb.__dbWrites.some((w) => w.path === 'organizers/linked-keep/firstSeenAt'));
        assert.ok(!sb.__dbWrites.some((w) => w.path === 'organizers/anon-stub/firstSeenAt'));
    });
});

describe('THE PAGE FINISHES A LINK WITHOUT BEING ASKED', () => {
    test('opening the email-link URL on Home links the anonymous user and says the trial stayed', async () => {
        const calls = { link: 0, signIn: 0 };
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: LINK,
            localStorage: true,
            seedStorage: {
                golfapp_email_for_sign_in: 'marty@example.com',
                golfapp_email_link_uid: 'anon-stub'
            },
            beforeRun(s) {
                s.firebase.auth.EmailAuthProvider = {
                    credentialWithLink(email, url) { return { email, url, providerId: 'password' }; }
                };
                const user = s.firebase.auth().currentUser;
                user.linkWithCredential = (cred) => {
                    calls.link++;
                    user.isAnonymous = false;
                    user.email = cred.email;
                    return Promise.resolve({ user: { uid: user.uid, isAnonymous: false, email: cred.email } });
                };
                s.firebase.auth().signInWithEmailLink = () => {
                    calls.signIn++;
                    return Promise.reject(Object.assign(new Error('no'), { code: 'should-not-sign-in' }));
                };
            }
        });
        const settled = await Promise.race([
            sb.authReady.then((uid) => ({ uid })),
            tick(1500).then(() => ({ uid: null }))
        ]);
        await tick(50);
        assert.equal(settled.uid, 'anon-stub');
        assert.equal(calls.link, 1);
        assert.equal(calls.signIn, 0);
        assert.equal(sb.authBootState.uid, 'anon-stub');
        assert.equal(sb.document.getElementById('email-link-status').textContent, sb.emailLinkAuth.NOTE_PRESERVED);
        assert.equal(sb.localStorage.getItem('golfapp_email_for_sign_in'), null);
    });

    test('a normal round URL loads the module and does not send or finish anything', async () => {
        const calls = { n: 0 };
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: '?game=WAVE1',
            beforeRun(s) {
                const bump = () => { calls.n++; return Promise.resolve({ user: s.firebase.auth().currentUser }); };
                s.firebase.auth().sendSignInLinkToEmail = bump;
                s.firebase.auth().signInWithEmailLink = bump;
                s.firebase.auth().currentUser.linkWithCredential = bump;
            }
        });
        await tick(80);
        assert.equal(sb.authBootState.uid, 'anon-stub');
        assert.equal(typeof sb.emailLinkAuth.completeLink, 'function');
        assert.equal(calls.n, 0);
        assert.equal(sb.emailLinkAuth.lastResult || null, null);
    });
});

describe('WHERE IT LIVES, AND WHAT IT DOES NOT CHANGE', () => {
    test('the lobby card is in the markup a Home arrival shows, and it sells nothing', () => {
        const html = decoded('admin.html');
        const lobby = html.slice(html.indexOf('id="lobby-screen"'), html.indexOf('id="admin-screen"'));
        assert.ok(lobby.length > 500, 'the lobby slice collapsed');
        assert.match(lobby, /id="email-link-card"/);
        assert.match(lobby, /id="email-link-send"/);
        assert.match(lobby, /id="email-link-finish"/);
        assert.match(lobby, /This browser's organizer account exists only here/);
        assert.match(lobby, /free trial and a founder pass stay with the rounds already set up on it/);
        assert.doesNotMatch(lobby, MONEY);
        assert.match(html, /<script src="email-link-auth\.js"><\/script>/);
        assert.ok(!/email-link-auth/.test(read('tournament.html')), 'tournament.html keeps its own sign-in');
    });

    test('the file is Consumer, precached, and the rules are not owner-only', () => {
        const sync = read('sync-mobile-web.js');
        const consumer = /const CONSUMER_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        const tournament = /const TOURNAMENT_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        assert.match(consumer, /'email-link-auth\.js'/);
        assert.ok(!/'email-link-auth\.js'/.test(shared));
        assert.ok(!/'email-link-auth\.js'/.test(tournament));
        assert.match(read('sw.js'), /'\.\/email-link-auth\.js'/);
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v204-hardpan-email-link';/);

        const src = read('email-link-auth.js');
        assert.match(src, /linkWithCredential/);
        assert.match(src, /signInWithEmailLink/);
        assert.match(src, /sendSignInLinkToEmail/);
        assert.ok(!/firebase\.database\(/.test(src), 'this file must not write the database');
        assert.ok(!/\.ref\(/.test(src));

        const rules = JSON.parse(read('database.rules.json'));
        const write = rules.rules.events.$eventCode['.write'];
        assert.match(write, /data\.exists\(\) && \(newData\.exists\(\) \|\| !data\.hasChild\('scores'\)\)/);
        assert.ok(!/data\.exists\(\) && auth != null && auth\.uid === data\.child\('ownerUid'\)/.test(write),
            'existing rounds are not owner-only in this wave');
        assert.equal(rules.rules.organizers.$uid.pass['.write'], false);
    });
});

const DB = { events: {}, organizers: {}, global_courses: {}, trips: {}, tournaments: {} };
const SEND_STUB = `
window.__sent = null;
(function () {
  var orig = window.firebase.auth;
  window.firebase.auth = function () {
    var a = orig();
    a.sendSignInLinkToEmail = function (email, settings) {
      window.__sent = { email: email, url: settings && settings.url, handle: !!(settings && settings.handleCodeInApp), bundle: settings && settings.iOS && settings.iOS.bundleId };
      return Promise.resolve();
    };
    return a;
  };
})();
`;
const LINK_STUB = `
window.__emailLinkProbe = { linked: 0, signedIn: 0, uid: null };
(function () {
  var orig = window.firebase.auth;
  function wrapped() {
    var a = orig();
    a.isSignInWithEmailLink = function (url) {
      var s = String(url || '');
      return /[?&]oobCode=/.test(s) && /[?&]mode=signIn/.test(s);
    };
    a.signInWithEmailLink = function () {
      window.__emailLinkProbe.signedIn++;
      return Promise.reject(new Error('sign-in should not run'));
    };
    var u = a.currentUser;
    if (u && typeof u.linkWithCredential !== 'function') {
      u.linkWithCredential = function (cred) {
        window.__emailLinkProbe.linked++;
        window.__emailLinkProbe.uid = u.uid;
        u.isAnonymous = false;
        u.email = cred && cred.email;
        return Promise.resolve({ user: { uid: u.uid, isAnonymous: false, email: u.email } });
      };
    }
    return a;
  }
  wrapped.EmailAuthProvider = { credentialWithLink: function (email, url) { return { email: email, url: url }; } };
  window.firebase.auth = wrapped;
  try {
    localStorage.setItem('golfapp_email_for_sign_in', 'marty@example.com');
    localStorage.setItem('golfapp_email_link_uid', 'anon-cold');
  } catch (e) {}
})();
`;

describe('COLD CHROME: Home shows the card, the button sends, the link preserves the uid', () => {
    test('opening Home shows the card, and tapping Send emails a link for this account', { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html'),
            db: DB,
            settleMs: 2500,
            viewport: { width: 390, height: 844 },
            preScript: SEND_STUB,
            steps: [
                { expression: `(function () { var c = document.getElementById('email-link-card'); var s = c ? getComputedStyle(c) : null; return JSON.stringify({ text: c ? c.innerText : '', shown: !!(c && s && s.display !== 'none') }); })()` },
                { tap: '#email-link-input' },
                { sleep: 150 },
                { cdp: { method: 'Input.insertText', params: { text: 'a@b.co' } } },
                { sleep: 150 },
                { tap: '#email-link-send' },
                { sleep: 600 },
                { expression: `(function () { return JSON.stringify({ sent: window.__sent, status: (document.getElementById('email-link-status') || {}).innerText || '', stored: localStorage.getItem('golfapp_email_for_sign_in'), value: (document.getElementById('email-link-input') || {}).value || '' }); })()` }
            ]
        });
        assert.equal(r.ok, true, r.reason);
        const objs = (r.value || []).filter((x) => typeof x === 'string' && x.charAt(0) === '{').map((x) => JSON.parse(x));
        assert.equal(objs.length, 2, JSON.stringify(r.value));
        assert.equal(objs[0].shown, true);
        assert.match(objs[0].text, /Keep this organizer/);
        assert.match(objs[0].text, /free trial and a founder pass/);
        assert.doesNotMatch(objs[0].text, MONEY);
        assert.equal(objs[1].value, 'a@b.co', 'the address was typed into the box');
        assert.ok(objs[1].sent, 'Send did not call sendSignInLinkToEmail: ' + JSON.stringify(objs[1]));
        assert.equal(objs[1].sent.email, 'a@b.co');
        assert.equal(objs[1].sent.url, 'https://golf-app-5a5.pages.dev/admin.html');
        assert.equal(objs[1].sent.handle, true);
        assert.equal(objs[1].sent.bundle, 'com.rattlegolf.app');
        assert.equal(objs[1].stored, 'a@b.co');
        assert.match(objs[1].status, /Link sent/);
        assert.match(objs[1].status, /free trial/);
    });

    test('opening the email link on Home links this anonymous user and does not sign in a new one', { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', 'apiKey=test-key&oobCode=oob-cold&mode=signIn&lang=en'),
            db: DB,
            settleMs: 4000,
            viewport: { width: 390, height: 844 },
            preScript: LINK_STUB,
            expression: `(function () {
                var status = document.getElementById('email-link-status');
                return JSON.stringify({
                    status: status ? status.innerText : '',
                    probe: window.__emailLinkProbe || null,
                    uid: (window.authBootState && window.authBootState.uid) || null,
                    writes: (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path; })
                });
            })()`
        });
        assert.equal(r.ok, true, r.reason);
        const got = JSON.parse(r.value);
        assert.equal(got.probe && got.probe.linked, 1, JSON.stringify(got));
        assert.equal(got.probe.signedIn, 0);
        assert.equal(got.probe.uid, 'anon-cold');
        assert.equal(got.uid, 'anon-cold');
        assert.match(got.status, /same organizer account/);
        assert.match(got.status, /free trial/);
        assert.match(got.status, /founder pass/);
        assert.ok(!got.writes.some((w) => /organizers\/|events\//.test(w)), 'finishing the link wrote ' + got.writes.join(' | '));
    });
});
