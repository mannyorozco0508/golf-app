// ============================================================================
// WEB CHAT SEATS, ORGANIZER ONLY, IN REAL CHROME. Nothing live. (Manny held the self-serve move on Nov 7: anyone with the link
// could take a quiet guest's seat and read their group chat. Only the round's organizer frees a seat.)
// tools/sim/lib/emu-phone.js: real pages and taps, the real database SDK, a local RTDB emulator running the live rules
// (readback.json). The organizer function chatSeatMove is the REAL core (firebase-functions/chat-core.js, branch chat-seat-move,
// ~/golf-app-seat or SEAT_FN_DIR) over the REAL firebase-admin on the same emulator, called from node. The pages are served the
// way the host serves them: / is the scorecard, /leaderboard the leaderboard, with no .html; the service worker is blocked.
//   1 scorer link, a taken golfer: no move button, "If that isn't you, ask the organizer.", nothing written, no function call
//   2 group-link picker: the same        3a/3b the Players link on /leaderboard and /leaderboard.html: the same
//   4 not the organizer: no gear, no Seats list, and the rules refuse the same deletes made by hand
//   5 the organizer frees a seat: the golfer joins on a new phone; the old phone falls back to its join card; a ban stands
//   6 rollout: a v380 web holder (65bbf88d) freed by the organizer falls back to its join card
//   7 chatSeatMove: a non-organizer is refused with nothing written; the organizer frees it and every phone sees the line
//   10 💬 before the round arrives: Loading, then the names (a taken golfer greyed, no move)     11 a round ended on the server: the sheet says so
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Emulator, EmuPhone, exportTree, sleep } = require('./tools/sim/lib/emu-phone.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const RULES = process.env.WEBCHAT_RULES || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'deploys-20261106', 'rules-chatblocks', 'readback.json');
const FN_DIR = process.env.SEAT_FN_DIR || path.join(os.homedir(), 'golf-app-seat', 'firebase-functions');
const SKIP = !Emulator.available() ? { skip: 'no RTDB emulator' } : !fs.existsSync(RULES) ? { skip: 'no live rules read-back' } : !fs.existsSync(path.join(FN_DIR, 'node_modules', 'firebase-admin')) ? { skip: 'no functions tree' } : {};
const PORT = 9134, WEBPORT = 9135, NS = 'hpseat', MIN = 60000;
const emu = new Emulator(PORT, NS);
const HOST = 'http://127.0.0.1:' + WEBPORT;
const NAMES = ['Manny Orozco', 'Bob Baker', 'Josh Hart', 'Todd Reyes', 'Paul Park', 'Marcus Lee', 'Ann Alpha', 'Ben Bravo'];
const open = new Set();
let skew = 0, srv = null, admin = null, chat = null, fnHits = 0;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve(req, res) {
    const u = new URL(req.url, HOST);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,authorization', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    if (u.pathname === '/fn/chatSeatMove') {
        if (req.method === 'POST') fnHits++;
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
        let b = ''; req.on('data', (d) => { b += d; }); req.on('end', async () => {
            const m = /^Bearer emu:([^:]+):(.+)$/.exec(req.headers.authorization || '');
            const send = (code, o) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
            try { send(200, { result: await chat.seatMove(m ? { uid: m[1], token: { firebase: { sign_in_provider: m[2] } } } : null, JSON.parse(b).data) }); }
            catch (e) { send(400, { error: { status: String(e.code), message: e.message } }); }
        });
        return;
    }
    let p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (!path.extname(p)) p += '.html';                       // the host's pretty URLs
    const f = path.join(__dirname, path.normalize(p));
    if (!f.startsWith(__dirname) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}
before(async () => {
    if (SKIP.skip) return;
    await emu.start(RULES);
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:' + PORT;
    admin = require(path.join(FN_DIR, 'node_modules', 'firebase-admin'));
    admin.initializeApp({ databaseURL: 'http://127.0.0.1:' + PORT + '?ns=' + NS, projectId: NS });
    const rtdb = () => admin.database();
    const { createChat } = require(path.join(FN_DIR, 'chat-core.js'));
    chat = createChat({ now: () => Date.now() + skew, storage: {}, isAccount: async () => false, adminUids: async () => [], db: {
        get: async (p) => (await rtdb().ref(p).once('value')).val(), set: (p, v) => rtdb().ref(p).set(v),
        update: (p, v) => (p ? rtdb().ref(p) : rtdb().ref()).update(v), push: (p, v) => rtdb().ref(p).push(v), transaction: (p, fn) => rtdb().ref(p).transaction(fn) } });
    srv = http.createServer(serve); await new Promise((r) => srv.listen(WEBPORT, '127.0.0.1', r));
}, { timeout: 60000 });
after(async () => { for (const p of Array.from(open)) await done(p); if (srv) srv.close(); if (admin) await admin.app().delete(); emu.stop(); });

async function seed(code) {
    const r = wizardSavedRound({ code, golfers: 8, ownerUid: 'u-org', thru: 3, flights: false, names: NAMES,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Dobson Ranch', eventName: 'Test Monday', groupSizeOverrides: { 0: 4, 1: 4 }, additionalGames: {} } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    await emu.write('events/' + code, r); skew = 0;
}
const ANON = (uid) => ({ uid, isAnonymous: true, email: null });
const ACCT = (uid, name) => ({ uid, isAnonymous: false, email: uid + '@test.hardpan.dev', displayName: name, providerData: [{ providerId: 'apple.com' }] });
const PRE = (code, me) => "try{" + (me ? "localStorage.setItem('golfapp_me_" + code + "','" + me + "');" : '') + "sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";
async function phone(name, o) {
    const p = await EmuPhone.launch(Object.assign({ name, emu, fnBase: HOST + '/fn', viewport: { width: 402, height: 874 }, settleMs: 3000 }, o));
    const raw = p.tap.bind(p);
    p.tap = async (t, x) => { const l = await raw(t, x); return l && /\[COVERED\]$/.test(l) ? null : l; };
    open.add(p); return p;
}
const done = async (p) => { open.delete(p); try { await p.close(); } catch (e) {} };
const web = (name, code, g, me, o) => phone(name, Object.assign({ url: HOST + '/?game=' + code + '&group=' + g, preScript: PRE(code, me), auth: ANON('anon-' + name) }, o || {}));
const BTN = "(function(){ var b = document.getElementById('hp-chat-wbtn'); if (!b || getComputedStyle(b).display === 'none') return false; var r = b.getBoundingClientRect(); return r.width > 0; })()";
const IN_CHAT = "!!document.getElementById('rc-input')";
const appErrs = (p) => p.errs.filter((e) => !/ERR_BLOCKED|Failed to load resource|net::|sdk-absent|service worker|ServiceWorker/i.test(e));
const has = (re, sel) => '(' + re + ').test((document.querySelector(' + JSON.stringify(sel || '#hp-chat') + ') || {}).innerText || "")';
async function openChat(p) { assert.ok(await p.waitFor(BTN, 15000), p.name + ': the 💬'); assert.ok(await p.tap('#hp-chat-wbtn')); await sleep(500); }
async function join(p, pid) { await openChat(p); assert.ok(await p.tap('#hp-chat [data-rc-join="' + pid + '"]'), 'Join'); assert.ok(await p.waitFor(IN_CHAT, 8000), p.name + ': in the chat'); }
async function say(p, t) { assert.ok(await p.type('#rc-input', t, { enter: true })); await sleep(700); }

const NO_MOVE = "!document.querySelector('[data-rc-move],[data-rc-move-yes]') && !/move chat to this phone/i.test(document.body.innerText)";
async function held(C, pid, uid, name, i, g) { await emu.write('chatSlots/' + C + '/' + pid, uid); await emu.write('chatMembers/' + C + '/' + uid, { group: g, joinedAt: 1, name, slot: pid, slotIndex: i }); }
const callFn = (auth, data) => fetch(HOST + '/fn/chatSeatMove', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer emu:' + auth }, body: JSON.stringify({ data }) }).then((r) => r.json());

test('1 scorer link, a taken golfer: no move button, ask the organizer, nothing written, no function call', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM001'; await seed(C); await held(C, 101, 'h-1', 'Manny Orozco', 0, '1');
    const before = JSON.stringify(await emu.read('chatSlots/' + C)) + JSON.stringify(await emu.read('chatMembers/' + C)), hits = fnHits;
    const nw = await web('t-new', C, 1, '101'); skew = 60 * MIN;
    await openChat(nw);
    const t = await nw.text('#hp-chat');
    assert.match(t, /Manny is already in this chat on another phone\. Only one phone can chat as each golfer\. If that isn’t you, ask the organizer\./, t);
    assert.ok(await nw.eval(NO_MOVE), 'no move button');
    await sleep(1500);
    assert.equal(JSON.stringify(await emu.read('chatSlots/' + C)) + JSON.stringify(await emu.read('chatMembers/' + C)), before, 'nothing written');
    assert.equal(fnHits, hits, 'no call to the function');
    assert.deepEqual(appErrs(nw), []);
    await done(nw);
});

test('2 the group-link picker with a taken golfer: greyed, no move button', Object.assign({ timeout: 60000 }, SKIP), async () => {
    const C = 'TSM002'; await seed(C); await held(C, 105, 'h-2', 'Paul Park', 4, '2');
    const nw = await web('g-new', C, 2); await openChat(nw);
    assert.match(await nw.text('#hp-chat'), /Who are you\?/);
    assert.equal(await nw.eval("document.querySelector('[data-rc-join=\"105\"]').disabled"), true, 'Paul greyed (positive)');
    assert.ok(await nw.eval(NO_MOVE), 'no move button');
    await done(nw);
});

for (const [n, page] of [['3a', '/leaderboard'], ['3b', '/leaderboard.html']]) {
    test(n + ' the Players link on ' + page + ': taken greyed, no move button, picking a free golfer still joins', Object.assign({ timeout: 90000 }, SKIP), async () => {
        const C = 'TSM0' + n.toUpperCase(); await seed(C); await held(C, 103, 'h-3', 'Josh Hart', 2, '1');
        const p = await phone('pl-' + n, { url: HOST + page + '?game=' + C + '&players=1', auth: ANON('anon-pl-' + n) });
        await openChat(p);
        assert.match(await p.text('#hp-chat'), /Which golfer are you\?/);
        assert.equal(await p.eval("document.querySelector('[data-rc-pick=\"103\"]').disabled"), true, 'Josh greyed');
        assert.ok(await p.eval(NO_MOVE), 'no move button on ' + page);
        assert.ok(await p.tap('[data-rc-pick="104"]')); await sleep(300);
        assert.ok(await p.tap('#hp-chat [data-rc-join="104"]')); assert.ok(await p.waitFor(IN_CHAT, 8000), 'joins on ' + page);
        assert.equal(await p.eval("getComputedStyle(document.getElementById('app-nav-bar')).display"), 'none', 'still no route to the card');
        await done(p);
    });
}

test('4 not the organizer (a golfer, a signed-in account): no gear, no Seats list; the rules refuse the deletes by hand', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM004'; await seed(C); await held(C, 105, 'h-4', 'Paul Park', 4, '2');
    const g = await web('n-golf', C, 1, '102'); await join(g, 102);
    const a = await web('n-acct', C, 1, '103', { auth: ACCT('u-josh', 'Josh Hart') }); await openChat(a);
    assert.ok(await a.tap('#hp-chat [data-rc=join]')); assert.ok(await a.waitFor(IN_CHAT, 8000), 'the account is in the chat (positive)');
    for (const p of [g, a]) {
        assert.equal(await p.eval("!!document.querySelector('#hp-chat [data-rc=settings]')"), false, p.name + ': no gear');
        assert.equal(await p.eval("!!document.querySelector('[data-rc-free]') || /Free this seat/.test(document.body.innerText)"), false, p.name + ': no Seats list');
        for (const path of ['chatSlots/' + C + '/105', 'chatMembers/' + C + '/h-4']) {
            const r = await p.eval("firebase.database().ref('" + path + "').remove().then(function () { return 'allowed'; }, function () { return 'refused'; })");
            assert.equal(r, 'refused', p.name + ' deleting ' + path);
        }
    }
    assert.equal(await emu.read('chatSlots/' + C + '/105'), 'h-4'); assert.ok(await emu.read('chatMembers/' + C + '/h-4'));
    await done(g); await done(a);
});

test('5 the organizer frees a seat: the golfer joins on a new phone; the old phone falls back to its join card; a ban stands', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const C = 'TSM005'; await seed(C);
    const old = await web('f-old', C, 2, '105'); await join(old, 105); await say(old, 'Before');
    await emu.write('chatSlots/' + C + '/106', 'f-ban'); await emu.write('chatMembers/' + C + '/f-ban', { group: '2', joinedAt: 1, name: 'Marcus Lee', slot: 106, slotIndex: 5, banned: true });
    const o = await web('f-org', C, 1, '101', { auth: ACCT('u-org', 'Manny Orozco') });
    await openChat(o); assert.ok(await o.tap('#hp-chat [data-rc=join]')); assert.ok(await o.waitFor(IN_CHAT, 8000));
    assert.ok(await o.tap('#hp-chat [data-rc=settings]'));
    assert.ok(await o.waitFor("!!document.querySelector('[data-rc-free=\"105\"]')", 6000), 'the organizer\'s Seats list');
    assert.equal(await o.tap('[data-rc-free="105"]'), 'Free this seat'); await sleep(900);
    assert.equal(await emu.read('chatSlots/' + C + '/105'), null); assert.equal(await emu.read('chatMembers/' + C + '/anon-f-old'), null);
    assert.ok(await old.waitFor('!' + IN_CHAT, 8000), 'the old phone: the composer is gone');
    assert.ok(await old.waitFor(has('/Join chat as Paul · Group 2/'), 8000), 'the old phone: its join card, not a broken screen: ' + await old.text('#hp-chat'));
    assert.doesNotMatch(await old.text('#hp-chat'), /Before/);
    assert.ok(await o.tap('[data-rc-free="106"]')); await sleep(900);
    assert.equal(await emu.read('chatSlots/' + C + '/106'), null); assert.equal((await emu.read('chatMembers/' + C + '/f-ban')).banned, true, 'the ban stands');
    await done(old);
    const nw = await web('f-new', C, 2, '105'); await join(nw, 105);
    await say(nw, 'Paul on the new phone');
    assert.ok(Object.values(await emu.read('chats/' + C + '/round')).some((m) => m.text === 'Paul on the new phone'));
    await old.collect(); await done(o); await done(nw);
});

test('6 rollout: a v380 web holder (65bbf88d) freed by the organizer falls back to its join card', Object.assign({ timeout: 100000 }, SKIP), async () => {
    const C = 'TSM006'; await seed(C);
    const TREES = process.env.WEBCHAT_TREES || path.join(os.tmpdir(), 'hp-webchat-trees');
    const t380 = exportTree(__dirname, '65bbf88d', TREES);
    const old = await phone('r-old', { url: 'file://' + path.join(t380, 'index.html') + '?game=' + C + '&group=2', preScript: PRE(C, '105'), auth: ANON('anon-r-old') });
    await join(old, 105);
    const o = await web('r-org', C, 1, '101', { auth: ACCT('u-org', 'Manny Orozco') });
    await openChat(o); assert.ok(await o.tap('#hp-chat [data-rc=join]')); assert.ok(await o.waitFor(IN_CHAT, 8000));
    assert.ok(await o.tap('#hp-chat [data-rc=settings]')); assert.ok(await o.waitFor("!!document.querySelector('[data-rc-free=\"105\"]')", 6000));
    assert.ok(await o.tap('[data-rc-free="105"]')); await sleep(900);
    assert.ok(await old.waitFor('!' + IN_CHAT, 8000), 'v380: the composer is gone');
    assert.ok(await old.waitFor(has('/Join chat as Paul · Group 2/'), 8000), 'v380: the join card: ' + await old.text('#hp-chat'));
    old.errs.length = 0; await old.collect(); assert.deepEqual(appErrs(old), []);
    await done(old); await done(o);
});

test('7 chatSeatMove on the emulator: a non-organizer refused with nothing written; the organizer frees it, every phone sees the line', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM007'; await seed(C);
    const old = await web('s-old', C, 1, '101'); await join(old, 101);
    const bob = await web('s-bob', C, 1, '102'); await join(bob, 102);
    const before = JSON.stringify(await emu.read('chatSlots/' + C)) + JSON.stringify(await emu.read('chatMembers/' + C));
    for (const who of ['anon-s-bob:anonymous', 'anon-x:anonymous', 'u-josh:apple.com']) {
        const r = await callFn(who, { code: C, pid: 101 });
        assert.equal(r.result && r.result.reason, 'not-organizer', who + ': ' + JSON.stringify(r));
    }
    assert.equal(JSON.stringify(await emu.read('chatSlots/' + C)) + JSON.stringify(await emu.read('chatMembers/' + C)), before, 'nothing written');
    assert.deepEqual((await callFn('u-org:apple.com', { code: C, pid: 101 })).result, { ok: true });
    assert.equal(await emu.read('chatSlots/' + C + '/101'), null); assert.equal(await emu.read('chatMembers/' + C + '/anon-s-old'), null);
    assert.equal(await emu.read('chatMembers/' + C + '/u-org'), null, 'the organizer is not handed the seat');
    assert.ok(await bob.waitFor(has('/📱 The organizer freed Manny’s chat seat for another phone/', '#hp-chat .rc-body'), 8000), 'everyone sees it');
    assert.ok(await old.waitFor(has('/Join chat as Manny · Group 1/'), 8000), 'the old phone: its join card');
    await done(old); await done(bob);
});

test('10 Manny\'s preview case: 💬 tapped before the round arrives says Loading, then fills in by itself, and a taken golfer reads ask the organizer', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM010'; await seed(C);
    const old = await web('l-old', C, 1, '101'); await join(old, 101); await done(old);
    const nw = await web('l-new', C, 1);
    await nw.eval("window.__keep = currentData; currentData = {}; 1");
    await openChat(nw);
    const early = await nw.text('#hp-chat');
    assert.match(early, /Loading the round/, early);
    assert.doesNotMatch(early, /0 golfers/, early);
    await nw.eval("currentData = window.__keep; 1");
    assert.ok(await nw.waitFor(has('/Manny/', '#hp-chat'), 6000), 'the names arrive with the sheet still open');
    assert.equal(await nw.eval("document.querySelector('[data-rc-join=\"101\"]').disabled"), true, 'Manny greyed in the picker');
    assert.match(await nw.text('#hp-chat'), /Already in the chat on another phone/);
    assert.ok(await nw.eval(NO_MOVE), 'no move button');
    await done(nw);
});

test('11 a round ended on the server, its card still on this phone: the sheet says so, never Loading forever', Object.assign({ timeout: 60000 }, SKIP), async () => {
    const C = 'TSM011'; await seed(C);
    const p = await web('g-1', C, 1, '101');
    await emu.write('events/' + C, null);
    await p.eval("currentData = {}; 1");
    await openChat(p);
    assert.ok(await p.waitFor(has('/This round isn’t there any more/'), 8000), await p.text('#hp-chat'));
});

