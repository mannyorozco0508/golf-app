// ============================================================================
// WEB CHAT 2.1b - THE LIVE RULES (the Nov 6 read-back) ON THE RTDB EMULATOR (local port 9122, nothing live; no rules changed).
// Below, 'PROP' now means that live read-back; 'LIVE' is the older 2.1a copy, kept as the control that refuses a web session.
// Two namespaces:
//   LIVE = the live rules as read (read only) on Nov 3 2026 for this wave (= rules 2.1a, published):
//          outbox/chat-2.1/web-rules-proposal/live-rules-2026-11-03-web.json (WEBCHAT_LIVE to point elsewhere).
//          The control: today an anonymous (no account) session is refused everything below.
//   PROP = database.rules.chat21b-proposed.json (= outbox/chat-2.1/web-rules-proposal/proposed.json, built by
//          its make-proposed.js from LIVE): only chatMembers, chats, chatReports change, chatSlots is new.
// Each "phone" is a vm sandbox with the app's own Firebase SDK and a mock token: 'anonymous' = the web's
// session (no account), 'apple.com' = a signed-in app golfer. The web records are round-chat.js's own
// builders (webJoinUpdate / webPostUpdate / textMessage) - what the web page writes.
// Skipped when the emulator jar or Java is not on this machine (as round_chat_rules_emulator_test.js).
// BASELINE: new file. Against LIVE (the control namespace) every web allow-case is refused (test 2).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const C = require('./round-chat.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
// LIVE NOW (Nov 6): the read-back of the live rules saved after the chatBlocks publish (chat 2.1b, chatSlots, chatBlocks). Read, never changed.
const PROPOSED = process.env.WEBCHAT_PROPOSED || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'deploys-20261106', 'rules-chatblocks', 'readback.json');
const OUTBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'chat-2.1', 'web-rules-proposal');
const LIVE = process.env.WEBCHAT_LIVE || path.join(OUTBOX, 'live-rules-2026-11-03-web.json');
const SKIP = !fs.existsSync(PROPOSED) ? { skip: 'no proposed rules file' } : !fs.existsSync(LIVE) ? { skip: 'no saved live copy' } : (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9122, BASE = 'http://127.0.0.1:' + PORT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emuRules = (s) => JSON.stringify(JSON.parse(s)).replace(/\[\^@\\\\s\]/g, '[^@ ]');   // the emulator cannot parse one e-mail regex in events/ (as 2.1a)
const admin = (ns, p, method, body) => fetch(BASE + '/' + p + '.json?ns=' + ns, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());

function phone(ns, uid, provider) {
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object,
        navigator: { onLine: true, userAgent: 'node' }, location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', search: '', pathname: '/' }, addEventListener() {}, removeEventListener() {} };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    sb.document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + ns + "', projectId: '" + ns + "', apiKey: 'x' }, 'p" + Math.random().toString(36).slice(2) + "'); var __d = firebase.apps[firebase.apps.length - 1].database(); __d.useEmulator('127.0.0.1', " + PORT
        + (uid ? ", { mockUserToken: { sub: '" + uid + "', firebase: { sign_in_provider: '" + (provider || 'apple.com') + "' } } }" : '') + "); window.db = __d;", sb);
    sb.close = () => { try { vm.runInContext('firebase.apps.forEach(function (a) { a.delete(); })', sb); } catch (e) {} };
    return sb;
}
const ok = (p) => Promise.resolve(p).then(() => true, () => false);
const CODE = 'TWEB21';
const NAMES = ['Test Manny', 'Test Bob', 'Test Josh', 'Test Todd', 'Test Paul', 'Test Marcus', 'Test Ann', 'Test Ben'];
const PLAYERS = NAMES.map((n, i) => ({ id: 101 + i, name: n }));
const EVENT = { ownerUid: 'org', eventName: 'Test Web Chat Round', players: PLAYERS };
// The web page's writes, from round-chat.js's own builders.
const joinUp = (uid, pid, group) => C.webJoinUpdate(CODE, uid, PLAYERS, pid, group || '2');
let seq = 0;
const postUp = (uid, name, text, o) => {
    const id = (o && o.id) || ('-w' + (++seq));
    const m = Object.assign(C.textMessage({ uid, name, text, group: (o && o.group) || '2' }), (o && o.extra) || {});
    return C.webPostUpdate(CODE, uid, (o && o.thread) || 'round', (o && o.group) || '2', id, m);
};
const appMsg = (uid, text) => C.textMessage({ uid, name: 'Test ' + uid, text, group: '1' });

describe('Web chat 2.1b rules on the RTDB emulator', SKIP, () => {
    let emu = null; const phones = [];
    const NS_LIVE = 'demo-hpwebl-' + process.pid, NS_PROP = 'demo-hpwebp-' + process.pid;
    const P = (ns, uid, prov) => { const p = phone(ns, uid, prov); phones.push(p); return p; };
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS_LIVE); break; } catch (e) { await wait(500); } }
        for (const [ns, file] of [[NS_LIVE, LIVE], [NS_PROP, PROPOSED]]) {
            const r = await fetch(BASE + '/.settings/rules.json?ns=' + ns, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(fs.readFileSync(file, 'utf8')) }).then((x) => x.json());
            assert.equal(r.status, 'ok', file + ': ' + JSON.stringify(r));
            await admin(ns, 'events/' + CODE, 'PUT', EVENT);
        }
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('1 the live read-back carries everything web chat needs: chat 2.1b, chatSlots, chatBlocks; anonymous still cannot react or set', () => {
        const prop = JSON.parse(fs.readFileSync(PROPOSED, 'utf8')).rules;
        ['chatMembers', 'chats', 'chatReports', 'chatSettings', 'chatReactions', 'chatSlots', 'chatBlocks'].forEach((k) => assert.ok(prop[k], k + ' is live'));
        assert.match(prop.chatMembers.$eventCode.$uid['.write'], /sign_in_provider === 'anonymous'.*slotIndex/, 'the no-account join');
        assert.match(prop.chatBlocks.$uid['.write'], /sign_in_provider !== 'anonymous'/, 'chatBlocks: accounts only');
        assert.match(prop.chatReactions.$eventCode['.read'], /sign_in_provider !== 'anonymous'/, 'reactions: accounts only');
        assert.doesNotMatch(prop.chatSettings.$eventCode['.write'], /anonymous/, 'settings: the organizer only');
    });

    test('2 control - LIVE rules today: the web session (anonymous) cannot join, claim, read or post', { timeout: 30000 }, async () => {
        const N = P(NS_LIVE, 'anon-w1', 'anonymous');
        const got = {
            join: await ok(N.db.ref().update(joinUp('anon-w1', 105))),
            plainJoin: await ok(N.db.ref('chatMembers/' + CODE + '/anon-w1').set({ group: '2', joinedAt: C.SV, name: 'Test Paul' })),
            claim: await ok(N.db.ref('chatSlots/' + CODE + '/105').set('anon-w1')),
            read: await ok(N.db.ref('chats/' + CODE + '/round').once('value')),
            post: await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'hi'))),
        };
        assert.deepEqual(got, { join: false, plainJoin: false, claim: false, read: false, post: false });
    });

    test('3 web join: as a golfer of the round, the claim in the same update; a mismatch or a missing claim refused', { timeout: 30000 }, async () => {
        const N = P(NS_PROP, 'anon-w1', 'anonymous'), X = P(NS_PROP, 'anon-x', 'anonymous');
        const up = joinUp('anon-w1', 105);
        const bad = (f) => { const u = JSON.parse(JSON.stringify(up)); f(u); return u; };
        const M = 'chatMembers/' + CODE + '/anon-w1', S = 'chatSlots/' + CODE + '/105';
        const got = {
            wrongName: await ok(N.db.ref().update(bad((u) => { u[M].name = 'Test Manny'; }))),
            wrongIndex: await ok(N.db.ref().update(bad((u) => { u[M].slotIndex = 0; }))),
            notAGolfer: await ok(N.db.ref().update(bad((u) => { u[M].slot = 999; u[M].slotIndex = 99; delete u[S]; u['chatSlots/' + CODE + '/999'] = 'anon-w1'; }))),
            noClaim: await ok(N.db.ref().update(bad((u) => { delete u[S]; }))),
            claimOnly: await ok(N.db.ref(S).set('anon-w1')),
            claimForOther: await ok(X.db.ref().update(bad((u) => { u[S] = 'anon-w1'; u['chatMembers/' + CODE + '/anon-x'] = u[M]; delete u[M]; }))),
            selfBanFlag: await ok(N.db.ref().update(bad((u) => { u[M].banned = false; }))),
            noRound: await ok(N.db.ref().update(C.webJoinUpdate('NOPE99', 'anon-w1', PLAYERS, 105, '2'))),
            good: await ok(N.db.ref().update(up)),
        };
        assert.deepEqual(got, { wrongName: false, wrongIndex: false, notAGolfer: false, noClaim: false, claimOnly: false, claimForOther: false, selfBanFlag: false, noRound: false, good: true });
        assert.equal((await N.db.ref(S).once('value')).val(), 'anon-w1', 'the claim');
        assert.ok((await N.db.ref(M + '/joinedAt').once('value')).val() > 1e12, 'server time');
        assert.equal(await ok(N.db.ref(M).update({ group: '1' })), false, 'a web member cannot rewrite its record (group, name, slot)');
        assert.equal(await ok(N.db.ref(M).set(up[M])), false, 'nor re-join over it');
    });

    test('4 a second web session cannot take a golfer another session holds; it can take a free one', { timeout: 30000 }, async () => {
        const N2 = P(NS_PROP, 'anon-w2', 'anonymous');
        const got = {
            sameGolfer: await ok(N2.db.ref().update(joinUp('anon-w2', 105))),
            overwriteClaim: await ok(N2.db.ref('chatSlots/' + CODE + '/105').set('anon-w2')),
            deleteClaim: await ok(N2.db.ref('chatSlots/' + CODE + '/105').remove()),
            freeGolfer: await ok(N2.db.ref().update(joinUp('anon-w2', 106))),
        };
        assert.deepEqual(got, { sameGolfer: false, overwriteClaim: false, deleteClaim: false, freeGolfer: true });
        assert.equal((await N2.db.ref('chatSlots/' + CODE + '/105').once('value')).val(), 'anon-w1', 'still the first session\'s');
    });

    test('5 a web member reads + posts TEXT: <= 500, own golfer name, the 3-second gap, one message per write, no photos', { timeout: 60000 }, async () => {
        const N = P(NS_PROP, 'anon-w1', 'anonymous');
        const R = 'chats/' + CODE + '/round';
        const got = { read: await ok(N.db.ref(R).once('value')), g2: await ok(N.db.ref('chats/' + CODE + '/groups/2').once('value')), g1: await ok(N.db.ref('chats/' + CODE + '/groups/1').once('value')) };
        got.first = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'Hi from the web')));
        got.tooSoon = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'and again')));
        await wait(3200);
        got.long = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'x'.repeat(501))));
        got.spoofName = await ok(N.db.ref().update(postUp('anon-w1', 'Test Manny', 'I am Manny')));
        got.spoofUid = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'as bob', { extra: { uid: 'bob' } })));
        got.photo = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'pic', { extra: { type: 'photo', photo: 'chat/' + CODE + '/-p.jpg' } })));
        const plain = C.textMessage({ uid: 'anon-w1', name: 'Test Paul', text: 'no stamp', group: '2' });
        got.noStamp = await ok(N.db.ref(R + '/-plain').set(plain));
        const two = Object.assign(postUp('anon-w1', 'Test Paul', 'one', { id: '-two1' }), { [R + '/-two2']: C.textMessage({ uid: 'anon-w1', name: 'Test Paul', text: 'two', group: '2' }) });
        got.twoAtOnce = await ok(N.db.ref().update(two));
        got.otherGroup = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'sneak', { thread: 'group', group: '1' })));
        got.max = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'x'.repeat(500))));
        await wait(3200);
        got.ownGroup = await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'Group 2 on 7', { thread: 'group', group: '2' })));
        got.backdate = await ok(N.db.ref('chatMembers/' + CODE + '/anon-w1/lastPostAt').set(1000));
        got.react = await ok(N.db.ref('chatReactions/' + CODE + '/x/anon-w1').set('fire'));
        got.settings = await ok(N.db.ref('chatSettings/' + CODE).set({ on: false }));
        assert.deepEqual(got, { read: true, g2: true, g1: false, first: true, tooSoon: false, long: false, spoofName: false, spoofUid: false, photo: false, noStamp: false, twoAtOnce: false,
            otherGroup: false, max: true, ownGroup: true, backdate: false, react: false, settings: false });
        const r = (await N.db.ref(R).once('value')).val();
        assert.ok(Object.keys(r).some((k) => r[k].text === 'Hi from the web' && r[k].ts > 1e12));
    });

    test('6 the app (signed in, 2.1a path unchanged) reads the web golfer\'s message and replies', { timeout: 30000 }, async () => {
        const A = P(NS_PROP, 'manny');
        assert.equal(await ok(A.db.ref('chatMembers/' + CODE + '/manny').set({ group: '1', joinedAt: C.SV, name: 'Manny' })), true, 'the 2.1a join, as before');
        const r = (await A.db.ref('chats/' + CODE + '/round').once('value')).val();
        assert.ok(Object.keys(r).some((k) => r[k].uid === 'anon-w1' && r[k].name === 'Test Paul'), 'the app sees the web message');
        assert.equal(await ok(A.db.ref('chats/' + CODE + '/round/-app1').set(appMsg('manny', 'See you on 8, Paul'))), true, 'a plain set, no rate fields (signed in)');
        assert.equal(await ok(A.db.ref('chats/' + CODE + '/round/-app2').set(appMsg('manny', 'x'.repeat(1000)))), true, 'signed in: still 1,000');
    });

    test('7 a web member reports (Apple 1.2), removes its own message, cannot remove another\'s', { timeout: 30000 }, async () => {
        const N = P(NS_PROP, 'anon-w1', 'anonymous'), N2 = P(NS_PROP, 'anon-w2', 'anonymous');
        const r = (await N.db.ref('chats/' + CODE + '/round').once('value')).val();
        const mine = Object.keys(r).find((k) => r[k].uid === 'anon-w1');
        const got = {
            report: await ok(N.db.ref('chatReports/' + CODE + '/-app1/anon-w1').set({ reason: 'Spam', ts: C.SV, thread: 'round' })),
            othersMsg: await ok(N2.db.ref('chats/' + CODE + '/round/' + mine).remove()),
            appMsg: await ok(N.db.ref('chats/' + CODE + '/round/-app1').remove()),
            own: await ok(N.db.ref('chats/' + CODE + '/round/' + mine).remove()),
        };
        assert.deepEqual(got, { report: true, othersMsg: false, appMsg: false, own: true });
    });

    test('8 the organizer bans a web golfer: no reads, no posts, no unban, no rejoin; the golfer stays held; the organizer can free it', { timeout: 40000 }, async () => {
        const O = P(NS_PROP, 'org', 'anonymous'), N2 = P(NS_PROP, 'anon-w2', 'anonymous'), N3 = P(NS_PROP, 'anon-w3', 'anonymous');
        await wait(3200);
        const got = { before: await ok(N2.db.ref().update(postUp('anon-w2', 'Test Marcus', 'Marcus here'))) };
        got.ban = await ok(O.db.ref('chatMembers/' + CODE + '/anon-w2/banned').set(true));
        await wait(3200);
        got.read = await ok(N2.db.ref('chats/' + CODE + '/round').once('value'));
        got.post = await ok(N2.db.ref().update(postUp('anon-w2', 'Test Marcus', 'let me back')));
        got.unban = await ok(N2.db.ref('chatMembers/' + CODE + '/anon-w2/banned').set(false));
        got.rejoin = await ok(N2.db.ref().update(joinUp('anon-w2', 106)));
        got.leave = await ok(N2.db.ref('chatMembers/' + CODE + '/anon-w2').remove());
        got.newSessionSameGolfer = await ok(N3.db.ref().update(joinUp('anon-w3', 106)));
        got.ownerRemovesMsg = await ok(O.db.ref('chats/' + CODE + '/round/-app2').remove());
        got.ownerFrees = await ok(O.db.ref('chatSlots/' + CODE + '/106').remove());
        assert.deepEqual(got, { before: true, ban: true, read: false, post: false, unban: false, rejoin: false, leave: false, newSessionSameGolfer: false, ownerRemovesMsg: true, ownerFrees: true });
    });

    test('9 chat off: the web member cannot read or post; back on, it can', { timeout: 30000 }, async () => {
        const O = P(NS_PROP, 'org', 'anonymous'), N = P(NS_PROP, 'anon-w1', 'anonymous');
        assert.equal(await ok(O.db.ref('chatSettings/' + CODE).set({ on: false })), true);
        await wait(3200);
        const off = { read: await ok(N.db.ref('chats/' + CODE + '/round').once('value')), post: await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'still on?'))) };
        assert.equal(await ok(O.db.ref('chatSettings/' + CODE).update({ on: true })), true);
        const on = { read: await ok(N.db.ref('chats/' + CODE + '/round').once('value')), post: await ok(N.db.ref().update(postUp('anon-w1', 'Test Paul', 'back on'))) };
        assert.deepEqual({ off, on }, { off: { read: false, post: false }, on: { read: true, post: true } });
    });

    test('10 nothing else changed: events/ and $other behave as LIVE, for an app golfer and a web session', { timeout: 30000 }, async () => {
        for (const ns of [NS_LIVE, NS_PROP]) {
            for (const [uid, prov] of [['manny', 'apple.com'], ['anon-w9', 'anonymous']]) {
                const A = P(ns, uid, prov);
                assert.equal(await ok(A.db.ref('events/' + CODE + '/eventName').once('value')), true, ns + ' events readable as before');
                assert.equal(await ok(A.db.ref('events/' + CODE + '/scores/p105_h1').set(4)), true, ns + ' a score write as before');
                assert.equal(await ok(A.db.ref('events/' + CODE + '/ownerUid').set(uid)), false, ns + ' ownerUid still locked');
                assert.equal(await ok(A.db.ref('somethingNew/x').set(1)), false, ns + ' $other still closed');
                assert.equal(await ok(A.db.ref('chatSlots').once('value')), false, ns + ' no listing every round\'s slots');
            }
        }
    });

    // PLAYERS LINK (ADVISOR-1727 9:26 PM ADD): "chat join never grants score rights". What the rules CAN show:
    // joining the chat changes nothing about scores - the events/ rules never read a chat node, and an anonymous
    // session's score write gets the SAME answer before and after it joins as a golfer. Said plainly (a finding,
    // not a pass): today's LIVE scores rule is "auth != null && the round exists", so ANY session with the code
    // - the website's anonymous one included, chat or no chat - can write a score; the scorekeeper code is checked
    // by the page, not by the rules. Locking scores to scorers is a separate scores-rules change (not this one).
    test('11 players link: a chat join grants no score rights (events/ never reads chat; score write same before/after join)', { timeout: 30000 }, async () => {
        const prop = JSON.parse(fs.readFileSync(PROPOSED, 'utf8')).rules;
        assert.doesNotMatch(JSON.stringify(prop.events), /chat(Members|Slots|Settings|Reports|Reactions|s\b)/, 'events/ rules never read a chat node');
        const N = P(NS_PROP, 'anon-pl1', 'anonymous');
        const tryScore = (k, v) => ok(N.db.ref('events/' + CODE + '/scores/' + k).set(v));
        const tryPlayers = () => ok(N.db.ref('events/' + CODE + '/players/1/name').set('Test Hacked'));
        const tryEvent = () => ok(N.db.ref('events/' + CODE + '/eventName').set('Test Hacked'));
        const before = { score: await tryScore('p102_h1', 4), players: await tryPlayers(), event: await tryEvent() };
        assert.equal(await ok(N.db.ref().update(joinUp('anon-pl1', 102, '1'))), true, 'joins the chat as Test Bob (Group 1), the 2.1b way');
        const m = await admin(NS_PROP, 'chatMembers/' + CODE + '/anon-pl1', 'GET');
        assert.equal(m && m.slot, 102, 'joined');
        const afterJ = { score: await tryScore('p102_h2', 5), players: await tryPlayers(), event: await tryEvent() };
        assert.deepEqual(afterJ, before, 'a chat join changes no score / round right');
        assert.deepEqual({ players: before.players, event: before.event }, { players: false, event: false }, 'no round setup from a web session');
        console.log('# FINDING (pre-existing, LIVE rules): an anonymous session with the code can write a score: ' + before.score);
        await admin(NS_PROP, 'events/' + CODE + '/scores', 'DELETE');
    });

    test('12 a LOCKED round (scoreLock, 2.0.1): a chat join adds nothing, the session still cannot score; web chat itself works', { timeout: 30000 }, async () => {
        const L = 'TWEBLK';
        await admin(NS_PROP, 'events/' + L, 'PUT', Object.assign({}, EVENT, { scoreLock: true }));
        const N = P(NS_PROP, 'anon-lk1', 'anonymous');
        const tryScore = (k, v) => ok(N.db.ref('events/' + L + '/scores/' + k).set(v));
        assert.equal(await tryScore('p103_h1', 4), false, 'locked: refused before the chat join');
        const up = C.webJoinUpdate(L, 'anon-lk1', PLAYERS, 103, '1');
        assert.equal(await ok(N.db.ref().update(up)), true, 'the chat join still works on a locked round');
        assert.equal(await tryScore('p103_h2', 5), false, 'locked: still refused after the chat join');
    });

    test('13 seats: only the organizer deletes a seat or another golfer\'s member record; a golfer or a signed-in account by hand is refused', { timeout: 30000 }, async () => {
        const L = 'TWEBSE';
        await admin(NS_PROP, 'events/' + L, 'PUT', EVENT);
        const H = P(NS_PROP, 'anon-se1', 'anonymous');
        assert.equal(await ok(H.db.ref().update(C.webJoinUpdate(L, 'anon-se1', PLAYERS, 103, '1'))), true, 'a golfer holds Test Josh');
        const G = P(NS_PROP, 'anon-se2', 'anonymous');
        assert.equal(await ok(G.db.ref().update(C.webJoinUpdate(L, 'anon-se2', PLAYERS, 104, '1'))), true, 'another golfer in the round');
        const A = P(NS_PROP, 'u-notowner', 'apple.com');
        for (const [who, N] of [['another golfer', G], ['a stranger', P(NS_PROP, 'anon-se3', 'anonymous')], ['a signed-in account', A]]) {
            assert.equal(await ok(N.db.ref('chatSlots/' + L + '/103').remove()), false, who + ': the seat');
            assert.equal(await ok(N.db.ref('chatMembers/' + L + '/anon-se1').remove()), false, who + ': the member record');
            assert.equal(await ok(N.db.ref().update({ ['chatSlots/' + L + '/103']: null, ['chatMembers/' + L + '/anon-se1']: null })), false, who + ': both in one update');
        }
        assert.equal(await admin(NS_PROP, 'chatSlots/' + L + '/103', 'GET'), 'anon-se1', 'still held');
        const O = P(NS_PROP, 'org', 'apple.com');
        assert.equal(await ok(O.db.ref().update({ ['chatSlots/' + L + '/103']: null, ['chatMembers/' + L + '/anon-se1']: null })), true, 'the organizer frees it');
        assert.equal(await admin(NS_PROP, 'chatSlots/' + L + '/103', 'GET'), null);
    });
});
