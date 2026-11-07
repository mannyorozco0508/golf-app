// ============================================================================
// HARDPAN - ROUND CHAT 2.1a (window.HardPanChat). The GPS app: index.html's GPS block, as before.
// WEB CHAT 2.1b (ADVISOR-1727): the website loads this file too, from its own include with
// data-hp-chat="web" (index.html, leaderboard.html) - a group-link or Players-link golfer with no account
// joins as a golfer of the round (see WEB CHAT below; rules 2.1b are live since Nov 3).
//
// Manny's design (ADVISOR-1545, B + C), one message store underneath:
//   B  CHAT OVER THE GPS MAP: a sheet that slides up from the map and stops UNDER the
//      yardage header (the header is never covered). Tabs Round / Group. HardPan's auto
//      lines (birdie, skin riding...) as system rows. Quick chips 👏 Nice shot · ⏱ We're
//      behind · 🍺 Beer cart? · 📸, input "Message the round…". A PEEK BAR on the map
//      shows the latest message + the unread count; a tap opens the sheet.
//   C  THE ROUND FEED (Round Menu tile): cards for HardPan's highlights (KP leader, press,
//      birdies, skins won, final results), golfer posts with photos, reactions
//      (🔥 😂 ❤️ 👍 😬) and a reply count. "Post to the feed…" + 📸.
//   The feed IS the round thread: its messages + the auto rows + chatReactions.
//
// THE DATA (none of it under events/ - events/$code is readable by anyone with the code;
// these nodes need sign-in. Rules: outbox/chat-2.1/rules-proposal, NOT published):
//   chatMembers/<code>/<uid>            { group: "2", joinedAt: SERVER, name }      Join (the only way in)
//   chats/<code>/round/<push>           { uid, name, ts: SERVER, type: 'text'|'photo', text, photo?, group?, replyTo? }
//   chats/<code>/groups/<g>/<push>      the same, that group's members only
//   chats/<code>/round/<push> type 'auto' { kind, text, ts }   written by the auto-post function only, never a phone
//   chatReactions/<code>/<msgId>/<uid>  'fire' | 'laugh' | 'heart' | 'up' | 'grimace'
//   chatReports/<code>/<msgId>/<uid>    { reason, ts: SERVER, thread }
//   chatSettings/<code>                 { on, photos, auto }   the round's ownerUid only. Missing = ON (Manny: on by default)
//
// SIGN-IN: reading or posting needs a signed-in account (HardPanAuth.state().signedIn - not the
// anonymous session every phone has). Signed out, the sheet says "Sign in to chat". NOTHING is
// written until the golfer taps Join chat (the join card carries the no-tolerance terms).
//
// MODERATION (Apple 1.2): Report (chatReports), Hide messages from X (see HIDE below), Remove for everyone (the sender or the round's ownerUid:
// the message is deleted), the organizer can remove a golfer from the chat (banned) and turn
// chat off for the round (chatSettings on:false - hides it for everyone, nothing deleted).
// A short word filter on the phone masks the worst words; the same check on the server is a
// function (firebase-functions/chat-core.js) - NOT deployed.
//
// PHOTOS: behind HARDPAN_GPS_CONFIG.chatPhotos === true (OFF: Firebase Storage is not set up).
// The path: pick/take -> re-encoded through a canvas on the phone (~1600 px JPEG: the EXIF,
// location included, does not survive the canvas - no location leaves the phone) -> Storage
// chat/<code>/<msgId>.jpg -> the message. Viewing asks the chatPhotoLink function for a
// short-lived link after it checks membership (Manny's option b). Function NOT deployed.
//
// HIDE (2.0.2, Manny's "OK build 2.0.2" on mockups b1 / b2): SAVED ON THE ACCOUNT for a signed-in account -
//   chatBlocks/<myUid>/<theirUid>       { name, ts: SERVER }   only that account reads / writes it (rules proposal:
//                                       outbox/chat-202/blocks-rules-proposal, NOT published). The hidden golfer is never told.
//   Read with a listener while chat is attached, so a new phone or a reinstall still hides them; Show again removes
//   the whole list (every phone). The sheet: "Block: you stop seeing them on every phone you sign in to"; the note:
//   "Hidden on your account: <names> · Show again".
//   The phone list from before 2.0.2 (localStorage hardpan_chat_hidden) moves to the account the first time chat
//   opens signed in, then is cleared. A hide is ALSO kept in that local list until the database acknowledges it, so
//   a refused write (the rule not published yet) or a kill while offline never loses it - it is retried on the next
//   open and every 20 s while chat is attached.
//   No account (the anonymous session - the web golfer of branch web-chat): ON THIS PHONE only, as before -
//   localStorage hardpan_chat_hidden, "Hidden on this phone", "(on this phone)". Nothing is read or written.
//
// OFFLINE: the database queues a write made with no signal; the bubble reads "Sending…" until
// the server acknowledges it. A hide goes the same way (dbRef().set).
// ============================================================================
(function (root) {
    'use strict';

    // ---- PURE HELPERS (tested in node: round_chat_unit_test.js) ----------------------------
    var MAX = 1000;
    var REACTIONS = [{ k: 'fire', e: '🔥' }, { k: 'laugh', e: '😂' }, { k: 'heart', e: '❤️' }, { k: 'up', e: '👍' }, { k: 'grimace', e: '😬' }];
    var QUICK = ['👏 Nice shot', '⏱ We’re behind', '🍺 Beer cart?'];
    var AUTO_ICON = { birdie: '🐦', eagle: '🦅', skin: '🏆', skinRide: '⏩', press: '🔁', kp: '🎯', final: '🏁', longDrive: '💥', left: '👋', moved: '📱' };
    var REASONS = ['Offensive or abusive', 'Spam', 'Something else'];
    // The phone's short list (ROT13 so the source does not read like the list it is). The server
    // check is the same list and more (chat-core.js).
    var ROT = ['shpx', 'zbgureshpxre', 'fuvg', 'ovgpu', 'phag', 'nffubyr', 'snttbg', 'snt', 'avttre', 'avttn', 'ergneq', 'jubre', 'fyhg', 'onfgneq', 'chffl', 'qbhpur'];
    function rot13(s) { return String(s).replace(/[a-z]/gi, function (c) { var b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); }); }
    var WORDS = ROT.map(rot13);
    var WORD_RE = new RegExp('\\b(' + WORDS.join('|') + ')(s|es|ed|ing|in|er|ers|y|ty)?\\b', 'gi');
    function maskWords(text) {
        return String(text == null ? '' : text).replace(WORD_RE, function (w) { return w.charAt(0) + new Array(w.length).join('•'); });
    }
    function hasBadWord(text) { WORD_RE.lastIndex = 0; var r = WORD_RE.test(String(text || '')); WORD_RE.lastIndex = 0; return r; }
    // What a golfer typed, ready to send: trimmed, no runs of blank lines. '' = nothing to send.
    function cleanText(t) { return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim(); }
    function validText(t) { var c = cleanText(t); return c.length >= 1 && c.length <= MAX; }
    var SV = { '.sv': 'timestamp' };   // = firebase.database.ServerValue.TIMESTAMP
    function textMessage(o) {
        var m = { uid: String(o.uid), name: String(o.name || 'Golfer').slice(0, 40), ts: SV, type: 'text', text: cleanText(o.text) };
        if (o.group != null) m.group = String(o.group);
        if (o.replyTo) m.replyTo = String(o.replyTo);
        return m;
    }
    function photoMessage(o) {
        var m = { uid: String(o.uid), name: String(o.name || 'Golfer').slice(0, 40), ts: SV, type: 'photo', photo: String(o.photo) };
        var t = cleanText(o.text); if (t) m.text = t;
        if (o.group != null) m.group = String(o.group);
        return m;
    }
    function threadPath(code, thread, g) { return 'chats/' + code + (thread === 'group' ? '/groups/' + g : '/round'); }
    function tsOf(m, now) { return m && typeof m.ts === 'number' ? m.ts : (now || Date.now()); }
    // {pushId: msg} -> oldest first, each { id, pending }.
    function listOf(obj, pending, now) {
        var out = [];
        Object.keys(obj || {}).forEach(function (k) { var m = obj[k]; if (m && typeof m === 'object') out.push(Object.assign({ id: k, pending: !!(pending && pending[k]) }, m)); });
        out.sort(function (a, b) { var d = tsOf(a, now) - tsOf(b, now); return d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
        return out;
    }
    function visible(list, hidden) { var h = hidden || {}; return list.filter(function (m) { return !(m.uid && h[m.uid]); }); }
    // Unread = other golfers' messages with a push id after the last one this phone showed (push ids
    // sort in time order; a server timestamp is not known yet while a write is in flight).
    function unreadCount(list, uid, seenId) {
        var s = String(seenId || '');
        return list.filter(function (m) { return m.uid !== uid && !m.pending && String(m.id) > s; }).length;
    }
    function reactionSummary(rx, uid) {
        var r = rx || {};
        return REACTIONS.map(function (x) {
            var n = 0; Object.keys(r).forEach(function (u) { if (r[u] === x.k) n++; });
            return { k: x.k, e: x.e, n: n, mine: !!(uid && r[uid] === x.k) };
        });
    }
    function validReaction(k) { return REACTIONS.some(function (x) { return x.k === k; }); }
    // The feed: top-level posts + auto rows, NEWEST first; replies under their post.
    function feedOf(list) {
        var replies = {}, top = [];
        list.forEach(function (m) { if (m.replyTo) (replies[m.replyTo] = replies[m.replyTo] || []).push(m); else top.push(m); });
        return { top: top.slice().reverse(), replies: replies };
    }
    function initials(name) {
        var p = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
    }
    // A photo's size on the way out: the long side at most max (1600), never up-scaled.
    function fitDims(w, h, max) {
        w = Number(w) || 0; h = Number(h) || 0; max = max || 1600;
        if (!w || !h) return { w: 0, h: 0 };
        var s = Math.min(1, max / Math.max(w, h));
        return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
    }
    function chatOn(settings) { return !(settings && settings.on === false); }
    function canRemove(m, uid, ownerUid) { return !!(m && uid && (m.uid === uid || (ownerUid && String(ownerUid) === String(uid)))); }

    // ---- WEB CHAT (2.1b, ADVISOR-1727): a group-link golfer on the website, no account ----
    // The anonymous session the web already has joins AS ONE GOLFER OF THE ROUND (a "slot"): the claim
    // chatSlots/<code>/<playerId> = uid is written in the SAME update as the member record, first claim
    // wins (rules 2.1b). Text only (no photos), 500 characters, one message per 3 s - the
    // rules check that through the member's lastPostAt / lastMsg, which every web post updates with it.
    var WEB_MAX = 500, WEB_GAP_MS = 3000;
    // free | mine | taken - a slot as this session sees it.
    function slotState(slots, pid, uid) {
        var v = slots && pid != null ? slots[String(pid)] : null;
        return !v ? 'free' : (uid && String(v) === String(uid) ? 'mine' : 'taken');
    }
    // The golfer's name as the rules bind it: the round's own name for that player, 40 characters at most.
    function slotName(player) { return String((player && player.name) || '').slice(0, 40); }
    // ONE multi-path update: the claim + the member record. players = the round's list (its index is
    // what the rules read: events/<code>/players/<index>/id must be the slot).
    function webJoinUpdate(code, uid, players, pid, group) {
        var list = players || [], i = -1;
        for (var k = 0; k < list.length; k++) { if (list[k] && String(list[k].id) === String(pid)) { i = k; break; } }
        if (i < 0 || !code || !uid) return null;
        var u = {};
        u['chatSlots/' + code + '/' + list[i].id] = String(uid);
        u['chatMembers/' + code + '/' + uid] = { group: String(group), joinedAt: SV, name: slotName(list[i]), slot: Number(list[i].id), slotIndex: i };
        return u;
    }
    // ONE multi-path update: the message + the member's lastPostAt (server now) and lastMsg (this id).
    function webPostUpdate(code, uid, thread, g, id, msg) {
        var u = {};
        u[threadPath(code, thread, g) + '/' + id] = msg;
        u['chatMembers/' + code + '/' + uid + '/lastPostAt'] = SV;
        u['chatMembers/' + code + '/' + uid + '/lastMsg'] = String(id);
        return u;
    }
    function webTooSoon(lastAt, now) { return typeof lastAt === 'number' && (now - lastAt) < WEB_GAP_MS; }

    var PURE = { MAX: MAX, REACTIONS: REACTIONS, QUICK: QUICK, maskWords: maskWords, hasBadWord: hasBadWord, cleanText: cleanText, validText: validText,
        textMessage: textMessage, photoMessage: photoMessage, threadPath: threadPath, listOf: listOf, visible: visible, unreadCount: unreadCount,
        reactionSummary: reactionSummary, validReaction: validReaction, feedOf: feedOf, initials: initials, fitDims: fitDims, chatOn: chatOn, canRemove: canRemove, SV: SV,
        WEB_MAX: WEB_MAX, WEB_GAP_MS: WEB_GAP_MS, slotState: slotState, slotName: slotName, webJoinUpdate: webJoinUpdate, webPostUpdate: webPostUpdate, webTooSoon: webTooSoon };
    if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; }
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var W = window;
    // WEB MODE: only the website's own include says so (index.html: the GPS_ENABLED=0 build
    // emits <script src="round-chat.js" data-hp-chat="web">). The GPS app's include has no attribute, so
    // everything below behaves there exactly as before (WEB is false).
    var WEB = (function () { try { var s = document.currentScript; return !!(s && s.getAttribute('data-hp-chat') === 'web'); } catch (e) { return false; } })();
    // PLAYERS LINK (ADVISOR-1727 9:26 PM ADD): leaderboard.html?game=CODE&players=1 on the website - the view-only
    // leaderboard (no score boxes, no setup) + the 💬. Every golfer on the round's list can join the chat as
    // themselves ("Which golfer are you?"); "Just watching" = no chat. Joining never grants score rights: this page
    // has no score boxes, and the only writes are the 2.1b chat claim + member record (proven on the emulator).
    // The plain Spectator link (no players=1) stays watch-only: no 💬.
    var PLAYERS = WEB && (function () { try { return /[?&]players=1(&|$)/.test(W.location.search) && /\/leaderboard(\.html)?\/?$/i.test(W.location.pathname); } catch (e) { return false; } })();

    // A Players link NEVER LEADS TO SCORE ENTRY. The leaderboard's nav bar goes to the Scorecard (and every other page's nav
    // does too), where a tap would put score boxes in front of a golfer this link says can't score. So on this link only,
    // the bar is not shown; the plain Spectator link keeps it. The database is not what stops a score here (see the report).
    if (PLAYERS) { try { var nb = document.createElement('style'); nb.id = 'hp-players-nav'; nb.textContent = '#app-nav-bar{display:none !important;}'; (document.head || document.documentElement).appendChild(nb); } catch (e) { } }

    // ---- THE ROUND (index.html's globals, read at call time) -------------------------------
    /* global currentData, currentMode, lockedGroup, hasGroupLock, resolvedMeId, playerGroupMap, computeGroupBoundaries, golferShortName, uiToast, firebase */
    function data() {
        if (PLAYERS) { try { return typeof currentBoardData !== 'undefined' && currentBoardData && currentBoardData.players ? currentBoardData : null; } catch (e) { return null; } }   /* global currentBoardData */
        try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; }
    }
    function code() { try { var c = typeof currentMode !== 'undefined' ? currentMode : null; return c && /^[A-Za-z0-9_-]{3,40}$/.test(String(c)) && !/^L-/.test(String(c)) ? String(c) : null; } catch (e) { return null; } }
    function B() { return W.HardPanBet || null; }
    function flowOn() { if (!appOn()) return false; var b = B(); return !!(b && b.on && b.on()); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function say(t) { try { if (typeof uiToast === 'function') uiToast(t); } catch (e) { } }
    function players() { var d = data(); return (d && d.players) || []; }
    function meId() {
        if (PLAYERS) return S.member && S.member.slot != null ? String(S.member.slot) : null;   // the golfer this phone joined as
        try { return typeof resolvedMeId === 'function' ? resolvedMeId() : null; } catch (e) { return null; }
    }
    function myGroup() {
        if (PLAYERS) { var me = meId(), gm = me ? groupMap()[me] : null; return String(gm || (S.member && S.member.group) || '1'); }
        try { var b = B(); if (b && typeof b.myGroup === 'function') return String(b.myGroup()); } catch (e) { }
        try { if (typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup) return String(lockedGroup); } catch (e) { }
        return '1';
    }
    function groupMap() { var d = data() || {}; try { return typeof playerGroupMap === 'function' ? playerGroupMap(d.players || [], d.groupSizeOverrides || {}) : {}; } catch (e) { return {}; } }
    function groupCount() { var d = data() || {}; try { return computeGroupBoundaries((d.players || []).length, d.groupSizeOverrides || {}).length || 1; } catch (e) { return 1; } }
    function shortName(p) { try { if (typeof golferShortName === 'function') return golferShortName(p, players()); } catch (e) { } return String((p && p.name) || '').trim().split(/\s+/)[0] || ''; }
    function myName() {
        var id = meId(), p = id ? players().filter(function (x) { return String(x.id) === String(id); })[0] : null;
        var n = p ? shortName(p) : '';
        if (!n) { var a = auth(), fu = WEB ? fbUser() : null; n = (a && a.name) || (fu && fu.displayName) || ''; }
        return String(n || 'Golfer').slice(0, 40);
    }
    function groupNames(g) {
        var m = groupMap(), out = [];
        players().forEach(function (p) { if (String(m[p.id]) === String(g)) out.push(shortName(p)); });
        return out;
    }
    function auth() { try { return W.HardPanAuth && W.HardPanAuth.state ? W.HardPanAuth.state() : null; } catch (e) { return null; } }
    function uidNow() {
        try { var u = firebase.auth().currentUser; if (u && u.uid) return String(u.uid); } catch (e) { }
        var a = auth(); return a && a.uid ? String(a.uid) : null;
    }
    function signedIn() { if (WEB) return webSignedIn(); var a = auth(); return !!(a && a.signedIn && a.uid); }   // the website has no HardPanAuth: its Firebase user says
    // Web mode: the session is the anonymous one the website signs in at boot (no account). A web visitor
    // who IS signed in (not anonymous) takes the app's path (no slot needed).
    function fbUser() { try { return firebase.auth().currentUser || null; } catch (e) { return null; } }
    function webAnon() { if (!WEB) return false; var u = fbUser(); return !!(u && u.uid && u.isAnonymous !== false); }
    function webSignedIn() { if (!WEB) return false; var u = fbUser(); return !!(u && u.uid && u.isAnonymous === false); }
    function canChat() { return WEB ? (webAnon() || webSignedIn()) : signedIn(); }
    function webLink() { if (PLAYERS) return true; try { return !!(typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup); } catch (e) { return false; } }
    function maxLen() { return webAnon() ? WEB_MAX : MAX; }
    function ownerUid() { var d = data(); return d && d.ownerUid ? String(d.ownerUid) : null; }
    function isOwner() { var o = ownerUid(), u = uidNow(); return !!(o && u && o === u); }
    function dbRef(p) { if (!appOn()) return null; try { return p ? firebase.database().ref(p) : firebase.database().ref(); } catch (e) { return null; } }   // the real SDK throws on ref(''): the web's root updates need ref()
    function sv() { try { return (firebase.database.ServerValue && firebase.database.ServerValue.TIMESTAMP) || SV; } catch (e) { return SV; } }
    function cfg() { return W.HARDPAN_GPS_CONFIG || {}; }
    // THE APP-WIDE SWITCH (2.0.1 shipped chat: false; 2.0.2 turns it on): chat runs only when
    // HARDPAN_GPS_CONFIG.chat === true. Off = nothing at all: no 💬 button, no peek bar, no badge, no tile,
    // no sheet, and no read or write of chats / chatMembers / chatReactions / chatSettings / chatReports / chatBlocks.
    function appOn() { return WEB || cfg().chat === true; }   // the website ships no gps-config.js: its include IS its switch (chatSettings on:false still turns one round off)
    function photosOn() { var c = cfg(); return c.chatPhotos === true || !!(c.features && c.features.chatPhotos === true); }
    function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) { } return null; }
    function lsJson(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }

    // ---- STATE --------------------------------------------------------------------------
    var S = { code: null, uid: null, settings: null, member: undefined, msgs: { round: {}, group: {} }, rx: {}, pending: {}, gAttached: null,
        mode: null, tab: 'round', action: null, report: null, feedOpen: {}, reports: null, offs: [], threadOffs: [], slots: null, pick: null, lastSent: 0, move: null, slotMembers: null,
        blocks: {}, blocksFor: null, blocksLive: false, blockBusy: {}, blocksOpened: false, blocksNext: 0, unhideGen: 0 };
    // HIDE (see the header): a signed-in account keeps the list on the account (chatBlocks/<uid>); the anonymous session
    // (no account) keeps it on this phone only, as before 2.0.2.
    function acctUid() {
        if (!signedIn()) return null;
        var a = auth(); if (a && a.anonymous) return null;
        try { var cu = firebase.auth().currentUser; if (cu && cu.isAnonymous) return null; } catch (e) { }
        return uidNow();
    }
    function onAccount() { var u = acctUid(); return !!(u && u === S.uid); }
    function localHidden() { return lsJson('hardpan_chat_hidden') || {}; }
    function setLocalHidden(h) { ls('hardpan_chat_hidden', h && Object.keys(h).length ? JSON.stringify(h) : null); }
    // { uid: name } of everyone hidden: the account's list (signed in) + the phone's list (no account, or a hide not yet
    // acknowledged by the database - never lost).
    function hidden() {
        var h = {}, b = onAccount() && S.blocksFor === S.uid ? (S.blocks || {}) : {}, l = localHidden();
        Object.keys(b).forEach(function (k) { if (b[k]) h[k] = String((b[k] && b[k].name) || 'Golfer'); });
        Object.keys(l).forEach(function (k) { h[k] = String(l[k] || 'Golfer'); });
        return h;
    }
    function seenKey() { return 'hardpan_chat_seen_' + S.code; }
    function seen() { return lsJson(seenKey()) || {}; }
    function markSeen(thread) {
        var last = '';
        Object.keys(S.msgs[thread] || {}).forEach(function (k) { if (k > last) last = k; });
        var s = seen(); if (last && last > String(s[thread] || '')) { s[thread] = last; ls(seenKey(), JSON.stringify(s)); }
    }
    function joined() { return !!(S.member && S.member.joinedAt != null && S.member.banned !== true); }
    function banned() { return !!(S.member && S.member.banned === true); }

    function listen(path, cb, into) {
        var r = dbRef(path); if (!r || typeof r.on !== 'function') return;
        var fn = function (snap) { try { cb(snap && typeof snap.val === 'function' ? snap.val() : null); } catch (e) { } };
        r.on('value', fn, function () { cb(null); });
        into.push(function () { try { r.off('value', fn); } catch (e) { } });
    }
    function detach(list) { while (list.length) { try { list.pop()(); } catch (e) { } } }
    function reattach() {
        if (!appOn()) { detach(S.offs); detach(S.threadOffs); return; }
        var c = code(), u = uidNow();
        if (c === S.code && u === S.uid) return;
        detach(S.offs); detach(S.threadOffs);
        S.code = c; S.uid = u; S.settings = null; S.member = undefined; S.msgs = { round: {}, group: {} }; S.rx = {}; S.gAttached = null; S.reports = null; S.slots = null; S.pick = null; S.move = null;
        S.blocks = {}; S.blocksFor = null; S.blocksLive = false; S.blockBusy = {}; S.blocksOpened = false;
        if (!c) return;
        listen('chatSettings/' + c, function (v) { var was = chatOn(S.settings); S.settings = v || {}; if (!was && chatOn(S.settings)) { S.gAttached = null; threads(); } changed(); }, S.offs);   // back on: chat off cancelled the thread listeners (the rules refuse the read), so listen again
        if (u) listen('chatMembers/' + c + '/' + u, function (v) { S.member = v; threads(); changed(); }, S.offs);
        // Web: who already holds which golfer (the Join card greys a taken one out).
        if (u && webAnon()) listen('chatSlots/' + c, function (v) { S.slots = v || {}; changed(); }, S.offs);
        if (u && onAccount()) listenBlocks(u);
    }
    // The account's hide list, live (a hide or Show again on another phone arrives here). A refused read (the rule not
    // published yet) leaves the phone's own list in charge; syncBlocks() listens again.
    function listenBlocks(u) {
        var r = dbRef('chatBlocks/' + u); if (!r || typeof r.on !== 'function') return;
        S.blocksFor = u; S.blocksLive = true;
        var fn = function (snap) { try { S.blocks = (snap && typeof snap.val === 'function' ? snap.val() : null) || {}; } catch (e) { } changed(); };
        r.on('value', fn, function () { if (S.blocksFor === u) S.blocksLive = false; changed(); });
        S.offs.push(function () { try { r.off('value', fn); } catch (e) { } });
    }
    // One hide to the account, through the same database path as every chat write (queued offline). The phone keeps
    // it until the database acknowledges it.
    function saveBlock(u, them, name) {
        if (S.blockBusy[them]) return;
        var r = dbRef('chatBlocks/' + u + '/' + them); if (!r) return;
        S.blockBusy[them] = true;
        var gen = S.unhideGen, p;
        try { p = r.set({ name: String(name || 'Golfer').slice(0, 60), ts: sv() }); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).then(function () {
            delete S.blockBusy[them];
            if (acctUid() !== u || gen !== S.unhideGen) return;
            if (S.blocksFor === u) { S.blocks = Object.assign({}, S.blocks); S.blocks[them] = { name: String(name || 'Golfer') }; }
            var l = localHidden(); delete l[them]; setLocalHidden(l);
            changed();
        }, function () { delete S.blockBusy[them]; });
    }
    // The phone's list -> the account: the pre-2.0.2 list the first time chat opens signed in, and any hide a refused
    // or unfinished write left behind (retried on each open and every 20 s).
    function syncBlocks() {
        var u = acctUid(); if (!u || u !== S.uid || !S.code) return;
        S.blocksOpened = true; S.blocksNext = Date.now() + 20000;
        if (!S.blocksLive) listenBlocks(u);
        var l = localHidden();
        Object.keys(l).forEach(function (k) { saveBlock(u, k, l[k]); });
    }
    // The threads are read only once this golfer has joined (the rules refuse them before).
    function threads() {
        if (!joined() || !canChat()) { detach(S.threadOffs); S.gAttached = null; S.msgs = { round: {}, group: {} }; S.rx = {}; return; }
        var g = String(S.member.group || myGroup());
        if (S.gAttached === g) return;
        detach(S.threadOffs); S.gAttached = g;
        var c = S.code;
        listen(threadPath(c, 'round') , function (v) { S.msgs.round = v || {}; changed(); }, S.threadOffs);
        listen(threadPath(c, 'group', g), function (v) { S.msgs.group = v || {}; changed(); }, S.threadOffs);
        if (!webAnon()) listen('chatReactions/' + c, function (v) { S.rx = v || {}; changed(); }, S.threadOffs);   // web: no feed, no reactions
    }
    var drawQueued = false;
    // 2.0.2 (AAB 18 check): the gate's Sign in. The round page doesn't load the account sheet until it's asked for. Back
    // signed in: joined, on the chat (the sign-in card carries the chat rules; a few minutes' window only).
    function signInSheet() {
        S.joinAfterAt = Date.now();
        var open = function () { try { if (W.HardPanAccountUI && W.HardPanAccountUI.openSignIn) W.HardPanAccountUI.openSignIn(); } catch (err) { } };
        if (W.HardPanAccountUI) { open(); return; }
        var s = document.createElement('script'); s.src = 'hp-account-ui.js'; s.onload = open; document.head.appendChild(s);
    }
    function joinAfterSignIn() {
        if (!S.joinAfterAt || !signedIn() || S.member === undefined) return;
        var fresh = Date.now() - S.joinAfterAt < 600000; S.joinAfterAt = 0;
        if (fresh && !joined() && !banned() && chatOn(S.settings)) join();
    }
    function changed() {
        if (drawQueued) return; drawQueued = true;
        setTimeout(function () { drawQueued = false; joinAfterSignIn(); if (S.mode) { if (S.mode === 'chat') markSeen(S.tab); if (S.mode === 'feed') markSeen('round'); draw(); } peek(); }, 0);
    }

    // ---- WRITES (each one a golfer's tap) ------------------------------------------------------
    function join() {
        var c = S.code, u = S.uid;
        if (!c || !u || !canChat()) return;
        if (webAnon()) return;   // the web session joins as a golfer: webJoin(pid)
        var r = dbRef('chatMembers/' + c + '/' + u); if (!r) return;
        ls('hardpan_chat_terms_v1', '1');
        r.set({ group: myGroup(), joinedAt: sv(), name: myName() }).then(null, function () { say('Couldn’t join the chat. Try again.'); });
    }
    // WEB: join as one golfer of this group. The claim and the member record go in ONE update; the rules
    // refuse it whole if another session already holds that golfer (and the screen says so first).
    function webJoin(pid) {
        var c = S.code, u = S.uid;
        if (!c || !u || !webAnon()) return;
        var st = slotState(S.slots, pid, u);
        if (st === 'taken') { S.pick = String(pid); draw(); return; }
        var up = webJoinUpdate(c, u, players(), pid, PLAYERS ? String(groupMap()[pid] || '1') : myGroup()); if (!up) return;
        var r = dbRef(''); if (!r || typeof r.update !== 'function') return;
        ls('hardpan_chat_terms_v1', '1');
        up['chatMembers/' + c + '/' + u].joinedAt = sv();
        r.update(up).then(null, function () { S.pick = String(pid); say('Couldn’t join as that golfer: someone else may have just joined as them.'); draw(); });
    }
    // WEB: THE WAY BACK (chatSeatMove). A seat belongs to the anonymous session that took it, so a golfer on a new phone or
    // browser is locked out of their own golfer, and the rules let only the organizer delete a seat. The function checks the
    // other phone is idle, frees the seat and posts the line; this phone then joins the ordinary way. Plain fetch with the ID
    // token, as the photo link. Every answer ends in words on the screen, never a dead tap.
    var SEAT_NO_FN = 'Couldn’t reach HardPan to move the chat. Check your signal and try again, or ask the organizer.';
    function seatCall(pid) {
        return within(idToken().then(function (tok) {
            return fetch(FN_BASE + '/chatSeatMove', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ data: { code: S.code, pid: Number(pid) } }) });
        }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.result) throw new Error('no-answer'); return j.result; }), 15000, 'seat');
    }
    function seatMove(pid) {
        var mv = S.move; if (!mv || mv.busy || String(mv.pid) !== String(pid) || !webAnon()) return;
        mv.busy = true; mv.msg = null; draw();
        seatCall(pid).then(function (r) {
            if (S.move !== mv) return;
            if (!r.ok && r.reason !== 'empty') { S.move = { pid: pid, msg: String(r.message || SEAT_NO_FN) }; draw(); return; }
            S.move = null;
            var sl = Object.assign({}, S.slots); delete sl[String(pid)]; S.slots = sl;   // the listener is a beat behind the server
            webJoin(pid); draw();
        }, function () { if (S.move === mv) { S.move = { pid: pid, msg: SEAT_NO_FN }; draw(); } });
    }
    function send(thread, text, replyTo) {
        var t = cleanText(text);
        if (!t) return false;
        var lim = maxLen();
        if (t.length > lim) { say(lim === MAX ? 'Messages are 1,000 characters at most.' : 'Messages are 500 characters at most.'); return false; }
        if (!joined() || !chatOn(S.settings)) return false;
        if (webAnon() && webTooSoon(S.lastSent, Date.now())) { say('One message every 3 seconds.'); return false; }
        var g = String(S.member.group || myGroup());
        var r = dbRef(threadPath(S.code, thread, g)); if (!r) return false;
        var m = textMessage({ uid: S.uid, name: webAnon() ? String(S.member.name || myName()) : myName(), text: maskWords(t), group: g, replyTo: replyTo });
        m.ts = sv();
        var child = r.push(); var id = child.key;
        S.pending[id] = true;
        var p;
        if (webAnon()) {
            // the message + lastPostAt + lastMsg in ONE update (the rules' 3-second check reads them)
            var up = webPostUpdate(S.code, S.uid, thread, g, id, m), root = dbRef('');
            up['chatMembers/' + S.code + '/' + S.uid + '/lastPostAt'] = sv();
            S.lastSent = Date.now();
            p = root.update(up);
        } else p = child.set(m);
        if (p && typeof p.then === 'function') p.then(function () { delete S.pending[id]; changed(); }, function () { delete S.pending[id]; say('That message didn’t send.'); changed(); });
        else delete S.pending[id];
        changed();
        return true;
    }
    function threadOfId(id) { return S.msgs.round[id] ? 'round' : (S.msgs.group[id] ? 'group' : null); }
    function msgById(id) { var t = threadOfId(id); return t ? Object.assign({ id: id, thread: t }, S.msgs[t][id]) : null; }
    function remove(id) {
        var m = msgById(id); if (!m || !canRemove(m, S.uid, ownerUid())) return;
        var r = dbRef(threadPath(S.code, m.thread, S.gAttached) + '/' + id); if (!r) return;
        r.remove().then(function () { say('Removed for everyone.'); }, function () { say('Couldn’t remove it.'); });
    }
    function report(id, reason) {
        var m = msgById(id); if (!m) return;
        var r = dbRef('chatReports/' + S.code + '/' + id + '/' + S.uid); if (!r) return;
        r.set({ reason: String(reason).slice(0, 60), ts: sv(), thread: m.thread === 'group' ? 'group-' + S.gAttached : 'round' })
            .then(function () { say('Reported. The organizer and HardPan support will see it.'); }, function () { say('Couldn’t send the report.'); });
    }
    function hide(uid, name) {
        var h = localHidden(); h[uid] = String(name || 'Golfer'); setLocalHidden(h);   // first on the phone: never lost
        var u = acctUid();
        if (u && u === S.uid) { saveBlock(u, uid, name); say('You won’t see messages from ' + (name || 'them') + ' on any phone you sign in to.'); return; }
        say('You won’t see messages from ' + (name || 'them') + ' on this phone.');
    }
    function unhideAll() {
        setLocalHidden(null); S.unhideGen++;
        var u = acctUid(); if (!u || u !== S.uid) return;
        S.blocks = {};
        var r = dbRef('chatBlocks/' + u); if (!r) return;
        r.remove().then(null, function () { say('Couldn’t show them again. Try again.'); });
    }
    function ban(uid) {
        if (!isOwner()) return;
        var r = dbRef('chatMembers/' + S.code + '/' + uid + '/banned'); if (!r) return;
        r.set(true).then(function () { say('Removed from this chat.'); }, function () { say('Couldn’t remove them.'); });
    }
    function react(id, k) {
        if (!joined() || !validReaction(k) || !chatOn(S.settings)) return;
        var cur = (S.rx[id] || {})[S.uid];
        var r = dbRef('chatReactions/' + S.code + '/' + id + '/' + S.uid); if (!r) return;
        if (cur === k) r.remove(); else r.set(k);
    }
    function setSetting(k, v) {
        if (!isOwner()) return;
        var r = dbRef('chatSettings/' + S.code); if (!r) return;
        var o = {}; o[k] = !!v;
        r.update(o).then(null, function () { say('Couldn’t change the chat setting.'); });
    }
    // WEB, THE ORGANIZER: who holds which golfer, and Free this seat (the rules let the round's owner delete a seat and a
    // member). A removed golfer's member record stays, so the ban stands; only the seat goes.
    function loadSeats() {
        if (!WEB || !isOwner()) return;
        var c = S.code, a = dbRef('chatSlots/' + c), m = dbRef('chatMembers/' + c); if (!a || !m) return;
        Promise.all([a.once('value'), m.once('value')]).then(function (v) { S.slots = v[0].val() || {}; S.slotMembers = v[1].val() || {}; if (S.mode === 'settings') draw(); }, function () { S.slotMembers = {}; });
    }
    function freeSeat(pid) {
        if (!WEB || !isOwner() || !S.slots || !S.slots[pid]) return;
        var who = S.slots[pid], mem = (S.slotMembers || {})[who], up = {}, r = dbRef(); if (!r) return;
        up['chatSlots/' + S.code + '/' + pid] = null;
        if (!(mem && mem.banned === true)) up['chatMembers/' + S.code + '/' + who] = null;
        r.update(up).then(function () { say('Seat freed. That golfer can join again.'); loadSeats(); }, function () { say('Couldn’t free the seat.'); });
    }
    function seatsHtml() {
        if (!WEB || !S.slots) return '';
        var ids = Object.keys(S.slots); if (!ids.length) return '';
        return '<div class="rc-srow flat"><i>📱</i><div><b>Seats</b><span>Which phone holds each web golfer</span></div></div><div class="rc-rlist">' + ids.map(function (id) {
            var p = playerById(id); return '<div>' + esc(p ? shortName(p) : 'Golfer') + ' · <button type="button" class="rc-rep" data-rc-free="' + esc(id) + '">Free this seat</button></div>';
        }).join('') + '</div>';
    }
    function loadReports() {
        if (!isOwner()) return;
        var r = dbRef('chatReports/' + S.code); if (!r) return;
        r.once('value').then(function (s) { S.reports = (s && s.val && s.val()) || {}; if (S.mode === 'settings') draw(); }, function () { S.reports = {}; });
    }

    // ---- PHOTOS (behind chatPhotos; OFF until Firebase Storage is turned on) -------------------
    var FN_BASE = 'https://us-central1-golfapp-9fb21.cloudfunctions.net';
    function bucket() { return cfg().chatPhotoBucket || 'golfapp-9fb21.firebasestorage.app'; }
    function idToken() { try { var u = firebase.auth().currentUser; return u && u.getIdToken ? Promise.resolve(u.getIdToken()) : Promise.reject(new Error('no-user')); } catch (e) { return Promise.reject(e); } }
    // The canvas re-encode: what leaves the phone is pixels only - no EXIF, no GPS block.
    function reencode(file, max) {
        var dims = function (w, h) { return fitDims(w, h, max || 1600); };
        var draw2 = function (src, w, h) {
            var d = dims(w, h), cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
            cv.getContext('2d').drawImage(src, 0, 0, d.w, d.h);
            return new Promise(function (res, rej) { cv.toBlob(function (b) { if (b) res(b); else rej(new Error('encode')); }, 'image/jpeg', 0.82); });
        };
        // ADVISOR-2300 (Nov 3, Manny's phone): a library photo is often HEIC. createImageBitmap can refuse it in a
        // WKWebView while <img> decodes it fine - so a refusal falls back to <img>, never to nothing.
        var viaImg = function () {
            return new Promise(function (res, rej) {
                var img = new Image(), url = URL.createObjectURL(file);
                img.onload = function () { URL.revokeObjectURL(url); draw2(img, img.naturalWidth, img.naturalHeight).then(res, rej); };
                img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
                img.src = url;
            });
        };
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bm) { return draw2(bm, bm.width, bm.height); })
                .then(null, function (e) { plog('bitmap-failed', String(e && e.message || e)); return viaImg(); });
        }
        return viaImg();
    }
    // A step that never answers is an error, not a silence (ADVISOR-2300).
    function within(p, ms, what) {
        return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(what + '-timeout')); }, ms); })]);
    }
    // One line per step in the device console (Safari Web Inspector / the Xcode console): no names, no pixels.
    function plog(step, detail) { try { console.info('[hp-chat-photo] ' + step + (detail != null ? ' ' + detail : '')); } catch (e) { } }
    function upload(path, blob) {
        return idToken().then(function (tok) {
            return fetch('https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucket()) + '/o?uploadType=media&name=' + encodeURIComponent(path), {
                method: 'POST', credentials: 'omit', headers: { Authorization: 'Firebase ' + tok, 'Content-Type': 'image/jpeg' }, body: blob });
        }).then(function (r) { if (!r || !r.ok) throw new Error('upload ' + (r && r.status)); return path; });
    }
    function myPhotoCount() {
        var n = 0; ['round', 'group'].forEach(function (t) { listOf(S.msgs[t]).forEach(function (m) { if (m.uid === S.uid && m.type === 'photo') n++; }); });
        return n;
    }
    function pickPhoto(thread, text) {
        if (WEB) return;   // photos stay in the app (the web has no 📷)
        if (!photosOn()) { say('Photos are coming soon.'); return; }
        if (!joined()) return;
        if (myPhotoCount() >= 10) { say('10 photos per golfer per round.'); return; }
        // ADVISOR-2300: the input stays IN the page (a detached file input can be dropped before iOS WebKit fires its
        // change - "nothing happens after the blue ✓"), both change and input are heard, and it is cleared first so the
        // same photo picked twice still fires.
        var inp = document.getElementById('rc-photo-input');
        if (!inp) {
            inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'rc-photo-input';
            inp.setAttribute('aria-hidden', 'true'); inp.tabIndex = -1;
            inp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
            (document.body || document.documentElement).appendChild(inp);
        }
        try { inp.value = ''; } catch (e) { }
        var fired = false;
        var go = function () {
            var f = inp.files && inp.files[0];
            if (fired || !f) return;
            fired = true;
            plog('picked', (f.type || 'no-type') + ' ' + Math.round((f.size || 0) / 1024) + 'KB');
            sendPhoto(thread, f, text);
        };
        inp.onchange = go; inp.oninput = go;
        plog('picker-open');
        inp.click();
    }
    // ADVISOR-2300: what the sender sees - "📸 Sending photo…" at once, then the photo, or "Couldn't send the photo -
    // tap to retry". In memory only (S.photoOut).
    function photoStatusHtml() {
        var o = S.photoOut; if (!o) return '';
        if (o.state === 'failed') return '<button type="button" class="rc-pstat rc-pfail" data-rc="photo-retry" role="status">Couldn’t send the photo — tap to retry</button>';
        return '<div class="rc-pstat" role="status" aria-live="polite">📸 Sending photo…</div>';
    }
    function sizedJpeg(file) {
        return within(reencode(file), 20000, 'reencode').then(function (blob) {
            plog('reencoded', Math.round(blob.size / 1024) + 'KB');
            if (blob.size < 1.4 * 1024 * 1024) return blob;
            return within(reencode(file, 1200), 20000, 'reencode').then(function (b2) { plog('reencoded-smaller', Math.round(b2.size / 1024) + 'KB'); return b2; });
        });
    }
    function sendPhoto(thread, file, text) {
        var g = String(S.member.group || myGroup()), r = dbRef(threadPath(S.code, thread, g)); if (!r) { plog('no-db'); return Promise.resolve(false); }
        var child = r.push(), id = child.key, path = 'chat/' + S.code + '/' + id + '.jpg';
        S.pending[id] = true;
        S.photoOut = { state: 'sending', thread: thread, file: file, text: text };
        changed();
        return sizedJpeg(file).then(function (blob) { return within(upload(path, blob), 45000, 'upload'); }).then(function () {
            plog('uploaded');
            var m = photoMessage({ uid: S.uid, name: myName(), photo: path, text: maskWords(text || ''), group: g }); m.ts = sv();
            return within(child.set(m), 20000, 'message');
        }).then(function () { plog('sent'); delete S.pending[id]; S.photoOut = null; changed(); return true; }, function (e) {
            plog('failed', String(e && e.message || e));
            delete S.pending[id];
            S.photoOut = { state: 'failed', thread: thread, file: file, text: text };
            changed(); return false;
        });
    }
    var LINKS = {};
    function photoLink(path) {
        var hit = LINKS[path];
        if (hit && hit.exp > Date.now() + 30000) return Promise.resolve(hit.url);
        return idToken().then(function (tok) {
            return fetch(FN_BASE + '/chatPhotoLink', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ data: { code: S.code, path: path } }) });
        }).then(function (r) { return r.json(); }).then(function (j) {
            var res = j && j.result; if (!res || !res.url) throw new Error('no-link');
            LINKS[path] = { url: res.url, exp: Number(res.expires) || Date.now() + 600000 };
            return res.url;
        });
    }
    function fillPhotos(el) {
        if (!photosOn()) return;
        Array.prototype.forEach.call(el.querySelectorAll('[data-rc-photo]:not([data-rc-filled])'), function (n) {
            n.setAttribute('data-rc-filled', '1');
            photoLink(n.getAttribute('data-rc-photo')).then(function (u) { n.style.backgroundImage = 'url("' + String(u).replace(/["\\]/g, '') + '")'; n.classList.add('rc-photo-in'); }, function () { });
        });
    }

    // ---- LOOK ------------------------------------------------------------------------
    var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif';
    var CSS = ''
        + '.hpa-scrim{z-index:10200 !important;}.hpa-sheet{z-index:10201 !important;}'   // the sign-in sheet opens over the chat
        + '#hp-chat{position:fixed;left:0;right:0;bottom:0;top:12vh;z-index:10115;display:none;font-family:' + FONT + ';}'
        + '#hp-chat.open{display:block;}'
        + '#hp-chat .rc-scrim{position:fixed;inset:0;background:rgba(5,20,12,.45);}'
        + '#hp-chat.rc-ongps .rc-scrim{display:none;}'
        + '#hp-chat .rc-panel{position:absolute;inset:0;display:flex;flex-direction:column;background:#f1f3ef;color:#0f1f17;border-radius:20px 20px 0 0;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.3);}'
        + '#hp-chat .rc-head{background:#0f4d3a;color:#fff;padding:8px 14px 10px;flex:0 0 auto;}'
        + '#hp-chat .rc-grab{width:44px;height:5px;border-radius:3px;background:rgba(255,255,255,.35);margin:0 auto 8px;}'
        + '#hp-chat .rc-trow{display:flex;align-items:center;gap:8px;}'
        + '#hp-chat .rc-title{flex:1;min-width:0;font:800 19px/1.2 ' + FONT + ';overflow-wrap:anywhere;}'
        + '#hp-chat .rc-sub{font:500 13px/1.3 ' + FONT + ';color:#cfe3d7;margin-top:3px;}'
        + '#hp-chat .rc-ibtn{border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:999px;min-width:38px;height:38px;font:800 17px/1 ' + FONT + ';cursor:pointer;}'
        + '#hp-chat .rc-tabs{display:flex;gap:8px;margin-top:10px;}'
        + '#hp-chat .rc-tab{flex:1;border:0;border-radius:999px;padding:9px 6px;font:700 15px/1 ' + FONT + ';background:rgba(255,255,255,.14);color:#fff;cursor:pointer;position:relative;}'
        + '#hp-chat .rc-tab.on{background:#d4f07a;color:#0f3d2e;}'
        + '#hp-chat .rc-badge{display:inline-block;min-width:18px;padding:2px 5px;margin-left:6px;border-radius:999px;background:#ef4444;color:#fff;font:800 11px/14px ' + FONT + ';}'
        + '#hp-chat .rc-body{flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 8px;display:flex;flex-direction:column;gap:8px;}'
        + '#hp-chat .rc-auto{align-self:center;max-width:92%;background:#e2efe0;color:#1d4a33;border-radius:14px;padding:8px 14px;font:600 14px/1.3 ' + FONT + ';text-align:center;}'
        + '#hp-chat .rc-row{display:flex;align-items:flex-end;gap:8px;max-width:88%;}'
        + '#hp-chat .rc-row.me{align-self:flex-end;flex-direction:row-reverse;}'
        + '#hp-chat .rc-av{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:#cfe0d5;color:#0f4d3a;font:700 13px/32px ' + FONT + ';text-align:center;}'
        + '#hp-chat .rc-bub{border:0;text-align:left;background:#fff;color:#0f1f17;border-radius:16px;padding:8px 12px;font:500 15px/1.35 ' + FONT + ';box-shadow:0 1px 2px rgba(0,0,0,.06);cursor:pointer;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;}'
        + '#hp-chat .rc-row.me .rc-bub{background:#0f4d3a;color:#fff;}'
        + '#hp-chat .rc-who{display:block;font:600 12px/1.2 ' + FONT + ';color:#5d6b64;margin-bottom:3px;white-space:normal;}'
        + '#hp-chat .rc-row.me .rc-who{color:#bfe0cd;}'
        + '#hp-chat .rc-state{display:block;font:600 11px/1.2 ' + FONT + ';opacity:.75;margin-top:3px;}'
        + '#hp-chat .rc-photo{display:block;width:210px;max-width:100%;height:150px;border-radius:12px;margin-top:4px;background:linear-gradient(135deg,#5c9a6c,#2f6b4a 50%,#a3cf7a);background-size:cover;background-position:center;position:relative;}'
        + '#hp-chat .rc-photo:not(.rc-photo-in)::after{content:"📷";position:absolute;right:8px;bottom:6px;font-size:20px;}'
        + '#hp-chat .rc-empty{margin:auto;text-align:center;color:#5d6b64;font:500 14px/1.4 ' + FONT + ';padding:20px;}'
        + '#hp-chat .rc-card{background:#fff;border-radius:16px;padding:16px;margin:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);font:500 14px/1.45 ' + FONT + ';}'
        + '#hp-chat .rc-card h3{margin:0 0 6px;font:800 18px/1.25 ' + FONT + ';color:#0f3d2e;}'
        + '#hp-chat .rc-card p{margin:0 0 10px;color:#33443b;}'
        + '#hp-chat .rc-cta{display:block;width:100%;border:0;border-radius:14px;background:#0f4d3a;color:#fff;font:800 16px/1 ' + FONT + ';padding:15px;cursor:pointer;margin-top:6px;}'
        + '#hp-chat .rc-fine{font:500 12px/1.4 ' + FONT + ';color:#5d6b64;margin-top:10px;}'
        + '#hp-chat .rc-fine a{color:#0f4d3a;}'
        + '#hp-chat .rc-pstat{display:block;width:100%;box-sizing:border-box;margin:0 0 8px;padding:9px 12px;border-radius:12px;border:0;background:#eef6e0;color:#2b4a12;font:600 14px/1.3 ' + FONT + ';text-align:left;}'
        + '#hp-chat .rc-pfail{background:#fdecec;color:#9b1c1c;cursor:pointer;}'
        + '#hp-chat .rc-foot{flex:0 0 auto;background:#fff;border-top:1px solid #e1e7e3;padding:8px 10px calc(env(safe-area-inset-bottom) + 10px);}'
        + '#hp-chat .rc-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;}'
        + '#hp-chat .rc-chip{flex:0 0 auto;border:1.5px solid #dfe6e2;background:#f6f8f6;color:#0f3d2e;border-radius:999px;padding:7px 11px;font:600 14px/1 ' + FONT + ';cursor:pointer;white-space:nowrap;}'
        + '#hp-chat .rc-in{display:flex;gap:8px;align-items:center;}'
        + '#hp-chat .rc-cam{flex:0 0 auto;width:44px;height:44px;border:0;border-radius:12px;background:#eef2ef;font-size:20px;cursor:pointer;}'
        + '#hp-chat .rc-input{flex:1;min-width:0;height:44px;border:1.5px solid #cfd8d3;border-radius:22px;padding:0 14px;font:500 16px/1 ' + FONT + ';background:#fff;color:#0f1f17;}'
        + '#hp-chat .rc-send{flex:0 0 auto;width:44px;height:44px;border:0;border-radius:50%;background:#0f4d3a;color:#fff;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '#hp-chat .rc-hidden{align-self:center;font:600 12px/1.3 ' + FONT + ';color:#5d6b64;}'
        + '#hp-chat .rc-hidden button{border:0;background:none;color:#0f4d3a;font:700 12px/1 ' + FONT + ';text-decoration:underline;cursor:pointer;}'
        // the action sheet (Report / Hide / Remove) over the panel
        + '#hp-chat .rc-asheet{position:absolute;inset:0;background:rgba(5,20,12,.45);display:flex;align-items:flex-end;z-index:3;}'
        + '#hp-chat .rc-apanel{width:100%;background:#fff;border-radius:20px 20px 0 0;padding:10px 16px calc(env(safe-area-inset-bottom) + 14px);}'
        + '#hp-chat .rc-apanel h4{margin:6px 0 4px;font:800 19px/1.25 ' + FONT + ';color:#0f3d2e;}'
        + '#hp-chat .rc-apanel .rc-asub{font:500 14px/1.35 ' + FONT + ';color:#5d6b64;margin-bottom:8px;}'
        + '#hp-chat .rc-arow{display:flex;gap:12px;align-items:center;width:100%;border:0;border-top:1px solid #e9eeeb;background:none;text-align:left;padding:12px 2px;cursor:pointer;color:#0f1f17;}'
        + '#hp-chat .rc-arow i{font-style:normal;font-size:22px;width:28px;text-align:center;}'
        + '#hp-chat .rc-arow b{display:block;font:600 16px/1.25 ' + FONT + ';}'
        + '#hp-chat .rc-arow span{display:block;font:500 13px/1.3 ' + FONT + ';color:#5d6b64;}'
        + '#hp-chat .rc-arow.red b{color:#b91c1c;}'
        // C: the feed
        + '#hp-chat .rc-fcomp{display:flex;gap:8px;align-items:center;background:#fff;border-radius:16px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);}'
        + '#hp-chat .rc-post{border:0;border-radius:12px;background:#0f4d3a;color:#fff;font:800 15px/1 ' + FONT + ';padding:0 14px;height:44px;cursor:pointer;}'
        + '#hp-chat .rc-fcard{background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);}'
        + '#hp-chat .rc-fcard.auto{background:#0f4d3a;color:#fff;display:flex;gap:12px;align-items:center;}'
        + '#hp-chat .rc-fcard.auto .rc-ficon{font-size:30px;}'
        + '#hp-chat .rc-fcard.auto small{display:block;font:700 11px/1.2 ' + FONT + ';letter-spacing:.08em;color:#d4f07a;margin-bottom:2px;}'
        + '#hp-chat .rc-fcard.auto b{font:700 16px/1.3 ' + FONT + ';}'
        + '#hp-chat .rc-fhead{display:flex;align-items:center;gap:8px;margin-bottom:6px;}'
        + '#hp-chat .rc-fname{flex:1;min-width:0;font:700 15px/1.2 ' + FONT + ';}'
        + '#hp-chat .rc-fname span{font-weight:500;color:#5d6b64;font-size:13px;}'
        + '#hp-chat .rc-more{border:0;background:#eef2ef;border-radius:999px;width:34px;height:30px;font:800 16px/1 ' + FONT + ';cursor:pointer;color:#33443b;}'
        + '#hp-chat .rc-ftext{font:500 15px/1.4 ' + FONT + ';white-space:pre-wrap;overflow-wrap:anywhere;}'
        + '#hp-chat .rc-fcard .rc-photo{width:100%;height:190px;}'
        + '#hp-chat .rc-rx{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center;}'
        + '#hp-chat .rc-rxb{border:1.5px solid #e1e7e3;background:#f6f8f6;border-radius:999px;padding:5px 9px;font:600 14px/1 ' + FONT + ';cursor:pointer;color:#0f1f17;}'
        + '#hp-chat .rc-rxb.mine{border-color:#0f4d3a;background:#e2efe0;}'
        + '#hp-chat .rc-rep{margin-left:auto;border:0;background:none;color:#0f4d3a;font:700 14px/1 ' + FONT + ';cursor:pointer;padding:6px 2px;}'
        + '#hp-chat .rc-replies{margin-top:8px;border-top:1px solid #eef2ef;padding-top:8px;display:flex;flex-direction:column;gap:6px;}'
        + '#hp-chat .rc-reply{font:500 14px/1.35 ' + FONT + ';background:#f6f8f6;border:0;text-align:left;border-radius:12px;padding:7px 10px;cursor:pointer;color:#0f1f17;white-space:pre-wrap;overflow-wrap:anywhere;}'
        + '#hp-chat .rc-reply b{font-weight:700;}'
        // settings rows (mockup 3)
        + '#hp-chat .rc-srow{display:flex;gap:12px;align-items:center;width:100%;border:0;border-bottom:1px solid #e1e7e3;background:none;text-align:left;padding:14px 4px;cursor:pointer;color:#0f1f17;}'
        + '#hp-chat .rc-srow i{font-style:normal;font-size:24px;width:32px;text-align:center;}'
        + '#hp-chat .rc-srow b{display:block;font:600 17px/1.25 ' + FONT + ';}'
        + '#hp-chat .rc-srow span{display:block;font:500 14px/1.3 ' + FONT + ';color:#5d6b64;}'
        + '#hp-chat .rc-srow.red b{color:#b91c1c;}'
        + '#hp-chat .rc-srow.flat{cursor:default;}'
        + '#hp-chat .rc-srow,#hp-chat .rc-arow{justify-content:flex-start;}#hp-chat .rc-srow > div,#hp-chat .rc-arow > div{flex:1;min-width:0;text-align:left;}'
        + '#hp-chat .rc-rlist{padding:0 4px 10px 48px;font:500 13px/1.4 ' + FONT + ';color:#33443b;}'
        // the 💬 button in the map's right column (its size and look come from the column's own rule)
        + '#hp-chat-btn{position:relative !important;display:flex;align-items:center;justify-content:center;}'
        + '#hp-chat-btn .hp-cb-ico{font-size:24px;line-height:1;}'
        + '#hp-chat-btn .hp-cb-badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#ff3b30 !important;color:#fff !important;font:700 12px/20px ' + FONT + ';text-align:center;border:2px solid #0b0f0c;box-shadow:none;}'   // !important: the map column styles its children's spans
        // WEB: the 💬 button docked in the Round Menu bar, right of the pill (the bar's own empty corner - over no
        // control, no score box, nothing that scrolls). Hidden while the Round Menu is open.
        + '#hp-chat-wbtn{position:absolute;top:9px;right:12px;z-index:2;width:46px;height:46px;border:0;border-radius:50%;background:#0f4d3a;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;padding:0;}'
        + '#round-sheet.open #hp-chat-wbtn{display:none !important;}'
        + '#hp-chat-wbtn .hp-cb-ico{font-size:22px;line-height:1;}'
        + '#hp-chat-wbtn .hp-cb-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#ff3b30;color:#fff;font:700 12px/16px ' + FONT + ';text-align:center;border:2px solid #fff;}'
        + '#hp-chat .rc-who-pick{display:flex;flex-direction:column;gap:8px;margin:8px 0 4px;}'
        // PLAYERS LINK: the 💬 floats bottom-right on the view-only leaderboard (that page has no Round Menu bar)
        + '#hp-chat-wbtn.rc-float{position:fixed;top:auto;right:16px;bottom:calc(env(safe-area-inset-bottom) + 20px);width:56px;height:56px;z-index:2147482000;}'
        + '#hp-chat-wbtn.rc-float .hp-cb-ico{font-size:26px;}body.rc-players{padding-bottom:calc(env(safe-area-inset-bottom) + 110px) !important;}'
        + '#hp-chat-whint{position:fixed;left:16px;right:88px;bottom:calc(env(safe-area-inset-bottom) + 24px);z-index:2147481999;display:flex;gap:8px;align-items:center;background:#12392e;color:#fff;border-radius:14px;padding:10px 8px 10px 12px;font:600 14px/1.3 ' + FONT + ';box-shadow:0 4px 14px rgba(0,0,0,.2);}'
        + '#hp-chat-whint span{flex:1;}#hp-chat-whint button{min-width:36px;min-height:36px;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:16px;}'
        + '#hp-chat .rc-pg{font:700 12px/1.3 ' + FONT + ';letter-spacing:.04em;color:#5d6b64;text-transform:uppercase;margin:14px 0 0;}'
        + '#hp-chat .rc-again{margin-top:8px;text-align:center;}'
        + '#hp-chat .rc-gbtn{display:block;width:100%;border:1.5px solid #cfd8d3;border-radius:14px;background:#fff;color:#0f3d2e;font:700 16px/1.2 ' + FONT + ';padding:13px 14px;text-align:left;cursor:pointer;}'
        + '#hp-chat .rc-gbtn[disabled]{background:#f1f3ef;color:#7a8780;cursor:default;}'
        + '#hp-chat .rc-gbtn small{display:block;font:500 13px/1.3 ' + FONT + ';color:#5d6b64;margin-top:2px;}'
        + '#hp-chat .rc-taken{background:#fff4e5;border:1.5px solid #f5c07a;color:#6b3d00;border-radius:12px;padding:10px 12px;margin:8px 0;font:600 14px/1.4 ' + FONT + ';}'

    function rootEl() {
        var r = document.getElementById('hp-chat');
        if (r) return r;
        if (!document.getElementById('hp-chat-css')) { var st = document.createElement('style'); st.id = 'hp-chat-css'; st.textContent = CSS; document.head.appendChild(st); }
        r = document.createElement('div'); r.id = 'hp-chat'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'Round chat');
        r.innerHTML = '<div class="rc-scrim" data-rc="close"></div><div class="rc-panel"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', onClick);
        r.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('rc-input')) { e.preventDefault(); submit(e.target); } });
        return r;
    }
    function onGps() { return document.body.classList.contains('gps-side-gps') && !!document.querySelector('#gps-overlay .gps-map-wrap'); }
    // B: the sheet stops under the yardage header - measured, never a guess.
    function headerBottom() {
        var ov = document.getElementById('gps-overlay'); if (!ov) return 0;
        var h = ov.querySelector('.gps-ld-top') || ov.querySelector('.gps-top') || ov.querySelector('.gps-ld-head');
        if (!h) return 0;
        var r = h.getBoundingClientRect(); return r.height > 0 ? Math.ceil(r.bottom) : 0;
    }
    function place(r) {
        var g = onGps(), hb = g ? headerBottom() : 0;
        r.classList.toggle('rc-ongps', !!(g && hb));
        r.style.top = (g && hb) ? (hb + 8) + 'px' : '';
    }

    // ---- DRAW -----------------------------------------------------------------------
    function fmtTime(ts) {
        if (typeof ts !== 'number') return '';
        try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
    }
    function nameOf(m) { return m.name || 'Golfer'; }
    function headHtml(title, sub, opts) {
        var o = opts || {};
        return '<div class="rc-head"><div class="rc-grab"></div><div class="rc-trow">'
            + (o.back ? '<button type="button" class="rc-ibtn" data-rc="back" aria-label="Back">‹</button>' : '')
            + '<div class="rc-title">' + esc(title) + '</div>'
            + (o.gear ? '<button type="button" class="rc-ibtn" data-rc="settings" aria-label="Chat settings">⚙️</button>' : '')
            + '<button type="button" class="rc-ibtn" data-rc="close" aria-label="Close">✕</button></div>'
            + (sub ? '<div class="rc-sub">' + esc(sub) + '</div>' : '') + (o.tabs || '') + '</div>';
    }
    function roundTitle() { var d = data() || {}; return String(d.eventName || d.courseName || 'This round'); }
    // The gate every screen passes first: chat off, signed out, not joined.
    function gateHtml() {
        if (!chatOn(S.settings) && !isOwner()) return '<div class="rc-card" data-rc-gate="off"><h3>Chat is off for this round</h3><p>The organizer turned it off. Nothing was deleted.</p></div>';
        if (WEB && !canChat()) return '<div class="rc-empty">Loading the chat…</div>';
        if (!WEB && !signedIn()) return '<div class="rc-card" data-rc-gate="signin"><h3>Sign in to chat</h3><p>Round chat is for signed-in golfers in this round, so everyone knows who they’re talking to.</p>'
            + '<p><b>The chat rules:</b> no objectionable content and no abuse. Report anything that breaks them: reports are reviewed within 24 hours, and golfers who break the rules are removed.</p>'
            + '<button type="button" class="rc-cta" data-rc="signin">Sign in</button><div class="rc-fine">Signing in here joins you to the chat, and you agree to the chat rules. Your round, GPS and games keep working without it.</div></div>';
        if (banned()) return '<div class="rc-card" data-rc-gate="banned"><h3>You can’t chat in this round</h3><p>The organizer removed you from this chat.</p></div>';
        if (S.member === undefined || (webAnon() && S.slots === null)) return '<div class="rc-empty">Loading the chat…</div>';
        if (!joined() && webAnon()) return webJoinHtml();
        if (!joined()) return '<div class="rc-card" data-rc-gate="join"><h3>Join the round chat</h3><p>Talk with the whole round and your group. Only golfers who join can see it.</p>'
            + '<p><b>The chat rules:</b> no objectionable content and no abuse. Report anything that breaks them: reports are reviewed within 24 hours, and golfers who break the rules are removed.</p>'
            + '<button type="button" class="rc-cta" data-rc="join">Join chat</button>'
            + '<div class="rc-fine">By joining you agree to the chat rules. Abuse? Email <a href="mailto:support@rattlegolf.com">support@rattlegolf.com</a>.</div></div>';
        if (!chatOn(S.settings)) return '<div class="rc-card" data-rc-gate="off-owner"><h3>Chat is off for this round</h3><p>You turned it off. Nothing was deleted.</p><button type="button" class="rc-cta" data-rc="chat-on">Turn chat back on</button></div>';
        return '';
    }
    // WEB: the Join card. "Join chat as <golfer from the group link> · Group N" - no account. A golfer another
    // phone already holds is shown as taken and cannot be picked (the rules refuse it too).
    function groupPlayers(g) { var m = groupMap(); return players().filter(function (p) { return String(m[p.id]) === String(g); }); }
    function playerById(id) { return players().filter(function (p) { return String(p.id) === String(id); })[0] || null; }
    function moveBtn(p) {
        var m = S.move && String(S.move.pid) === String(p.id) ? S.move : null;
        return (m && m.msg ? '<div class="rc-taken" data-rc-gate="move-no" role="status">' + esc(m.msg) + '</div>' : '')
            + '<button type="button" class="rc-gbtn rc-again" data-rc-move="' + esc(p.id) + '">This is me, move chat to this phone</button>';
    }
    function moveAskHtml(p, fine) {
        var busy = !!S.move.busy, n = shortName(p);
        return '<div class="rc-card" data-rc-gate="move-ask"><h3>Move ' + esc(n) + '’s chat to this phone?</h3><p>The other phone loses the seat and goes back to the join screen. Everyone in the round sees a line saying ' + esc(n) + ' moved chat.</p>'
            + '<p>Only do this if you are ' + esc(n) + '.</p>'
            + '<button type="button" class="rc-cta" data-rc-move-yes="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Moving…' : 'Yes, move chat to this phone') + '</button>'
            + (busy ? '' : '<button type="button" class="rc-gbtn rc-again" data-rc-move-no="1">Cancel</button>') + fine + '</div>';
    }
    function webJoinHtml() {
        // 2.0.2 preview (Manny): 💬 tapped before the round or the seats arrived showed "0 golfers" and no names, and stayed that way.
        if (S.gone && !players().length) return '<div class="rc-card" data-rc-gate="gone"><h3>This round isn’t there any more</h3><p>It was ended or removed, so there’s no chat to join. Ask the organizer for a new link.</p></div>';
        if (!players().length || S.slots === null) return '<div class="rc-empty">Loading the round…</div>';
        var g = myGroup(), list = groupPlayers(g), me = meId();
        var mine = me ? list.filter(function (p) { return String(p.id) === String(me); })[0] : null;
        var rules = '<p><b>The chat rules:</b> no objectionable content and no abuse. Report anything that breaks them: reports are reviewed within 24 hours, and golfers who break the rules are removed.</p>';
        var fine = '<div class="rc-fine">No account needed: you chat as a golfer from this round’s list, text only (photos need the HardPan app). The organizer can remove anyone or turn the chat off. By joining you agree to the chat rules. Abuse? Email <a href="mailto:support@rattlegolf.com">support@rattlegolf.com</a>.</div>';
        var takenOf = function (p) { return slotState(S.slots, p.id, S.uid) === 'taken'; };
        var takenMsg = function (p, inList) {
            return '<div class="rc-taken" data-rc-gate="taken"><b>' + esc(shortName(p)) + ' is already in this chat on another phone.</b> Only one phone can chat as each golfer. If that isn’t you, ask the organizer.</div>' + (inList ? '' : moveBtn(p));   // a list carries the button on the golfer's own row
        };
        if (S.move && S.move.ask) { var mp = playerById(S.move.pid); if (mp) return moveAskHtml(mp, fine); }
        if (PLAYERS) return playersJoinHtml(rules, fine, takenOf, takenMsg);
        var head = '<div class="rc-card" data-rc-gate="webjoin"><h3>Join the round chat</h3><p>Talk with the whole round and Group ' + esc(g) + '. Only golfers who join can see it.</p>' + rules;
        if (mine) {
            if (takenOf(mine)) return head + takenMsg(mine) + fine + '</div>';
            return head + '<button type="button" class="rc-cta" data-rc-join="' + esc(mine.id) + '">Join chat as ' + esc(shortName(mine)) + ' · Group ' + esc(g) + '</button>' + fine + '</div>';
        }
        var pick = S.pick ? playerById(S.pick) : null;
        return head + (pick && takenOf(pick) ? takenMsg(pick, true) : '') + '<p><b>Who are you?</b></p><div class="rc-who-pick">' + list.map(function (p) {
            var t = takenOf(p);
            return '<button type="button" class="rc-gbtn" data-rc-join="' + esc(p.id) + '"' + (t ? ' disabled aria-disabled="true"' : '') + '>Join chat as ' + esc(shortName(p)) + ' · Group ' + esc(g)
                + (t ? '<small>Already in the chat on another phone</small>' : '') + '</button>' + (t ? moveBtn(p) : '');
        }).join('') + '</div>' + fine + '</div>';
    }
    // PLAYERS LINK: "Which golfer are you?" - the whole round by group (a golfer another phone holds is greyed),
    // "Just watching" (no chat); a tap on a name -> "Join chat as Bob · Group 1" (+ "Not Bob? Pick again").
    function playersJoinHtml(rules, fine, takenOf, takenMsg) {
        var m = groupMap(), pick = S.pick ? playerById(S.pick) : null;
        var fineP = fine.replace('</div>', ' This link never enters scores.</div>');
        if (pick && !takenOf(pick)) {
            var pg = String(m[pick.id] || '1');
            return '<div class="rc-card" data-rc-gate="webjoin"><h3>Join the round chat</h3><p>Talk with the whole round and Group ' + esc(pg) + '. Only golfers who join can see it.</p>' + rules
                + '<button type="button" class="rc-cta" data-rc-join="' + esc(pick.id) + '">Join chat as ' + esc(shortName(pick)) + ' · Group ' + esc(pg) + '</button>'
                + '<button type="button" class="rc-gbtn rc-again" data-rc-pick="">Not ' + esc(shortName(pick)) + '? Pick again</button>' + fineP + '</div>';
        }
        var gs = [], by = {};
        players().forEach(function (p) { var g = String(m[p.id] || '1'); if (!by[g]) { by[g] = []; gs.push(g); } by[g].push(p); });
        gs.sort(function (a, b) { return Number(a) - Number(b); });
        return '<div class="rc-card" data-rc-gate="players"><h3>Which golfer are you?</h3><p>' + esc(roundTitle()) + ' · ' + esc(S.code || '') + ' · one phone per golfer</p>'
            + (pick && takenOf(pick) ? takenMsg(pick, true) : '')
            + gs.map(function (g) {
                return '<div class="rc-pg">Group ' + esc(g) + '</div><div class="rc-who-pick">' + by[g].map(function (p) {
                    var t = takenOf(p);
                    return '<button type="button" class="rc-gbtn" data-rc-pick="' + esc(p.id) + '"' + (t ? ' disabled aria-disabled="true"' : '') + '>' + esc(String(p.name || shortName(p)))
                        + '<small>' + (t ? 'Already in the chat on another phone' : 'Group ' + esc(g)) + '</small></button>' + (t ? moveBtn(p) : '');
                }).join('') + '</div>';
            }).join('')
            + '<div class="rc-who-pick"><button type="button" class="rc-gbtn" data-rc="watch">👀 Just watching<small>See the round. No chat, no scores.</small></button></div>' + fineP + '</div>';
    }
    function photoHtml(m) {
        if (WEB) return m.type === 'photo' ? '<span class="rc-state" data-rc-photo-web="1">📷 Photo · open the HardPan app to see it</span>' : '';   // never an empty frame
        return m.type === 'photo' && m.photo ? '<span class="rc-photo" data-rc-photo="' + esc(m.photo) + '" role="img" aria-label="Photo"></span>' : '';
    }
    function bubbleHtml(m, gpsGroups) {
        if (m.type === 'auto') return '<div class="rc-auto" data-rc-auto="' + esc(m.kind || '') + '">' + (AUTO_ICON[m.kind] || '⛳') + ' ' + esc(m.text) + '</div>';
        var me = m.uid === S.uid;
        var who = me ? '' : '<span class="rc-who">' + esc(nameOf(m)) + (gpsGroups && m.group ? ' · G' + esc(m.group) : '') + '</span>';
        var state = m.pending ? '<span class="rc-state">Sending…</span>' : '';
        return '<div class="rc-row' + (me ? ' me' : '') + '">' + (me ? '' : '<span class="rc-av">' + esc(initials(nameOf(m))) + '</span>')
            + '<button type="button" class="rc-bub" data-rc-msg="' + esc(m.id) + '">' + who + (m.replyTo ? '<span class="rc-who">↪ reply to ' + esc(nameOf((S.msgs.round || {})[m.replyTo] || { name: 'a post' })) + '</span>' : '') + (m.text ? esc(maskWords(m.text)) : '') + photoHtml(m) + state + '</button></div>';
    }
    function hiddenNote() {
        var h = hidden(), n = Object.keys(h).length;
        return n ? '<div class="rc-hidden">' + (onAccount() ? 'Hidden on your account: ' : 'Hidden on this phone: ') + esc(Object.keys(h).map(function (k) { return h[k]; }).join(', ')) + ' · <button type="button" data-rc="unhide">Show again</button></div>' : '';
    }
    function badge(thread) {
        if (!joined()) return '';
        var n = unreadCount(visible(listOf(S.msgs[thread], S.pending), hidden()), S.uid, seen()[thread]);
        return n && !(S.mode === 'chat' && S.tab === thread) ? '<span class="rc-badge">' + n + '</span>' : '';
    }
    function chatHtml() {
        var g = S.member && S.member.group ? String(S.member.group) : myGroup();
        var tabs = '<div class="rc-tabs" role="tablist"><button type="button" role="tab" class="rc-tab' + (S.tab === 'round' ? ' on' : '') + '" data-rc-tab="round">Round' + badge('round') + '</button>'
            + '<button type="button" role="tab" class="rc-tab' + (S.tab === 'group' ? ' on' : '') + '" data-rc-tab="group">Group ' + esc(g) + badge('group') + '</button></div>';
        var gc = groupCount(), n = players().length;
        var sub = S.tab === 'group' ? groupNames(g).join(', ') + ' · only your group sees this'
            : n + ' golfers' + (gc > 1 ? ' · ' + gc + ' groups' : '') + (WEB ? ' · golfers in this round' : ' · signed-in golfers in this round');
        if (WEB && !n) sub = 'Getting the round…';
        else if (PLAYERS && !joined()) { tabs = ''; S.tab = 'round'; sub = n + ' golfers' + (gc > 1 ? ' · ' + gc + ' groups' : '') + ' · pick your name to chat'; }   // no group before a name is picked
        var html = headHtml('💬 ' + (S.tab === 'group' ? 'Group ' + g : roundTitle()) + ' · Chat', sub, { gear: isOwner(), tabs: tabs });
        var gate = gateHtml();
        if (gate) return html + '<div class="rc-body">' + gate + '</div>';
        var list = visible(listOf(S.msgs[S.tab], S.pending), hidden());
        var body = list.length ? list.map(function (m) { return bubbleHtml(m, S.tab === 'round' && gc > 1); }).join('')
            : '<div class="rc-empty">' + (S.tab === 'group' ? 'Nothing in your group’s chat yet.' : 'Nothing in the round chat yet. Say hi.') + '</div>';
        var place = S.tab === 'group' ? 'Message your group…' : 'Message the round…';
        var wa = WEB;   // the website: text only, signed in or not - no 📸 / 📷 (photos stay in the app)
        return html + '<div class="rc-body" id="rc-log">' + hiddenNote() + body + '</div>'
            + '<div class="rc-foot">' + photoStatusHtml() + '<div class="rc-chips">' + QUICK.map(function (q) { return '<button type="button" class="rc-chip" data-rc-quick="' + esc(q) + '">' + esc(q) + '</button>'; }).join('')
            + (wa ? '' : '<button type="button" class="rc-chip" data-rc="photo" aria-label="Photo">📸</button>') + '</div>'
            + '<div class="rc-in">' + (wa ? '' : '<button type="button" class="rc-cam" data-rc="photo" aria-label="Add a photo">📷</button>')
            + '<input id="rc-input" class="rc-input" type="text" enterkeyhint="send" maxlength="' + maxLen() + '" autocomplete="off" autocapitalize="sentences" aria-label="' + esc(place) + '" placeholder="' + esc(place) + '" data-rc-thread="' + S.tab + '">'
            + '<button type="button" class="rc-send" data-rc="send" aria-label="Send">➤</button></div></div>';
    }
    function feedHtml() {
        var html = headHtml('📰 Round feed', roundTitle() + ' · highlights, posts and photos', { gear: isOwner() });
        var gate = gateHtml();
        if (gate) return html + '<div class="rc-body">' + gate + '</div>';
        var list = visible(listOf(S.msgs.round, S.pending), hidden()), f = feedOf(list), gc = groupCount();
        var comp = photoStatusHtml() + '<div class="rc-fcomp">' + (WEB ? '' : '<button type="button" class="rc-cam" data-rc="photo" aria-label="Add a photo">📸</button>')
            + '<input id="rc-finput" class="rc-input" type="text" enterkeyhint="send" maxlength="' + MAX + '" autocomplete="off" autocapitalize="sentences" aria-label="Post to the feed…" placeholder="Post to the feed…" data-rc-thread="round">'
            + '<button type="button" class="rc-post" data-rc="post">Post</button></div>';
        var cards = f.top.map(function (m) {
            // 2.0.2: a deleted account's post becomes an auto 'left' line (server, accountDelete); the other golfers'
            // replies to it stay visible under it (read-only list; tap one = its own Report / Hide sheet).
            if (m.type === 'auto') { var areps = f.replies[m.id] || [];
                return '<div class="rc-fcard auto" data-rc-auto="' + esc(m.kind || '') + '"><span class="rc-ficon">' + (AUTO_ICON[m.kind] || '⛳') + '</span><div><small>HARDPAN · ' + esc(fmtTime(m.ts)) + '</small><b>' + esc(m.text) + '</b></div></div>'
                    + (areps.length ? '<div class="rc-replies" data-rc-left-replies="' + esc(m.id) + '">' + areps.map(function (r) { return '<button type="button" class="rc-reply" data-rc-msg="' + esc(r.id) + '"><b>' + esc(r.uid === S.uid ? 'You' : nameOf(r)) + '</b> ' + esc(maskWords(r.text || '')) + (r.pending ? ' · Sending…' : '') + '</button>'; }).join('') + '</div>' : ''); }
            var rx = reactionSummary(S.rx[m.id], S.uid), reps = f.replies[m.id] || [], open = !!S.feedOpen[m.id];
            return '<div class="rc-fcard" data-rc-card="' + esc(m.id) + '"><div class="rc-fhead"><span class="rc-av">' + esc(initials(nameOf(m))) + '</span>'
                + '<div class="rc-fname">' + esc(m.uid === S.uid ? 'You' : nameOf(m)) + ' <span>' + (gc > 1 && m.group ? 'G' + esc(m.group) + ' · ' : '') + esc(m.pending ? 'Sending…' : fmtTime(m.ts)) + '</span></div>'
                + '<button type="button" class="rc-more" data-rc-msg="' + esc(m.id) + '" aria-label="More">⋯</button></div>'
                + (m.text ? '<div class="rc-ftext">' + esc(maskWords(m.text)) + '</div>' : '') + photoHtml(m)
                + '<div class="rc-rx">' + rx.map(function (x) { return '<button type="button" class="rc-rxb' + (x.mine ? ' mine' : '') + '" data-rc-react="' + x.k + '" data-rc-id="' + esc(m.id) + '" aria-label="React ' + x.e + '">' + x.e + (x.n ? ' ' + x.n : '') + '</button>'; }).join('')
                + '<button type="button" class="rc-rep" data-rc-replies="' + esc(m.id) + '">💬 ' + (reps.length === 1 ? '1 reply' : reps.length + ' replies') + '</button></div>'
                + (open ? '<div class="rc-replies">' + reps.map(function (r) { return '<button type="button" class="rc-reply" data-rc-msg="' + esc(r.id) + '"><b>' + esc(r.uid === S.uid ? 'You' : nameOf(r)) + '</b> ' + esc(maskWords(r.text || '')) + (r.pending ? ' · Sending…' : '') + '</button>'; }).join('')
                    + '<div class="rc-in"><input class="rc-input" type="text" enterkeyhint="send" maxlength="' + MAX + '" autocomplete="off" aria-label="Reply" placeholder="Reply to ' + esc(nameOf(m)) + '…" data-rc-thread="round" data-rc-reply="' + esc(m.id) + '">'
                    + '<button type="button" class="rc-send" data-rc="reply" data-rc-id="' + esc(m.id) + '" aria-label="Send reply">➤</button></div></div>' : '')
                + '</div>';
        }).join('');
        return html + '<div class="rc-body" id="rc-feed">' + comp + hiddenNote() + (cards || '<div class="rc-empty">No posts yet. HardPan adds birdies, skins and the KP leader here as you play.</div>') + '</div>';
    }
    function settingsHtml() {
        var s = S.settings || {}, on = chatOn(s), auto = s.auto !== false, rep = S.reports || {}, ids = Object.keys(rep);
        var html = headHtml('💬 Chat settings', roundTitle() + ' · organizer', { back: true });
        var rows = '<button type="button" class="rc-srow" data-rc="chat-toggle" role="switch" aria-checked="' + on + '"><i>💬</i><div><b>Round chat</b><span>' + (on ? (WEB ? 'On · golfers in this round' : 'On · signed-in golfers in this round') : 'Off · hidden for everyone, nothing deleted') + '</span></div></button>'
            + '<div class="rc-srow flat"><i>📷</i><div><b>Photos</b><span>' + (WEB ? 'In the HardPan app only' : photosOn() ? 'On · 10 per golfer per round · removed after 30 days' : 'Coming soon · 10 per golfer per round · removed after 30 days') + '</span></div></div>'
            + '<button type="button" class="rc-srow" data-rc="auto-toggle" role="switch" aria-checked="' + auto + '"><i>🤖</i><div><b>Auto-posts</b><span>' + (auto ? 'On · ' : 'Off · ') + 'Birdies · skins · presses · KP leader</span></div></button>'
            + '<div class="rc-srow flat"><i>🔔</i><div><b>Notifications</b><span>Off unless each golfer turns them on · mute per chat</span></div></div>'
            + '<div class="rc-srow flat" data-rc-reports="' + ids.length + '"><i>🚩</i><div><b>Reports (' + (S.reports ? ids.length : '…') + ')</b><span>Reported messages land here for you</span></div></div>'
            + (ids.length ? '<div class="rc-rlist">' + ids.map(function (id) {
                var m = msgById(id), who = Object.keys(rep[id] || {}).length;
                return '<div>' + esc(m ? nameOf(m) + ': ' + String(m.text || 'Photo').slice(0, 60) : 'A removed message') + ' · ' + who + ' report' + (who === 1 ? '' : 's') + (m ? ' · <button type="button" class="rc-rep" data-rc-rm="' + esc(id) + '">Remove</button>' : '') + '</div>';
            }).join('') + '</div>' : '')
            + seatsHtml()
            + (on ? '<button type="button" class="rc-srow red" data-rc="chat-off"><i>⏸️</i><div><b>Turn chat off for this round</b><span>Hides it for everyone; nothing is deleted</span></div></button>'
                : '<button type="button" class="rc-srow" data-rc="chat-on"><i>▶️</i><div><b>Turn chat back on</b><span>Everyone in the chat sees it again</span></div></button>');
        return html + '<div class="rc-body">' + rows + '</div>';
    }
    function actionHtml() {
        var a = S.action; if (!a) return '';
        var m = msgById(a.id); if (!m) { S.action = null; return ''; }
        var me = m.uid === S.uid, nm = nameOf(m), photo = m.type === 'photo';
        if (S.report) {
            return '<div class="rc-asheet" data-rc="asheet-x"><div class="rc-apanel"><h4>Report ' + esc(nm) + '’s ' + (photo ? 'photo' : 'message') + '</h4><div class="rc-asub">Why? It goes to the organizer and HardPan support.</div>'
                + REASONS.map(function (r) { return '<button type="button" class="rc-arow" data-rc-reason="' + esc(r) + '"><i>🚩</i><div><b>' + esc(r) + '</b></div></button>'; }).join('')
                + '<button type="button" class="rc-arow" data-rc="cancel"><i></i><div><b>Cancel</b></div></button></div></div>';
        }
        var rows = '';
        if (!me) rows += '<button type="button" class="rc-arow" data-rc="report"><i>🚩</i><div><b>Report this ' + (photo ? 'photo' : 'message') + '</b><span>Goes to the organizer and HardPan support</span></div></button>'
            + '<button type="button" class="rc-arow" data-rc="hide"><i>🙈</i><div><b>Hide messages from ' + esc(nm) + '</b><span>' + (onAccount() ? 'Block: you stop seeing them on every phone you sign in to' : 'Block: only you stop seeing them (on this phone)') + '</span></div></button>';
        if (canRemove(m, S.uid, ownerUid())) rows += '<button type="button" class="rc-arow red" data-rc="remove"><i>🗑️</i><div><b>Remove for everyone</b><span>Organizer or the sender only</span></div></button>';
        if (!me && isOwner()) rows += '<button type="button" class="rc-arow red" data-rc="ban"><i>🚫</i><div><b>Remove ' + esc(nm) + ' from this chat</b><span>They can’t read or post here again</span></div></button>';
        return '<div class="rc-asheet" data-rc="asheet-x"><div class="rc-apanel"><h4>' + esc(me ? 'Your ' : nm + '’s ') + (photo ? 'photo' : 'message') + '</h4>'
            + '<div class="rc-asub">Only the people in this chat can see it.' + (photo ? ' Photos are deleted 30 days after the round.' : '') + '</div>'
            + rows + '<button type="button" class="rc-arow" data-rc="cancel"><i></i><div><b>Cancel</b></div></button></div></div>';
    }
    function draw() {
        var r = rootEl(), p = r.querySelector('.rc-panel');
        var keep = document.activeElement && r.contains(document.activeElement) && document.activeElement.classList.contains('rc-input') ? { sel: document.activeElement.getAttribute('data-rc-reply') ? '[data-rc-reply="' + document.activeElement.getAttribute('data-rc-reply') + '"]' : '#' + document.activeElement.id, v: document.activeElement.value } : null;
        var log = p.querySelector('#rc-log'), atEnd = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 40, fs = p.querySelector('#rc-feed'), ftop = fs ? fs.scrollTop : 0;
        place(r);
        p.innerHTML = (S.mode === 'feed' ? feedHtml() : S.mode === 'settings' ? settingsHtml() : chatHtml()) + actionHtml();
        var nl = p.querySelector('#rc-log'); if (nl && atEnd) nl.scrollTop = nl.scrollHeight;
        var nf = p.querySelector('#rc-feed'); if (nf) nf.scrollTop = ftop;
        if (keep) { var i = p.querySelector(keep.sel); if (i) { i.value = keep.v; try { i.focus(); } catch (e) { } } }
        fillPhotos(p);
    }

    // ---- OPEN / CLOSE / TAPS -----------------------------------------------------------
    function available() { return !!(code() && (WEB ? webLink() : flowOn())); }   // web: a group link (index.html?game=CODE&group=N)
    function open(mode, tab) {
        if (!available()) return false;
        reattach();
        syncBlocks();
        S.mode = mode || 'chat'; if (tab) S.tab = tab; S.action = null; S.report = null;
        if (S.mode === 'settings') loadReports();
        rootEl().classList.add('open');
        if (PLAYERS) peek();   // the floating 💬 + hint step aside at once (not on the next tick)
        if (S.mode === 'chat') markSeen(S.tab); else if (S.mode === 'feed') markSeen('round');
        draw(); peek();
        return true;
    }
    function close() { var r = document.getElementById('hp-chat'); if (r) r.classList.remove('open'); S.mode = null; S.action = null; S.report = null; peek(); }
    function isOpen() { return !!S.mode; }
    function submit(inp) {
        if (!inp) return;
        var reply = inp.getAttribute('data-rc-reply'), thread = inp.getAttribute('data-rc-thread') || S.tab;
        if (send(thread, inp.value, reply || null)) inp.value = '';
    }
    function onClick(e) {
        var t = e.target, b = t && t.closest ? t.closest('[data-rc],[data-rc-tab],[data-rc-msg],[data-rc-quick],[data-rc-react],[data-rc-replies],[data-rc-reason],[data-rc-rm],[data-rc-join],[data-rc-pick],[data-rc-move],[data-rc-move-yes],[data-rc-move-no],[data-rc-free]') : null;
        if (!b) return;
        var a = b.getAttribute('data-rc');
        if (a === 'asheet-x' && t !== b) return;   // a tap inside the action panel, not on its dim
        if (b.hasAttribute('data-rc-tab')) { S.tab = b.getAttribute('data-rc-tab'); markSeen(S.tab); draw(); return; }
        if (b.hasAttribute('data-rc-quick')) { send(S.tab, b.getAttribute('data-rc-quick')); return; }
        if (b.hasAttribute('data-rc-msg')) { S.action = { id: b.getAttribute('data-rc-msg') }; S.report = null; draw(); return; }
        if (b.hasAttribute('data-rc-react')) { react(b.getAttribute('data-rc-id'), b.getAttribute('data-rc-react')); return; }
        if (b.hasAttribute('data-rc-replies')) { var id = b.getAttribute('data-rc-replies'); S.feedOpen[id] = !S.feedOpen[id]; draw(); return; }
        if (b.hasAttribute('data-rc-reason')) { var aid = S.action && S.action.id; S.action = null; S.report = null; draw(); if (aid) report(aid, b.getAttribute('data-rc-reason')); return; }
        if (b.hasAttribute('data-rc-join')) { if (!b.disabled) webJoin(b.getAttribute('data-rc-join')); return; }
        if (b.hasAttribute('data-rc-pick')) { if (!b.disabled) { S.pick = b.getAttribute('data-rc-pick') || null; draw(); } return; }
        if (b.hasAttribute('data-rc-move')) { S.move = { pid: b.getAttribute('data-rc-move'), ask: true }; draw(); return; }
        if (b.hasAttribute('data-rc-move-yes')) { if (!b.disabled) seatMove(b.getAttribute('data-rc-move-yes')); return; }
        if (b.hasAttribute('data-rc-move-no')) { S.move = null; draw(); return; }
        if (b.hasAttribute('data-rc-free')) { freeSeat(b.getAttribute('data-rc-free')); return; }
        if (b.hasAttribute('data-rc-rm')) { remove(b.getAttribute('data-rc-rm')); setTimeout(loadReports, 300); return; }
        var m = S.action ? msgById(S.action.id) : null;
        switch (a) {
            case 'close': close(); return;
            case 'watch': ls('hardpan_chat_whint_' + S.code, '1'); S.pick = null; close(); return;   // Players link: no chat, nothing written
            case 'back': S.mode = S.prev || 'chat'; draw(); return;
            case 'settings': if (isOwner()) { S.prev = S.mode; S.mode = 'settings'; S.action = null; loadReports(); loadSeats(); draw(); } return;
            case 'signin': signInSheet(); return;
            case 'join': join(); return;
            case 'send': submit(document.getElementById('rc-input')); return;
            case 'post': submit(document.getElementById('rc-finput')); return;
            case 'reply': submit(rootEl().querySelector('[data-rc-reply="' + b.getAttribute('data-rc-id') + '"]')); return;
            case 'photo': pickPhoto(S.mode === 'feed' ? 'round' : S.tab); return;
            case 'photo-retry': { var po = S.photoOut; if (po && po.state === 'failed' && po.file) sendPhoto(po.thread, po.file, po.text); return; }
            case 'unhide': unhideAll(); draw(); return;
            case 'cancel': case 'asheet-x': S.action = null; S.report = null; draw(); return;
            case 'report': S.report = true; draw(); return;
            case 'hide': if (m) hide(m.uid, nameOf(m)); S.action = null; draw(); peek(); return;
            case 'remove': if (m) remove(m.id); S.action = null; draw(); return;
            case 'ban': if (m) ban(m.uid); S.action = null; draw(); return;
            case 'chat-off': setSetting('on', false); return;
            case 'chat-on': setSetting('on', true); return;
            case 'chat-toggle': setSetting('on', !chatOn(S.settings)); return;
            case 'auto-toggle': setSetting('auto', (S.settings || {}).auto === false); return;
        }
    }

    // ---- THE 💬 BUTTON ON THE MAP (ADVISOR-1712, Manny at Chambers Bay: "I don't want anything covering the page
    // like the chat does. Put an icon on the right side. When a new message comes in, a red little dot ... just like
    // iMessage"). The old full-width peek bar is gone. The button sits in the map's right-side column (gps-view.js
    // .gps-ld-rail / .gps-right - the Wind / Green / zoom buttons' own column, its own size and look), last, below
    // zoom. The red badge = new GOLFER messages since you last opened chat (1-9, then 9+; HardPan auto lines count
    // only with chatSettings auto badge on); no badge for "not joined yet" or zero. Opening chat clears it.
    function badgeCount() {
        if (!joined()) return 0;
        var h = hidden(), s = seen(), withAuto = !!(S.settings && S.settings.autoBadge === true);
        var only = function (list) { return visible(listOf(list), h).filter(function (m) { return withAuto || m.type !== 'auto'; }); };
        return unreadCount(only(S.msgs.round), S.uid, s.round) + unreadCount(only(S.msgs.group), S.uid, s.group);
    }
    function badgeText(n) { return n > 9 ? '9+' : String(n); }
    function railEl() { var ov = document.getElementById('gps-overlay'); return ov ? (ov.querySelector('.gps-ld-rail') || ov.querySelector('.gps-right')) : null; }
    // WEB: the same 💬 + red badge, docked in the Round Menu bar's right corner (beside the pill, never over it).
    function webPeek() {
        var bar = PLAYERS ? document.body : document.getElementById('round-sheet');
        playersHint();
        // the 2.0.2 rule (someoneElse below): a golfer with no account is not the organizer, so it always holds for them; only the
        // organizer's own web phone waits for someone else. A Players link is in other golfers' hands by its nature.
        var want = !!(available() && bar && canChat() && (chatOn(S.settings) || isOwner()) && !banned() && !(PLAYERS && S.mode) && (PLAYERS || someoneElse(code())));   // Players link: the floating 💬 steps aside while the sheet is open
        var b = document.getElementById('hp-chat-wbtn');
        if (!want) { if (b) b.style.display = 'none'; return; }
        if (!b) {
            rootEl();
            b = document.createElement('button'); b.type = 'button'; b.id = 'hp-chat-wbtn';
            b.addEventListener('click', function (e) { e.stopPropagation(); open('chat', S.tab); });
        }
        if (b.parentNode !== bar) bar.appendChild(b);
        if (PLAYERS && !b.classList.contains('rc-float')) { b.classList.add('rc-float'); document.body.classList.add('rc-players'); }   // room under the last row for the 💬
        var n = badgeCount();
        var html = '<span class="hp-cb-ico" aria-hidden="true">💬</span>' + (n ? '<span class="hp-cb-badge">' + badgeText(n) + '</span>' : '');
        if (b.innerHTML !== html) b.innerHTML = html;
        b.setAttribute('aria-label', n ? 'Round chat, ' + n + ' new' : 'Round chat');
        b.style.display = '';
    }
    // PLAYERS LINK: a one-time hint beside the 💬 until this phone joins, picks "Just watching" or closes it.
    function playersHint() {
        var h = document.getElementById('hp-chat-whint');
        var want = !!(PLAYERS && available() && canChat() && chatOn(S.settings) && !joined() && !banned() && !S.mode && S.code && ls('hardpan_chat_whint_' + S.code) !== '1');
        if (!want) { if (h) h.style.display = 'none'; return; }
        if (!h) {
            rootEl();
            h = document.createElement('div'); h.id = 'hp-chat-whint'; h.setAttribute('role', 'note');
            h.innerHTML = '<span>Playing in this round? Tap 💬 to chat. Watching only - no scores here.</span><button type="button" aria-label="Dismiss">✕</button>';
            h.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); ls('hardpan_chat_whint_' + S.code, '1'); h.style.display = 'none'; });
            document.body.appendChild(h);
        }
        h.style.display = '';
    }
    // 2.0.2 (Manny): the map's 💬 only when someone else can chat here: 2+ groups, a phone that is not the organizer's
    // (so the organizer is out there), a link shared from this phone, a message, or (organizer's phone) another golfer in
    // the chat or scoring. Solo and single-phone rounds: no 💬; Menu > Chat always works. A phone can't announce itself
    // without a rules change, so a joiner who neither chats nor claims scoring doesn't show on the organizer's phone.
    function someoneElse(c) {
        if (groupCount() > 1 || !ownerUid()) return true;
        if (!uidNow()) return false;   // not known yet: never a flash of 💬 on a solo round
        if (!isOwner()) return true;
        try { if (localStorage.getItem('hardpan_link_shared_' + String(c).toUpperCase()) === '1') return true; } catch (e) { }
        if (Object.keys(S.msgs.round || {}).length || Object.keys(S.msgs.group || {}).length) return true;
        watchOthers(c);
        return !!S.others;
    }
    function watchOthers(c) {
        if (S.othersCode === c || !S.uid) return;
        S.othersCode = c; S.others = false;
        var look = function (v) { if (S.othersCode === c && v && Object.keys(v).some(function (u) { return u !== S.uid; })) { S.others = true; changed(); } };
        S.othersOffs = S.othersOffs || []; detach(S.othersOffs);
        listen('chatMembers/' + c, look, S.othersOffs); listen('scorekeepers/' + c, look, S.othersOffs);
    }
    function peek() {
        if (WEB) { webPeek(); return; }
        var old = document.getElementById('hp-chat-peek'); if (old && old.parentNode) old.parentNode.removeChild(old);   // the old bar, never drawn again
        var c = code(), rail = railEl();
        var want = !!(c && flowOn() && onGps() && rail && chatOn(S.settings) && !banned() && !document.querySelector('#hp-sheet.open') && someoneElse(c));
        var b = document.getElementById('hp-chat-btn');
        if (!want) { if (b) b.style.display = 'none'; return; }
        if (!b) {
            rootEl();   // the chat's styles (the badge's look) are put in with the sheet's root
            b = document.createElement('button'); b.type = 'button'; b.id = 'hp-chat-btn'; b.className = 'hp-chat-btn';
            b.addEventListener('click', function () { open('chat', S.tab); });
        }
        if (b.parentNode !== rail || rail.lastElementChild !== b) rail.appendChild(b);   // last in the column: below zoom
        var n = badgeCount();
        var html = '<span class="hp-cb-ico" aria-hidden="true">💬</span>' + (n ? '<span class="hp-cb-badge">' + badgeText(n) + '</span>' : '');
        if (b.innerHTML !== html) b.innerHTML = html;
        b.setAttribute('aria-label', n ? 'Round chat, ' + n + ' new' : 'Round chat');
        b.style.display = '';
    }

    // ---- BOOT -----------------------------------------------------------------------
    // The card can draw a round from this phone's saved copy after the round was ended: ask the server once, don't say Loading forever.
    function checkGone() {
        if (!WEB || players().length) { S.gone = false; S.goneFor = null; return; }
        if (!S.code || S.goneFor === S.code) return;
        S.goneFor = S.code;
        var r = dbRef('events/' + S.code + '/players'); if (!r) return;
        r.once('value').then(function (v) { S.gone = !(v && v.exists && v.exists()); changed(); }, function () { S.goneFor = null; });
    }
    function tick() {
        if (!appOn()) return;
        try { reattach(); if (S.blocksOpened && Date.now() >= S.blocksNext && Object.keys(localHidden()).length) syncBlocks(); if (S.mode) { place(rootEl()); checkGone(); var sig = players().length + '|' + (S.slots === null ? 0 : 1) + '|' + roundTitle() + '|' + !!S.gone; if (sig !== S.drawSig) { S.drawSig = sig; changed(); } } peek(); } catch (e) { }
    }
    var tickTimer = setInterval(tick, 1000);
    if (tickTimer && typeof tickTimer.unref === 'function') tickTimer.unref();   // a page loaded in node (the vm-based tests) is not kept alive by it
    try { if (W.HardPanAuth && W.HardPanAuth.onChange) W.HardPanAuth.onChange(function () { tick(); changed(); }); } catch (e) { }
    if (W.GolfBack && typeof W.GolfBack.register === 'function') {
        try { W.GolfBack.register({ name: 'hp-chat', priority: 0.5, isOpen: isOpen, close: function () { if (S.action) { S.action = null; S.report = null; draw(); } else close(); } }); } catch (e) { }
    }
    var API = Object.assign({}, PURE, { open: open, close: close, isOpen: isOpen, available: available, reencode: reencode, photosOn: photosOn,
        state: function () { return { code: S.code, uid: S.uid, joined: joined(), mode: S.mode, tab: S.tab, chatOn: chatOn(S.settings), owner: isOwner() }; },
        tileShown: function () { return available() && (chatOn(S.settings) || isOwner()); } });
    W.HardPanChat = API;
})(typeof window !== 'undefined' ? window : this);
