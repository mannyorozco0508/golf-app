// ============================================================================
// WEB CHAT ON THE LIVE RULES, IN REAL CHROME (ADVISOR-1727; real game Mon Nov 9). Nothing live.
// tools/sim/lib/emu-phone.js: real Chrome, real pages, real taps, the REAL database SDK over a socket to a local RTDB
// emulator running the live rules as read back on Nov 6 (outbox/deploys-20261106/rules-chatblocks/readback.json). What a
// page writes is accepted or refused by those rules, and a second phone receives it live: no relay, no stand-in database.
// Only the auth SDK is stood in (a mock token: uid + sign_in_provider). Every off-machine URL is blocked and counted.
//
// Round TWCA01: 8 golfers, Group 1 = 101-104, Group 2 = 105-108, ownerUid u-org.
//   1  scorer link, no account: 💬 in the bar over nothing; Join as the golfer from the link; a message; 3 s hold
//   2  a second phone in the round sees it live, replies; a closed sheet badges; group thread stays with the group
//   3  Players link: the picker, a taken golfer greyed, Just watching = nothing written, nothing readable
//   4  Players link golfer joins + posts; NO route to score entry anywhere on the page; events/ untouched
//   5  plain Spectator link: unchanged, nav bar kept, no 💬
//   6  one phone per golfer: second phone refused on screen AND by the rules; a reload keeps your own golfer
//   7  text only: no photo control for a no-account or a signed-in web golfer; an app photo reads sensibly
//   8  Hide: on the phone with no account; on the account (chatBlocks, the live rule) for a signed-in web golfer
//   9  the 💬 rule on the web: no-account golfer always; the organizer's own web phone waits for someone else
//   9b the organizer on the web: chat off / back on, Remove from chat
// Round TWCM01, mixed versions (read-only exports of the commits, the same emulator):
//   10 a v379 web phone (origin/main, no chat), a 2.0.2 app phone, a new web phone: all score, chat flows, the board reads all
//   11 + a 2.0.1 app phone (chat off): scores, no chat surface, nothing written to chat; web <-> 2.0.2 chat unaffected
// BASELINE: origin/main 0d91206d has no round-chat.js: nothing here can pass there.
// FINAL RUN: 12 pass / 0 fail. Controls on round-chat.js, each by a scratch .wave copy and RESTORED-OK by sha: ref('') (1 red),
//   appOn without WEB (1), Sign in gate on web (1), nav bar kept on the Players link (4), slots ignored (3), photo frame (7),
//   photo buttons for signed-in web (7), signedIn not web-aware (8), no listen again after chat back on (9b), no someoneElse (9).
//   Rules control: WEBCHAT_RULES = the old 2.1a copy: tests 1 and 10 red.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Emulator, EmuPhone, exportTree, sleep } = require('./tools/sim/lib/emu-phone.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const RULES = process.env.WEBCHAT_RULES || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'deploys-20261106', 'rules-chatblocks', 'readback.json');
const TREES = process.env.WEBCHAT_TREES || path.join(os.tmpdir(), 'hp-webchat-trees');
const SKIP = !Emulator.available() ? { skip: 'no RTDB emulator' } : !fs.existsSync(RULES) ? { skip: 'no live rules read-back' } : {};
const A = 'TWCA01', M = 'TWCM01', S1 = 'TWCS01', S2 = 'TWCS02';
const NAMES = ['Manny Orozco', 'Bob Baker', 'Josh Hart', 'Todd Reyes', 'Paul Park', 'Marcus Lee', 'Ann Alpha', 'Ben Bravo'];
const emu = new Emulator(9133, 'hpwebchat');
const open = new Set();
const round = (code, n, sizes, owner) => {
    const r = wizardSavedRound({ code, golfers: n, ownerUid: owner || 'u-org', thru: 3, flights: false, names: NAMES.slice(0, n),
        overrides: { activeCourseKey: 'caledonia', courseName: 'Dobson Ranch', eventName: 'Test Monday', groupSizeOverrides: sizes, additionalGames: {} } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; return r;
};
const ANON = (uid) => ({ uid, isAnonymous: true, email: null });
const ACCT = (uid, name) => ({ uid, isAnonymous: false, email: uid + '@test.hardpan.dev', displayName: name, providerData: [{ providerId: 'apple.com' }] });
const WEB_PRE = (code, me) => "try{" + (me ? "localStorage.setItem('golfapp_me_" + code + "','" + me + "');" : '') + "sessionStorage.setItem('groupPickDismissed:" + code + "','1');}catch(e){}";
const APP_PRE = (code, me) => 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + code + "','" + me + "');sessionStorage.setItem('groupPickDismissed:" + code + "','1');localStorage.setItem('hardpan_round_side','bets|" + code + "');}catch(e){}";
const url = (root, page, q) => 'file://' + path.join(root, page) + '?' + q;
async function phone(name, o) {
    const p = await EmuPhone.launch(Object.assign({ name, emu, viewport: { width: 402, height: 874 }, settleMs: 4000 }, o));
    const raw = p.tap.bind(p);
    p.tap = async (t, x) => { const l = await raw(t, x); return l && /\[COVERED\]$/.test(l) ? null : l; };   // a tap a finger could not make = failed
    open.add(p); return p;
}
const done = async (p) => { open.delete(p); try { await p.close(); } catch (e) {} };
const web = (name, code, group, me, auth) => phone(name, { url: url(__dirname, 'index.html', 'game=' + code + '&group=' + group), preScript: WEB_PRE(code, me), auth: auth || ANON('anon-' + name) });
const shown = (id) => "(function(){ var b = document.getElementById('" + id + "'); if (!b || getComputedStyle(b).display === 'none') return false; var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()";
const BTN = shown('hp-chat-wbtn');
// (the app's map asks for picture tiles: stopped like the rest, and no database; only those are let through this check)
const noEscapes = async (p) => assert.deepEqual((await p.netEscapes()).filter((u) => !/arcgis\.com\/|nationalmap\.gov\//.test(u)), [], p.name + ': nothing left this machine');
const appErrs = (p) => p.errs.filter((e) => !/ERR_BLOCKED|Failed to load resource|net::|sdk-absent/.test(e));
const refused = (p, js) => p.eval("Promise.resolve().then(function () { return " + js + "; }).then(function () { return 'allowed'; }, function () { return 'refused'; })");
const msgOf = (o, t) => Object.keys(o || {}).find((k) => o[k] && o[k].text === t);
const roundMsgs = (c) => emu.read('chats/' + c + '/round');
async function join(p, pid, label) {
    assert.ok(await p.waitFor(BTN, 12000), p.name + ': the 💬');
    assert.ok(await p.tap('#hp-chat-wbtn'), 'tap 💬'); await sleep(500);
    assert.equal(await p.tap('#hp-chat [data-rc-join="' + pid + '"]'), label);
    assert.ok(await p.waitFor("!!document.getElementById('rc-input')", 8000), p.name + ': in the chat');
}
async function say(p, text) { assert.ok(await p.type('#rc-input', text, { enter: true }), 'typed'); await sleep(700); }
async function typeScore(p, pid, h, v) {
    const sel = '.score-input[data-player-id="' + pid + '"][data-hole="' + h + '"]';
    assert.ok(await p.waitFor("!!document.querySelector('" + sel.replace(/'/g, "\\'") + "')", 15000), p.name + ': a score box for ' + pid);
    assert.ok(await p.type(sel, String(v)), p.name + ': typed');
    await p.eval("(function(){ var i = document.querySelector('" + sel.replace(/'/g, "\\'") + "'); if (i && document.activeElement === i) i.blur(); return 1; })()");
    await sleep(900);
}

before(async () => {
    if (SKIP.skip) return;
    await emu.start(RULES);
    await emu.write('events/' + A, round(A, 8, { 0: 4, 1: 4 }));
    await emu.write('events/' + M, round(M, 8, { 0: 4, 1: 4 }));
    await emu.write('events/' + S1, round(S1, 2, { 0: 2 }));
    await emu.write('events/' + S2, round(S2, 2, { 0: 2 }, 'anon-org'));
}, { timeout: 60000 });
after(async () => { for (const p of Array.from(open)) await done(p); emu.stop(); });

const P = {};
test('1 scorer link, no account: 💬 over nothing; Join as the link\'s golfer; posts under the live rules; 3 s hold', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const w = P.paul = await web('paul', A, 2, '105');
    assert.ok(await w.waitFor(BTN, 12000), 'the 💬 on the web scorecard');
    const g = await w.json("(function(){ var b = document.getElementById('hp-chat-wbtn'), r = b.getBoundingClientRect(), sh = document.getElementById('round-sheet').getBoundingClientRect(), pill = document.getElementById('round-sheet-pill').getBoundingClientRect();"
        + "var hit = function (a, c) { return a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom; };"
        + "var over = Array.prototype.filter.call(document.querySelectorAll('input,button,select,a,[onclick],.score-input-wrapper'), function (e) { if (e === b || b.contains(e) || e.id === 'round-sheet-handle' || e.id === 'round-sheet-scrim' || e.closest('#round-sheet-body') || e.closest('#hp-chat')) return false; var c = e.getBoundingClientRect(); return c.width > 0 && hit(c, r); }).map(function (e) { return e.id || e.className || e.tagName; });"
        + "return { inBar: r.top >= sh.top && r.right <= innerWidth, pillClear: !hit(r, pill), over: over, boxes: document.querySelectorAll('.score-input').length, w: r.width, h: r.height }; })()");
    assert.ok(g.boxes >= 4, 'the score boxes are there (positive): ' + JSON.stringify(g));
    assert.ok(g.inBar && g.pillClear, JSON.stringify(g));
    assert.deepEqual(g.over, [], 'over no control or score box');
    assert.ok(g.w >= 44 && g.h >= 44);
    assert.ok(await w.tap('#hp-chat-wbtn'), 'tap 💬'); await sleep(500);
    const card = await w.text('#hp-chat');
    assert.match(card, /Join chat as Paul · Group 2/, card);
    assert.doesNotMatch(card, /Sign in/, 'no sign-in on a group link');
    assert.equal(await emu.read('chatMembers/' + A), null, 'zero chat writes before Join');
    assert.equal(await w.tap('#hp-chat [data-rc-join="105"]'), 'Join chat as Paul · Group 2');
    assert.ok(await w.waitFor("!!document.getElementById('rc-input')", 8000), 'the rules took the join');
    assert.equal(await emu.read('chatSlots/' + A + '/105'), 'anon-paul', 'the claim');
    const m = await emu.read('chatMembers/' + A + '/anon-paul');
    assert.equal(m.name, 'Paul Park'); assert.equal(m.slot, 105); assert.equal(m.group, '2'); assert.equal(typeof m.joinedAt, 'number');
    await say(w, 'Paul from the web, on 5');
    const msgs = await roundMsgs(A), id = msgOf(msgs, 'Paul from the web, on 5');
    assert.ok(id, 'accepted by the live rules: ' + JSON.stringify(msgs));
    assert.equal(msgs[id].uid, 'anon-paul'); assert.equal(msgs[id].name, 'Paul Park'); assert.equal(typeof msgs[id].ts, 'number');
    assert.ok(await w.tap({ sel: '#hp-chat .rc-chip', text: /Nice shot/ }), 'a chip, right away'); await sleep(500);
    assert.equal(Object.keys(await roundMsgs(A)).length, 1, 'inside 3 s: held on the phone');
    assert.match(await w.text('.ui-toast'), /One message every 3 seconds/);
    await sleep(3200);
    assert.ok(await w.tap({ sel: '#hp-chat .rc-chip', text: /Nice shot/ }), 'after 3 s'); await sleep(900);
    assert.equal(Object.keys(await roundMsgs(A)).length, 2, 'the chip posts after the gap');
    await noEscapes(w);
    assert.deepEqual(appErrs(w), [], 'no page errors');
});

test('2 a second phone sees it live, replies; a closed sheet badges; the group thread stays with the group', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const paul = P.paul, bob = P.bob = await web('bob', A, 1, '102');
    await join(bob, 102, 'Join chat as Bob · Group 1');
    assert.ok(await bob.waitFor("/Paul from the web, on 5/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), 'Bob sees Paul\'s message');
    assert.match(await bob.text('#hp-chat .rc-body'), /Paul Park · G2/);
    await say(bob, 'Bob here, copy that');
    assert.ok(await paul.waitFor("/Bob here, copy that/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), 'it reaches Paul live, no reload');
    assert.ok(await paul.tap('#hp-chat .rc-ibtn[data-rc=close]'), 'close'); await sleep(300);
    await sleep(3000);
    await say(bob, 'Second one');
    assert.ok(await paul.waitFor("(document.querySelector('#hp-chat-wbtn .hp-cb-badge')||{}).innerText === '1'", 8000), 'the red badge');
    assert.ok(await paul.tap('#hp-chat-wbtn')); await sleep(500);
    assert.equal(await paul.eval("!!document.querySelector('#hp-chat-wbtn .hp-cb-badge') && getComputedStyle(document.getElementById('hp-chat-wbtn')).display !== 'none'"), false, 'opened: cleared');
    assert.ok(await paul.tap({ sel: '#hp-chat .rc-tab', text: /Group 2/ })); await sleep(300);
    await sleep(2500);
    await say(paul, 'Group 2 only');
    assert.ok(await emu.read('chats/' + A + '/groups/2'), 'on the group thread');
    assert.ok(await bob.tap({ sel: '#hp-chat .rc-tab', text: /Group 1/ })); await sleep(500);
    assert.doesNotMatch(await bob.text('#hp-chat .rc-body'), /Group 2 only/, 'Group 1 does not see it');
    assert.equal(await refused(bob, "firebase.database().ref('chats/" + A + "/groups/2').once('value')"), 'refused', 'and the rules refuse the read');
    assert.deepEqual(appErrs(bob), []);
});

test('3 Players link: the picker, a taken golfer greyed, Just watching writes nothing and reads nothing', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const before = JSON.stringify(await emu.read('chatMembers/' + A));
    const w = await phone('watcher', { url: url(__dirname, 'leaderboard.html', 'game=' + A + '&players=1'), auth: ANON('anon-watch') });
    assert.ok(await w.waitFor(BTN, 12000), 'the 💬');
    assert.ok(await w.waitFor(shown('hp-chat-whint'), 6000), 'the one-time hint');
    assert.ok(await w.tap('#hp-chat-wbtn')); await sleep(600);
    const t = await w.text('#hp-chat');
    assert.match(t, /Which golfer are you\?/, t);
    assert.match(t, /GROUP 1 Manny Orozco.*GROUP 2 Paul Park/, 'every golfer by group');
    assert.equal(await w.eval("!!document.querySelector('#hp-chat .rc-tab')"), false, 'no tabs before a name');
    assert.equal(await w.eval("document.querySelector('[data-rc-pick=\"105\"]').disabled"), true, 'Paul greyed');
    assert.match(await w.text('[data-rc-pick="105"]'), /Already in the chat on another phone/);
    assert.equal(await w.eval("document.querySelector('[data-rc-pick=\"103\"]').disabled"), false, 'Josh free');
    assert.equal(await w.tap('[data-rc=watch]').then((l) => /Just watching/.test(l)), true);
    await sleep(500);
    assert.equal(await w.eval("document.getElementById('hp-chat').classList.contains('open')"), false, 'closed');
    assert.equal(JSON.stringify(await emu.read('chatMembers/' + A)), before, 'Just watching wrote nothing');
    assert.equal(await refused(w, "firebase.database().ref('chats/" + A + "/round').once('value')"), 'refused', 'and reads no chat');
    await done(w);
});

test('4 Players link golfer joins + posts; NO route to score entry on the page; events/ untouched', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const ev0 = JSON.stringify(await emu.read('events/' + A));
    const j = P.josh = await phone('josh', { url: url(__dirname, 'leaderboard.html', 'game=' + A + '&players=1'), auth: ANON('anon-josh') });
    assert.ok(await j.waitFor(BTN, 12000));
    assert.ok(await j.tap('#hp-chat-wbtn')); await sleep(500);
    assert.ok(await j.tap('[data-rc-pick="103"]')); await sleep(300);
    assert.equal(await j.tap('#hp-chat [data-rc-join="103"]'), 'Join chat as Josh · Group 1');
    assert.ok(await j.waitFor("!!document.getElementById('rc-input')", 8000), 'joined');
    await say(j, 'Josh on the Players link');
    assert.ok(msgOf(await roundMsgs(A), 'Josh on the Players link'), 'posted');
    assert.ok(await j.tap('#hp-chat .rc-ibtn[data-rc=close]')); await sleep(300);
    // the whole page, as a golfer has it, after joining: nothing to score with and nothing that leads there
    const ui = await j.json("(function(){ var vis = function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };"
        + "var outside = function (e) { return !e.closest('#hp-chat'); };"
        + "var links = Array.prototype.filter.call(document.querySelectorAll('a[href]'), function (a) { return vis(a) && outside(a); }).map(function (a) { return a.getAttribute('href'); });"
        + "var inputs = Array.prototype.filter.call(document.querySelectorAll('input,select,textarea'), function (e) { return vis(e) && outside(e); }).map(function (e) { return e.id || e.className; });"
        + "var go = Array.prototype.filter.call(document.querySelectorAll('[onclick]'), function (e) { return vis(e) && outside(e) && /location|index\\.html|admin\\.html|score/i.test(e.getAttribute('onclick')); }).map(function (e) { return e.getAttribute('onclick').slice(0, 60); });"
        + "return { boxes: document.querySelectorAll('.score-input').length, links: links, inputs: inputs, go: go, nav: vis(document.getElementById('app-nav-bar')), rows: document.body.innerText.indexOf('Josh') >= 0 }; })()");
    assert.equal(ui.rows, true, 'the board is on the page (positive): ' + JSON.stringify(ui));
    assert.equal(ui.boxes, 0, 'no score box');
    assert.equal(ui.nav, false, 'no nav bar (its Scorecard pill is a score box away)');
    assert.deepEqual(ui.links.filter((h) => /index\.html|admin\.html|skins|settlement|sidematches|game\.html|trip|home/i.test(h)), [], 'no link to a page with a nav: ' + JSON.stringify(ui.links));
    assert.deepEqual(ui.inputs, ['scoring-toggle-input', 'group-view-toggle-input'], 'no input outside the chat but the board\'s two view switches (the same on the Spectator link)');
    assert.deepEqual(ui.go, [], 'no tap that navigates to scoring');
    assert.equal(await j.eval("/Join chat|Enter score|Save score/.test(document.body.innerText.replace(document.getElementById('hp-chat').innerText, ''))"), false);
    assert.equal(JSON.stringify(await emu.read('events/' + A)), ev0, 'events/ byte-for-byte: no score, no setup');
    await noEscapes(j);
    assert.deepEqual(appErrs(j), []);
});

test('5 the plain Spectator link: unchanged - nav bar kept, no 💬, no hint, no chat state', Object.assign({ timeout: 60000 }, SKIP), async () => {
    const s = await phone('spec', { url: url(__dirname, 'leaderboard.html', 'game=' + A), auth: ANON('anon-spec') });
    await sleep(1500);
    assert.equal(await s.eval(BTN), false, 'no 💬');
    assert.equal(await s.eval(shown('hp-chat-whint')), false);
    assert.match(await s.text('#app-nav-bar'), /Scorecard/, 'nav bar still there (positive)');
    assert.equal(await s.eval("HardPanChat.available()"), false);
    await done(s);
});

test('6 one phone per golfer: refused on screen and by the rules; a reload keeps your own golfer', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const b = await web('paul2', A, 2, '105');
    assert.ok(await b.waitFor(BTN, 12000));
    assert.ok(await b.tap('#hp-chat-wbtn')); await sleep(600);
    const t = await b.text('#hp-chat');
    assert.match(t, /Paul is already in this chat on another phone/, t);
    assert.equal(await b.eval("!!document.querySelector('[data-rc-join=\"105\"]')"), false, 'no Join');
    const forced = "firebase.database().ref().update({ 'chatSlots/" + A + "/105': 'anon-paul2', 'chatMembers/" + A + "/anon-paul2': { group: '2', joinedAt: firebase.database.ServerValue.TIMESTAMP, name: 'Paul Park', slot: 105, slotIndex: 4 } })";
    assert.equal(await refused(b, forced), 'refused', 'the live rules refuse the same write made by hand');
    assert.equal(await emu.read('chatSlots/' + A + '/105'), 'anon-paul');
    await done(b);
    const c = await phone('late', { url: url(__dirname, 'leaderboard.html', 'game=' + A + '&players=1'), auth: ANON('anon-late') });
    assert.ok(await c.waitFor(BTN, 12000));
    assert.ok(await c.tap('#hp-chat-wbtn')); await sleep(600);
    assert.equal(await c.eval("document.querySelector('[data-rc-pick=\"103\"]').disabled"), true, 'a Players link claim greys Josh too');
    await done(c);
    await P.paul.goto(url(__dirname, 'index.html', 'game=' + A + '&group=2'), 3500);
    assert.ok(await P.paul.waitFor(BTN, 12000));
    assert.ok(await P.paul.tap('#hp-chat-wbtn')); await sleep(800);
    assert.ok(await P.paul.waitFor("!!document.getElementById('rc-input')", 6000), 'Paul reloads: still Paul, no card');
});

test('7 text only: no photo control, no account or signed in; an app photo reads sensibly; nothing fetched for it', Object.assign({ timeout: 90000 }, SKIP), async () => {
    await emu.write('chats/' + A + '/round/-Zphoto1', { uid: 'u-app', name: 'Manny', ts: Date.now(), type: 'photo', photo: 'chat/' + A + '/-Zphoto1.jpg', group: '1' });
    await emu.write('chats/' + A + '/round/-Zphoto2', { uid: 'u-app', name: 'Manny', ts: Date.now(), type: 'photo', photo: 'chat/' + A + '/-Zphoto2.jpg', text: 'Look at this lie', group: '1' });
    const w = P.paul;
    assert.ok(await w.tap({ sel: '#hp-chat .rc-tab', text: /Round/ }).catch(() => null) !== undefined);
    assert.ok(await w.waitFor("/open the HardPan app to see it/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), 'the photo line');
    const t = await w.text('#hp-chat .rc-body');
    assert.match(t, /Manny · G1 📷 Photo · open the HardPan app to see it/, t);
    assert.match(t, /Look at this lie 📷 Photo · open the HardPan app to see it/, 'the caption stays');
    const noCtl = "!document.querySelector('#hp-chat [data-rc=photo],#hp-chat .rc-cam,#rc-photo-input,#hp-chat .rc-photo')";
    assert.equal(await w.eval(noCtl), true, 'no 📷 / 📸, no file input, no empty frame');
    assert.ok(await w.eval("!!document.querySelector('#hp-chat .rc-chip')"), 'the chips are there (positive)');
    assert.equal(await refused(w, "firebase.database().ref('chats/" + A + "/round').push({ uid: 'anon-paul', name: 'Paul Park', ts: firebase.database.ServerValue.TIMESTAMP, type: 'photo', photo: 'chat/" + A + "/x.jpg' })"), 'refused', 'the rules refuse a web photo too');
    await noEscapes(w);
    const s = P.signed = await web('signed', A, 2, '106', ACCT('u-marcus', 'Marcus Lee'));
    assert.ok(await s.waitFor(BTN, 12000), 'a signed-in web golfer');
    assert.ok(await s.tap('#hp-chat-wbtn')); await sleep(500);
    assert.doesNotMatch(await s.text('#hp-chat'), /Sign in to chat/);
    assert.ok(await s.tap('#hp-chat [data-rc=join]'), 'the account joins the app way');
    assert.ok(await s.waitFor("!!document.getElementById('rc-input')", 8000), 'joined under the live rules');
    assert.equal(await s.eval(noCtl), true, 'signed in, on the web: still no photo control');
    await say(s, 'Marcus signed in');
    assert.ok(msgOf(await roundMsgs(A), 'Marcus signed in'), 'posted');
});

test('8 Hide: this phone with no account; on the account (chatBlocks, live rule) for a signed-in web golfer', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const s = P.signed, w = P.paul;
    assert.ok(await s.tap({ sel: '#hp-chat .rc-bub', text: /Bob here, copy that/ })); await sleep(300);
    assert.match(await s.text('#hp-chat .rc-apanel'), /Hide messages from Bob Baker Block: you stop seeing them on every phone you sign in to/);
    assert.ok(await s.tap('#hp-chat [data-rc=hide]')); await sleep(900);
    const b = await emu.read('chatBlocks/u-marcus/anon-bob');
    assert.equal(b && b.name, 'Bob Baker', 'saved on the account: ' + JSON.stringify(b));
    assert.match(await s.text('#hp-chat .rc-body'), /Hidden on your account: Bob Baker/);
    assert.equal(await s.eval("localStorage.getItem('hardpan_chat_hidden')"), null, 'nothing left on the phone');
    await done(s);
    assert.ok(await w.tap({ sel: '#hp-chat .rc-bub', text: /Bob here, copy that/ })); await sleep(300);
    assert.match(await w.text('#hp-chat .rc-apanel'), /Block: only you stop seeing them \(on this phone\)/);
    assert.ok(await w.tap('#hp-chat [data-rc=hide]')); await sleep(500);
    assert.match(await w.text('#hp-chat .rc-body'), /Hidden on this phone: Bob Baker/);
    assert.equal(await emu.read('chatBlocks/anon-paul'), null, 'no account: nothing written');
    assert.match(await w.eval("localStorage.getItem('hardpan_chat_hidden')"), /Bob Baker/);
    await done(w); await done(P.bob); await done(P.josh);
});

test('9 the 💬 rule on the web: a no-account golfer always; the organizer\'s own web phone waits for someone else', Object.assign({ timeout: 90000 }, SKIP), async () => {
    const g = await web('solo-golfer', S1, 1, '102');
    assert.ok(await g.waitFor(BTN, 12000), 'one group, no account, not the organizer: the 💬 shows');
    await done(g);
    const o = await web('org', S2, 1, '101', ANON('anon-org'));
    await sleep(2500);
    assert.equal(await o.eval("HardPanChat.available()"), true, 'chat is available (positive)');
    assert.equal(await o.eval(BTN), false, 'the organizer alone on a one-group round: no 💬');
    const h = await web('golfer2', S2, 1, '102');
    await join(h, 102, 'Join chat as Bob · Group 1');
    assert.ok(await o.waitFor(BTN, 8000), 'another golfer joins: the organizer\'s 💬 appears (the owner may read chatMembers)');
    await done(h); await done(o);
});

test('9b the organizer on the web: chat off hides it, back on the messages return; Remove from chat bans a web golfer', Object.assign({ timeout: 120000 }, SKIP), async () => {
    const C = 'TWCS03';
    await emu.write('events/' + C, round(C, 8, { 0: 4, 1: 4 }));
    const w = await web('ban-paul', C, 2, '105');
    await join(w, 105, 'Join chat as Paul · Group 2');
    await say(w, 'Before the switch');
    const o = await web('ban-org', C, 1, '101', ACCT('u-org', 'Manny Orozco'));
    assert.ok(await o.waitFor(BTN, 12000));
    assert.ok(await o.tap('#hp-chat-wbtn')); await sleep(500);
    assert.ok(await o.tap('#hp-chat [data-rc=join]'), 'the organizer joins');
    assert.ok(await o.waitFor("!!document.getElementById('rc-input')", 8000));
    assert.ok(await o.tap('#hp-chat [data-rc=settings]')); await sleep(400);
    assert.ok(await o.tap('#hp-chat [data-rc=chat-off]')); await sleep(900);
    assert.ok(await w.waitFor("/Chat is off for this round/.test(document.getElementById('hp-chat').innerText)", 8000), 'the open sheet says it is off');
    assert.ok(await w.tap('#hp-chat .rc-ibtn[data-rc=close]')); await sleep(1300);
    assert.equal(await w.eval(BTN), false, 'off: the 💬 is gone');
    assert.ok(await o.tap('#hp-chat [data-rc=chat-on]')); await sleep(900);
    assert.ok(await w.waitFor(BTN, 8000), 'back on: the 💬 is back');
    assert.ok(await w.tap('#hp-chat-wbtn')); await sleep(800);
    assert.ok(await w.waitFor("/Before the switch/.test((document.querySelector('#hp-chat .rc-body')||{}).innerText||'')", 8000), 'back on: the messages are back, no reload');
    await say(w, 'After the switch');
    assert.ok(msgOf(await roundMsgs(C), 'After the switch'), 'posting works again');
    assert.ok(await o.tap('#hp-chat [data-rc=back]')); await sleep(400);
    assert.ok(await o.waitFor("/After the switch/.test((document.querySelector('#hp-chat .rc-body')||{}).innerText||'')", 8000), 'the organizer sees it');
    assert.ok(await o.tap({ sel: '#hp-chat .rc-bub', text: /After the switch/ })); await sleep(300);
    assert.ok(await o.tap('#hp-chat [data-rc=ban]')); await sleep(900);
    assert.ok(await w.waitFor("/You can’t chat in this round/.test(document.getElementById('hp-chat').innerText)", 8000), 'banned: the sheet says so');
    assert.equal(await emu.read('chatSlots/' + C + '/105'), 'anon-ban-paul', 'the golfer stays held');
    await done(w); await done(o);
});

const T = {};
test('10 mixed: v379 web (no chat) + 2.0.2 app + new web: all score, chat flows, the board reads all', Object.assign({ timeout: 200000 }, SKIP), async () => {
    // by sha: origin/main has moved on, and each phone here is one exact version
    T.v379 = exportTree(__dirname, '0d91206d', TREES); T.a202 = exportTree(__dirname, '1995536f', TREES); T.a201 = exportTree(__dirname, '364ada45', TREES);
    const old = T.old = await phone('v379', { url: url(T.v379, 'index.html', 'game=' + M + '&group=1'), preScript: WEB_PRE(M, '102'), auth: ANON('anon-old') });
    assert.equal(await old.eval("typeof HardPanChat"), 'undefined', 'really the old code');
    const app = T.app = await phone('app202', { webgl: true, settleMs: 6000, url: url(T.a202, 'index.html', 'game=' + M + '&group=1'), preScript: APP_PRE(M, '101'), auth: ACCT('u-manny', 'Manny Orozco') });
    const nw = T.nw = await web('new', M, 2, '105');
    const board = T.board = await phone('board', { url: url(__dirname, 'leaderboard.html', 'game=' + M), auth: ANON('anon-board') });
    assert.equal(await app.eval("HARDPAN_GPS_CONFIG.chat"), true, 'the 2.0.2 app: chat on');
    await typeScore(old, 102, 4, 5);
    assert.equal(await emu.read('events/' + M + '/scores/p102_h4'), 5, 'the v379 phone scores');
    await typeScore(nw, 105, 4, 4);
    assert.equal(await emu.read('events/' + M + '/scores/p105_h4'), 4, 'the new web phone scores');
    await typeScore(app, 101, 4, 6);
    assert.equal(await emu.read('events/' + M + '/scores/p101_h4'), 6, 'the 2.0.2 app scores');
    await join(nw, 105, 'Join chat as Paul · Group 2');
    await say(nw, 'New web in the mix');
    assert.ok(await app.tap('#hp-card-bet [data-hp-bar=menu]'), '☰ Menu');
    assert.ok(await app.tap('#hp-sheet [data-hs-tile=chat]'), '💬 Chat tile'); await sleep(500);
    assert.equal(await app.tap('#hp-chat [data-rc=join]'), 'Join chat');
    assert.ok(await app.waitFor("/Paul Park · G2 New web in the mix/.test(document.querySelector('#hp-chat .rc-body').innerText.replace(/\\s+/g, ' '))", 8000), 'the 2.0.2 app sees the web golfer');
    await say(app, 'App copies');
    assert.ok(await nw.waitFor("/App copies/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), 'the web golfer sees the app');
    await typeScore(old, 103, 4, 4);
    assert.equal(await emu.read('events/' + M + '/scores/p103_h4'), 4, 'the v379 phone keeps scoring with chat traffic in the round');
    assert.ok(await board.waitFor("(function(){ var s = currentBoardData.scores || {}; return s.p102_h4 === 5 && s.p105_h4 === 4 && s.p101_h4 === 6 && s.p103_h4 === 4; })()", 8000), 'the board holds every phone\'s score');
    assert.match(await board.text('body'), /Manny Orozco.*|Manny/, 'the board draws');
    assert.equal(await old.eval("!!document.getElementById('hp-chat-wbtn')"), false, 'v379: no chat surface');
    for (const p of [old, nw, board]) { assert.deepEqual(appErrs(p), [], p.name + ' errors'); await noEscapes(p); }
    await noEscapes(app);
});

test('11 mixed: + a 2.0.1 app phone (chat off): scores, no chat surface, nothing written; web <-> 2.0.2 unaffected', Object.assign({ timeout: 150000 }, SKIP), async () => {
    const app1 = await phone('app201', { webgl: true, settleMs: 6000, url: url(T.a201, 'index.html', 'game=' + M + '&group=2'), preScript: APP_PRE(M, '106'), auth: ACCT('u-marcus1', 'Marcus Lee') });
    assert.equal(await app1.eval("HARDPAN_GPS_CONFIG.chat"), false, 'the 2.0.1 app: chat off');
    await typeScore(app1, 106, 4, 5);
    assert.equal(await emu.read('events/' + M + '/scores/p106_h4'), 5, 'the 2.0.1 app scores');
    assert.equal(await app1.eval("!!document.getElementById('hp-chat') || !!document.getElementById('hp-chat-btn')"), false, 'no chat surface');
    assert.equal(await emu.read('chatMembers/' + M + '/u-marcus1'), null, 'nothing written to chat');
    await sleep(1500);
    await say(T.nw, 'Web still talking');
    assert.ok(await T.app.waitFor("/Web still talking/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), 'web -> 2.0.2');
    await say(T.app, 'App still talking');
    assert.ok(await T.nw.waitFor("/App still talking/.test(document.querySelector('#hp-chat .rc-body').innerText)", 8000), '2.0.2 -> web');
    assert.ok(await T.board.waitFor("currentBoardData.scores.p106_h4 === 5", 8000), 'the board reads the 2.0.1 score');
    await noEscapes(app1);
    await done(app1);
    for (const k of ['old', 'app', 'nw', 'board']) await done(T[k]);
});
