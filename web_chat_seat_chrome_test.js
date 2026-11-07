// ============================================================================
// THE WAY BACK: a golfer on a new phone takes their web chat seat back (chatSeatMove), IN REAL CHROME. Nothing live.
// tools/sim/lib/emu-phone.js: real pages and taps, the real database SDK, a local RTDB emulator running the live rules
// (readback.json). The function is stood in by the REAL core (firebase-functions/chat-core.js, branch chat-seat-move, worktree
// ~/golf-app-seat or SEAT_FN_DIR) over the REAL firebase-admin SDK on the same emulator, behind the callable's own URL shape;
// the core's clock is the test's, so "10 minutes later" needs no waiting. The pages are served the way the host serves them:
// / is the scorecard, /leaderboard the leaderboard, with no .html; the service worker is blocked here.
//   1 Manny's case: old tab gone, a new browser gets back in, the chat works both ways, everyone sees the line
//   2 active holder: refused with the minutes left, shown plainly, nothing changed
//   3 banned holder: refused, plainly     4 the cap: refused, plainly
//   5 the old phone, left open: back to the join card, not a broken screen; its write refused
//   6 the Players link on /leaderboard and on /leaderboard.html: confirm, move, join
//   7 no function reachable: a plain message, the seat untouched, the button still alive
//   8 the organizer's Free this seat
//   9 during the rollout: the holder is a v380 web phone (65bbf88d, no move code), a 2.0.2 app phone is in the chat
// BASELINE 65bbf88d: no move button, every test fails at its first tap. FINAL RUN: 9 pass / 0 fail.
// Controls, each by a scratch .wave copy and RESTORED-OK by sha, red: no confirm step, refusal not shown, nothing on a dead
//   function, Players link .html only, no button on the picker, Free deletes a banned member; on chat-core.js: no active check,
//   no holder ban check, no cap, old member kept, transaction trusts the first null, no auto line.
//   NOT red: dropping the local slot update after the move (the listener beat the answer every time): a belt, unproven.
// ============================================================================
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
let skew = 0, srv = null, admin = null, chat = null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve(req, res) {
    const u = new URL(req.url, HOST);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,authorization', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    if (u.pathname === '/fn/chatSeatMove') {
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
    chat = createChat({ now: () => Date.now() + skew, storage: {}, isAccount: async () => false, db: {
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
const ask = async (p, pid) => { assert.equal(await p.tap('[data-rc-move="' + pid + '"]'), 'This is me, move chat to this phone'); await sleep(300); };
const yes = async (p, pid) => { assert.equal(await p.tap('[data-rc-move-yes="' + pid + '"]'), 'Yes, move chat to this phone'); };

test('1 Manny\'s case: the old tab is gone, a new browser gets back in, the chat works both ways, everyone sees the line', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const C = 'TSM001'; await seed(C);
    const old = await web('m-old', C, 1, '101'), bob = await web('m-bob', C, 1, '102');
    await join(old, 101); await join(bob, 102);
    await say(old, 'Manny on the first browser');
    await done(old);
    const nw = await web('m-new', C, 1, '101');
    await openChat(nw);
    assert.match(await nw.text('#hp-chat'), /Manny is already in this chat on another phone/);
    skew = 11 * MIN;
    await ask(nw, 101);
    const t = await nw.text('#hp-chat');
    assert.match(t, /Move Manny’s chat to this phone\?/, t); assert.match(t, /The other phone loses the seat/);
    assert.equal(await emu.read('chatSlots/' + C + '/101'), 'anon-m-old', 'nothing moves before Yes');
    await yes(nw, 101);
    assert.ok(await nw.waitFor(IN_CHAT, 10000), 'joined through the ordinary join');
    assert.equal(await emu.read('chatSlots/' + C + '/101'), 'anon-m-new', 'the seat is this browser\'s');
    assert.equal(await emu.read('chatMembers/' + C + '/anon-m-old'), null, 'the old session is out');
    assert.ok(await bob.waitFor(has('/📱 Manny moved chat to another phone/', '#hp-chat .rc-body'), 8000), 'Bob sees the line, live');
    assert.ok(await nw.waitFor(has('/Manny on the first browser/', '#hp-chat .rc-body'), 5000), 'the history is there');
    await say(nw, 'Manny is back');
    assert.ok(await bob.waitFor(has('/Manny is back/', '#hp-chat .rc-body'), 8000), 'new browser -> Bob');
    await say(bob, 'Welcome back');
    assert.ok(await nw.waitFor(has('/Welcome back/', '#hp-chat .rc-body'), 8000), 'Bob -> new browser');
    const line = Object.values(await emu.read('chats/' + C + '/round')).find((m) => m.type === 'auto');
    assert.deepEqual(Object.keys(line).sort(), ['kind', 'pid', 'text', 'ts', 'type']);
    assert.deepEqual(appErrs(nw), []); assert.deepEqual(await nw.netEscapes(), []);
    await done(nw); await done(bob);
});

test('2 an active holder: refused with the minutes left, shown plainly, nothing changed, and it works once the time is up', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM002'; await seed(C);
    const old = await web('a-old', C, 2, '105'); await join(old, 105); await say(old, 'Still here');
    const nw = await web('a-new', C, 2, '105');
    await openChat(nw); await ask(nw, 105); skew = 4 * MIN; await yes(nw, 105);
    assert.ok(await nw.waitFor(has('/Try again in 6 minutes/'), 8000), await nw.text('#hp-chat'));
    assert.equal(await emu.read('chatSlots/' + C + '/105'), 'anon-a-old');
    assert.ok(await old.eval(IN_CHAT), 'the holder keeps chatting');
    skew = 11 * MIN;
    await ask(nw, 105); await yes(nw, 105);
    assert.ok(await nw.waitFor(IN_CHAT, 10000), 'the same button, later: in');
    await done(nw); await done(old);
});

test('3, 4 a banned holder and the cap: refused, plainly, the seat stays', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM003'; await seed(C);
    const holder = (uid, pid, name, i, g, extra) => Promise.all([emu.write('chatSlots/' + C + '/' + pid, uid), emu.write('chatMembers/' + C + '/' + uid, Object.assign({ group: g, joinedAt: 1, name, slot: pid, slotIndex: i }, extra || {}))]);
    await holder('h-ban', 105, 'Paul Park', 4, '2', { banned: true }); await holder('h-cap', 106, 'Marcus Lee', 5, '2');
    for (let i = 0; i < 3; i++) await emu.write('chats/' + C + '/round/-Zm' + i, { type: 'auto', kind: 'moved', pid: 106, text: 'Marcus moved chat to another phone', ts: 1 });
    const a = await web('b-new', C, 2, '105');
    await openChat(a); await ask(a, 105); await yes(a, 105);
    assert.ok(await a.waitFor(has('/removed this golfer from the chat/'), 8000), await a.text('#hp-chat'));
    assert.equal(await emu.read('chatSlots/' + C + '/105'), 'h-ban');
    await done(a);
    const b = await web('c-new', C, 2, '106');
    await openChat(b); await ask(b, 106); await yes(b, 106);
    assert.ok(await b.waitFor(has('/moved 3 times in this round/'), 8000), await b.text('#hp-chat'));
    assert.equal(await emu.read('chatSlots/' + C + '/106'), 'h-cap');
    await done(b);
});

test('5 the old phone, left open: falls back to the join card, can\'t post, no page error; once the new phone is in, it reads taken', Object.assign({ timeout: 100000 }, SKIP), async () => {
    const C = 'TSM005'; await seed(C);
    const old = await web('o-old', C, 1, '102'); await join(old, 102); await say(old, 'Before');
    const nw = await web('o-new', C, 1, '102');
    await openChat(nw); skew = 11 * MIN; await ask(nw, 102); await yes(nw, 102);
    assert.ok(await nw.waitFor(IN_CHAT, 10000));
    assert.ok(await old.waitFor('!' + IN_CHAT, 8000), 'the composer is gone');
    assert.ok(await old.waitFor(has('/Bob is already in this chat on another phone/'), 8000), await old.text('#hp-chat'));
    assert.match(await old.text('#hp-chat'), /Join the round chat/); assert.match(await old.text('#hp-chat'), /This is me, move chat to this phone/);
    assert.doesNotMatch(await old.text('#hp-chat'), /Before/, 'the messages are off the screen');
    const r = await old.eval("firebase.database().ref('chats/" + C + "/round').once('value').then(function () { return 'allowed'; }, function () { return 'refused'; })");
    assert.equal(r, 'refused', 'and the rules agree');
    await old.collect(); assert.deepEqual(appErrs(old), []);
    assert.ok(await old.tap('#hp-chat .rc-ibtn[data-rc=close]')); await sleep(300);
    assert.ok(await old.waitFor(BTN, 3000), 'the 💬 is still there');
    await done(old); await done(nw);
});

for (const [n, page] of [['6a', '/leaderboard'], ['6b', '/leaderboard.html']]) {
    test(n + ' the Players link on ' + page + ': the row on the picker, confirm, move, join, post', Object.assign({ timeout: 100000 }, SKIP), async () => {
        const C = 'TSM0' + n.toUpperCase(); await seed(C);
        const lb = (name) => phone(name, { url: HOST + page + '?game=' + C + '&players=1', auth: ANON('anon-' + name) });
        const old = await lb('p-old' + n); await openChat(old);
        assert.ok(await old.tap('[data-rc-pick="103"]')); await sleep(300);
        assert.ok(await old.tap('#hp-chat [data-rc-join="103"]')); assert.ok(await old.waitFor(IN_CHAT, 8000), 'joined on ' + page);
        await done(old);
        const nw = await lb('p-new' + n); await openChat(nw);
        assert.match(await nw.text('#hp-chat'), /Which golfer are you\?/);
        assert.equal(await nw.eval("document.querySelector('[data-rc-pick=\"103\"]').disabled"), true, 'greyed as before');
        assert.equal(await nw.eval("!!document.querySelector('[data-rc-move=\"104\"]')"), false, 'a free golfer has no move button');
        skew = 11 * MIN;
        await ask(nw, 103); await yes(nw, 103);
        assert.ok(await nw.waitFor(IN_CHAT, 10000), 'back in on ' + page);
        await say(nw, 'Josh back on ' + page);
        const msgs = Object.values(await emu.read('chats/' + C + '/round'));
        assert.ok(msgs.some((m) => m.text === 'Josh back on ' + page)); assert.ok(msgs.some((m) => m.text === 'Josh moved chat to another phone'));
        assert.equal(await emu.read('events/' + C + '/scores/p103_h4'), null, 'no score');
        assert.equal(await nw.eval("getComputedStyle(document.getElementById('app-nav-bar')).display"), 'none', 'still no route to the card');
        await done(nw);
    });
}

test('7 no function reachable: a plain message, the seat untouched, the button still alive', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const C = 'TSM007'; await seed(C);
    const old = await web('n-old', C, 1, '101'); await join(old, 101); await done(old);
    skew = 11 * MIN;
    const nw = await web('n-new', C, 1, '101', { fnBase: 'http://127.0.0.1:9' });   // nothing listens there
    await openChat(nw); await ask(nw, 101); await yes(nw, 101);
    assert.ok(await nw.waitFor(has('/Couldn’t reach HardPan to move the chat/'), 18000), await nw.text('#hp-chat'));
    assert.equal(await emu.read('chatSlots/' + C + '/101'), 'anon-n-old');
    await ask(nw, 101);
    assert.ok(await nw.eval("!!document.querySelector('[data-rc-move-yes]')"), 'the button still answers');
    await done(nw);
});

test('8 the organizer: Free this seat frees it, the golfer joins on a new phone with no wait; a removed golfer stays removed', Object.assign({ timeout: 100000 }, SKIP), async () => {
    const C = 'TSM008'; await seed(C);
    const old = await web('f-old', C, 2, '105'); await join(old, 105);
    await Promise.all([emu.write('chatSlots/' + C + '/106', 'f-ban'), emu.write('chatMembers/' + C + '/f-ban', { group: '2', joinedAt: 1, name: 'Marcus Lee', slot: 106, slotIndex: 5, banned: true })]);
    const o = await web('f-org', C, 1, '101', { auth: ACCT('u-org', 'Manny Orozco') });
    await openChat(o); assert.ok(await o.tap('#hp-chat [data-rc=join]')); assert.ok(await o.waitFor(IN_CHAT, 8000));
    assert.ok(await o.tap('#hp-chat [data-rc=settings]'));
    assert.ok(await o.waitFor("!!document.querySelector('[data-rc-free=\"105\"]')", 6000), 'the seats list');
    assert.equal(await o.tap('[data-rc-free="105"]'), 'Free this seat'); await sleep(900);
    assert.equal(await emu.read('chatSlots/' + C + '/105'), null); assert.equal(await emu.read('chatMembers/' + C + '/anon-f-old'), null);
    assert.ok(await o.tap('[data-rc-free="106"]')); await sleep(900);
    assert.equal(await emu.read('chatSlots/' + C + '/106'), null);
    assert.equal((await emu.read('chatMembers/' + C + '/f-ban')).banned, true, 'the ban stands');
    await done(o); await done(old);
    const nw = await web('f-new', C, 2, '105'); await join(nw, 105);
    await done(nw);
});

test('9 rollout: a v380 web holder falls back to its join card; a 2.0.2 app phone reads the line', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const C = 'TSM009'; await seed(C);
    const TREES = process.env.WEBCHAT_TREES || path.join(os.tmpdir(), 'hp-webchat-trees');
    const t380 = exportTree(__dirname, '65bbf88d', TREES), t202 = exportTree(__dirname, '1995536f', TREES);
    const old = await phone('r-old', { url: 'file://' + path.join(t380, 'index.html') + '?game=' + C + '&group=2', preScript: PRE(C, '105'), auth: ANON('anon-r-old') });
    assert.doesNotMatch(fs.readFileSync(path.join(t380, 'round-chat.js'), 'utf8'), /chatSeatMove/, 'really the old code');
    await join(old, 105);
    const app = await phone('r-app', { webgl: true, settleMs: 6000, url: 'file://' + path.join(t202, 'index.html') + '?game=' + C + '&group=1',
        preScript: 'window.__hardpanDoors = true;' + iapStub({ active: true }) + PRE(C, '101') + "try{localStorage.setItem('hardpan_round_side','bets|" + C + "');}catch(e){}", auth: ACCT('u-manny', 'Manny Orozco') });
    assert.ok(await app.tap('#hp-card-bet [data-hp-bar=menu]')); assert.ok(await app.tap('#hp-sheet [data-hs-tile=chat]')); await sleep(500);
    assert.equal(await app.tap('#hp-chat [data-rc=join]'), 'Join chat');
    const nw = await web('r-new', C, 2, '105');
    await openChat(nw); skew = 11 * MIN; await ask(nw, 105); await yes(nw, 105);
    assert.ok(await nw.waitFor(IN_CHAT, 10000));
    assert.ok(await old.waitFor('!' + IN_CHAT, 8000), 'v380: the composer is gone');
    assert.ok(await old.waitFor(has('/Paul is already in this chat on another phone/'), 8000), 'v380: the join card: ' + await old.text('#hp-chat'));
    old.errs.length = 0; await old.collect(); assert.deepEqual(appErrs(old), []);
    assert.ok(await app.waitFor(has('/Paul moved chat to another phone/', '#hp-chat .rc-body'), 8000), 'the 2.0.2 app shows the line');
    await done(old); await done(app); await done(nw);
});

test('10 Manny\'s preview case: 💬 tapped before the round arrives says Loading, then fills in by itself, with the Move button for a quiet device\'s seat', Object.assign({ timeout: 90000 }, SKIP), async () => {
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
    skew = 11 * MIN;
    await ask(nw, 101);
    assert.match(await nw.text('#hp-chat'), /Move Manny’s chat to this phone\?/);
    await yes(nw, 101);
    assert.ok(await nw.waitFor(IN_CHAT, 10000), 'moved and joined');
    assert.equal(await emu.read('chatSlots/' + C + '/101'), 'anon-l-new');
});

