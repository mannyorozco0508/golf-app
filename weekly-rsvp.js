// ============================================================================
// 106 B - THE IN/OUT LINK for the organizer's weekly game (weekly-game.js is A + D).
//
//   B1 The group text: one message with the link hardpangolf.com/rsvp.html?w=<id>.
//   B2 The friend's page (rsvp.html, Safari, no sign-in): tap your name (or "+ Someone new"),
//      big "I'm IN" / "Out", who's in so far. The page signs the visitor in anonymously in
//      the background (auth-boot.js), which is all the rules ask for.
//   B3 The organizer's live list on Home: In / Out / No answer, when each person answered,
//      Nudge, the "Remind no-answers" switch, and "Send the In/Out link".
//
// WHERE IT LIVES. weeklyRsvp/<id> - ONE new public node (outbox/106B-RULES-PROPOSAL.md).
// The id is random (24 characters): the link IS the key, and the node above it cannot be
// listed. The organizer writes the record (ownerUid = his uid); anyone signed in (anonymous
// is fine) writes only answers/<key>: a roster key, or a new person's n<random> key WITH a name.
//   { ownerUid, name, day, time, courseName, weekOf, updatedAt,
//     roster:  { m0: { name }, ... },
//     answers: { m3: { in: true, at }, nab12cd: { in: false, at, name: 'Luis' } } }
// A new week (weekOf moves) clears the answers. No handicaps, no amounts, nothing about money.
//
// REMIND NO-ANSWERS. The evening before (6 PM), when the switch is ON (the default) and
// someone has not answered, Home's card says so with a Nudge button (in-app; there is no
// local-notification plugin in this build - the same choice as A + D's reminder).
//
// Until the rules are published every write here is refused by the server; the page says
// "Could not save" and nothing else breaks.
// ============================================================================
(function (W) {
    'use strict';
    if (!W || !W.document) return;
    var D = W.document;
    var SITE = 'https://hardpangolf.com/';
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function now() { var t = W.__hpWeeklyNow; return t ? new Date(t) : new Date(); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function $(id) { return D.getElementById(id); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function timeText(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); if (!m) return ''; var h = Number(m[1]); return (h % 12 || 12) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM'); }
    function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) {} return null; }
    function dbOf(given) {
        if (given && typeof given.ref === 'function') return given;
        try { if (typeof db !== 'undefined' && db && typeof db.ref === 'function') return db; } catch (e) {}   /* global db */
        try { return W.firebase && W.firebase.database ? W.firebase.database() : null; } catch (e) { return null; }
    }
    function stamp() { try { var S = W.firebase && W.firebase.database && W.firebase.database.ServerValue; if (S && S.TIMESTAMP) return S.TIMESTAMP; } catch (e) {} return Date.now() - 2000; }
    function uidNow() {
        try { var st = W.HardPanAuth && W.HardPanAuth.state ? W.HardPanAuth.state() : null; if (st && st.uid) return Promise.resolve(st.uid); } catch (e) {}
        try { var u = W.firebase && W.firebase.auth && W.firebase.auth().currentUser; if (u && u.uid) return Promise.resolve(u.uid); } catch (e) {}
        return Promise.resolve(W.authReady).then(function (uid) {
            if (uid) return uid;
            try { var u2 = W.firebase.auth().currentUser; return u2 && u2.uid; } catch (e) { return null; }
        }, function () { return null; });
    }

    // ---- shapes (pure) --------------------------------------------------------------------------
    function newId() {
        var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', out = '';
        var b = new Uint8Array(24);
        try { W.crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 24; i++) b[i] = Math.floor(Math.random() * 256); }
        for (var j = 0; j < 24; j++) out += a.charAt(b[j] % 64);
        return out;
    }
    function newPersonKey() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'n'; for (var i = 0; i < 10; i++) s += a.charAt(Math.floor(Math.random() * 36)); return s; }
    function nextGame(rec, t) { t = t || now(); var d = new Date(t.getTime()); d.setDate(d.getDate() + (((Number(rec.day) - t.getDay()) % 7 + 7) % 7)); return d; }
    function weekOf(rec, t) { return ymd(nextGame(rec, t)); }
    function rosterOf(rec) {
        var r = {};
        (rec.golfers || []).slice(0, 999).forEach(function (g, i) { var n = String((g && g.name) || '').trim().slice(0, 40); if (n) r['m' + i] = { name: n }; });
        return r;
    }
    function record(rec, uid, t) {
        var o = { ownerUid: String(uid), name: String(rec.name || 'Weekly Game').slice(0, 60), day: Number(rec.day) || 0, time: /^\d{2}:\d{2}$/.test(rec.time) ? rec.time : '07:30',
            weekOf: weekOf(rec, t), updatedAt: stamp(), roster: rosterOf(rec) };
        if (rec.courseName) o.courseName = String(rec.courseName).slice(0, 120);
        return o;
    }
    function answer(inFlag, name) { var a = { in: !!inFlag, at: stamp() }; if (name) a.name = String(name).trim().slice(0, 40); return a; }
    function link(id) { return SITE + 'rsvp.html?w=' + encodeURIComponent(id); }
    function summary(node) {
        var n = node || {}, roster = n.roster || {}, ans = n.answers || {}, rows = [];
        Object.keys(roster).forEach(function (k) { var a = ans[k]; rows.push({ key: k, name: roster[k].name, ans: a ? !!a.in : null, at: a && typeof a.at === 'number' ? a.at : null }); });
        Object.keys(ans).forEach(function (k) { if (!roster[k] && ans[k] && ans[k].name) rows.push({ key: k, name: ans[k].name, ans: !!ans[k].in, at: typeof ans[k].at === 'number' ? ans[k].at : null, isNew: true }); });
        var c = { in: 0, out: 0, none: 0 };
        rows.forEach(function (r) { if (r.ans === true) c.in++; else if (r.ans === false) c.out++; else c.none++; });
        return { rows: rows, in: c.in, out: c.out, none: c.none, total: rows.length };
    }
    function whenText(ms) { if (typeof ms !== 'number') return ''; var d = new Date(ms); var h = d.getHours(); return SHORT[d.getDay()] + ' ' + (h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
    function headline(n) { var d = nextGame({ day: n.day }); return SHORT[n.day] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ' · ' + timeText(n.time) + (n.courseName ? ' · ' + n.courseName : ''); }

    // ---- the organizer: make / refresh this week's node --------------------------------------------
    function ensure(rec, given) {
        var d = dbOf(given), Wk = W.HardPanWeekly;
        if (!d || !rec) return Promise.resolve(null);
        return uidNow().then(function (uid) {
            if (!uid) return null;
            var id = rec.rsvpId || newId();
            var ref = d.ref('weeklyRsvp/' + id);
            return ref.once('value').then(function (s) {
                var cur = s && s.val ? s.val() : null;
                var want = record(rec, uid, now());
                if (cur && cur.weekOf === want.weekOf) {
                    // Same week: keep the answers; refresh the name / time / roster the organizer may have edited.
                    return ref.update({ name: want.name, day: want.day, time: want.time, roster: want.roster, updatedAt: want.updatedAt }).then(function () { return id; });
                }
                // A new link, or a new week: the record without last week's answers.
                return ref.set(want).then(function () { return id; });
            }).then(function (okId) {
                if (okId && rec.rsvpId !== okId && Wk) { rec.rsvpId = okId; var r = Wk.get(rec.id); if (r) { r.rsvpId = okId; Wk.put(r); } }
                return okId;
            });
        }).catch(function (e) { try { console.warn('[rsvp] not saved', e && e.message); } catch (x) {} return null; });
    }
    // 106d: DELETE the weekly game -> its In/Out link ends (the owner deletes the node; the published rules allow
    // it). A friend's page then says "Link has ended". Resolves either way; a failure is said in the console only.
    function remove(rec, given) {
        var d = dbOf(given);
        if (!d || !rec || !rec.rsvpId) return Promise.resolve(false);
        return d.ref('weeklyRsvp/' + rec.rsvpId).remove().then(function () { return true; }, function (e) { try { console.warn('[rsvp] not removed', e && e.message); } catch (x) {} return false; });
    }
    function inviteText(rec, id) {
        var d = nextGame(rec);
        return rec.name + ' · ' + SHORT[rec.day] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ' · ' + timeText(rec.time) + (rec.courseName ? ' · ' + rec.courseName : '')
            + '\nTap to say In or Out: ' + link(id);
    }

    // ---- B3: the organizer's live list -------------------------------------------------------------
    var LIVE = { off: null };
    function stopLive() { if (LIVE.off) { try { LIVE.off(); } catch (e) {} LIVE.off = null; } }
    function openList(rec, given) {
        var Wk = W.HardPanWeekly, ui = Wk && Wk._ui;
        if (!ui) return;
        stopLive();
        var paint = function (node, id) {
            var s = summary(node || { roster: rosterOf(rec) });
            var rows = s.rows.map(function (r) {
                var st = r.ans === true ? '<span class="hpw-chip" style="background:#d4f46a;color:#0f4c3a;">IN</span>' : r.ans === false ? '<span class="hpw-chip" style="background:#f6d6d6;color:#8a1c1c;">OUT</span>' : '<span class="hpw-chip">No answer</span>';
                return '<div class="hpw-row" data-rv-row="' + esc(r.key) + '"><span class="m"><div class="t">' + esc(r.name) + (r.isNew ? ' <span class="s">(new)</span>' : '') + '</div><div class="s">' + (r.at ? 'Answered ' + esc(whenText(r.at)) : ' ') + '</div></span>' + st
                    + (r.ans !== true && id ? '<button type="button" class="hpw-chg" data-rv="nudge" data-rv-name="' + esc(r.name) + '">Nudge</button>' : '') + '</div>';
            }).join('');
            var body = '<div class="hpw-top"><button type="button" class="hpw-back" data-rv="close">‹ Home</button><span class="hpw-step">Live</span></div>'
                + '<div class="hpw-h1">Who’s in · ' + esc(rec.name) + '</div>'
                + '<p class="hpw-p">' + esc(headline({ day: rec.day, time: rec.time, courseName: rec.courseName })) + '</p>'
                + '<div class="hpw-list" style="display:flex;text-align:center;" data-rv-counts><div style="flex:1;padding:10px;"><div class="hpw-h1" style="margin:0;">' + s.in + '</div><div class="s">In</div></div>'
                + '<div style="flex:1;padding:10px;"><div class="hpw-h1" style="margin:0;">' + s.out + '</div><div class="s">Out</div></div>'
                + '<div style="flex:1;padding:10px;"><div class="hpw-h1" style="margin:0;">' + s.none + '</div><div class="s">No answer</div></div></div>'
                + '<div class="hpw-sec">Your regulars</div><div class="hpw-list">' + (rows || '<div class="hpw-row"><span class="m s">Add golfers to the weekly game to see them here.</span></div>') + '</div>'
                + '<div class="hpw-list" style="margin-top:12px;"><div class="hpw-row"><span class="m"><div class="t">Remind no-answers</div><div class="s">' + DAYS[(Number(rec.day) + 6) % 7] + ' 6:00 PM — a reminder for you on Home</div></span>'
                + '<button type="button" class="hpw-sw" role="switch" data-rv="remind" aria-checked="' + (rec.remindNoAnswers !== false ? 'true' : 'false') + '" aria-label="Remind no-answers"></button></div></div>'
                + '<div class="hpw-note" id="rv-msg" role="status"></div>';
            var foot = '<button type="button" class="hpw-btn lime" data-rv="send">💬 Send the In/Out link</button>'
                + '<div class="hpw-note">' + (id ? esc(link(id).replace(/^https:\/\//, '')) : 'The link is made when you send it.') + '</div>';
            var el = ui.overlay('whosin', body, foot);
            el.setAttribute('data-rv-in', String(s.in)); el.setAttribute('data-rv-none', String(s.none));
            el.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-rv]') : null;
                if (!b) return;
                var a = b.getAttribute('data-rv');
                if (a === 'close') { stopLive(); ui.close(); if (Wk.mountHome) Wk.mountHome(); return; }
                if (a === 'remind') { var v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); var r0 = Wk.get(rec.id); if (r0) { r0.remindNoAnswers = v; Wk.put(r0); } rec.remindNoAnswers = v; return; }
                if (a === 'send') { sendLink(rec, given); return; }
                if (a === 'nudge') { var nm = b.getAttribute('data-rv-name'); ensure(rec, given).then(function (id2) { if (id2) ui.share(String(nm).split(' ')[0] + ', are you in? ' + inviteText(rec, id2), rec.name); }); return; }
            });
        };
        paint(null, rec.rsvpId || null);
        var d = dbOf(given);
        if (!d || !rec.rsvpId) return;
        var ref = d.ref('weeklyRsvp/' + rec.rsvpId);
        var cb = function (snap) { var v = snap && snap.val ? snap.val() : null; if ($('hpw-ov') && $('hpw-ov').getAttribute('data-hpw-screen') === 'whosin') paint(v, rec.rsvpId); };
        try { ref.on('value', cb); LIVE.off = function () { ref.off('value', cb); }; } catch (e) {}
    }
    function sendLink(rec, given) {
        var Wk = W.HardPanWeekly, ui = Wk && Wk._ui;
        var msg = function (t) { var m = $('rv-msg') || $('hpw-share-msg'); if (m) m.textContent = t; };
        msg('Making the link…');
        return ensure(rec, given).then(function (id) {
            if (!id) { msg('Could not make the link just now (no signal?). Try again.'); return null; }
            msg('');
            if (ui) ui.share(inviteText(rec, id), rec.name);
            var cur = $('hpw-ov'); if (cur && cur.getAttribute('data-hpw-screen') === 'whosin' && !LIVE.off) openList(Wk.get(rec.id) || rec, given);
            return id;
        });
    }

    // ---- Home card extras: "N of M said In" and the no-answers reminder ----------------------------
    function decorate(box, c, given) {
        if (!box || !c || !c.rec || !c.rec.rsvpId || c.kind === 'week' || c.kind === 'nudge' || c.kind === 'skipped') return;   // 106d: not on a skipped week's line
        var rec = c.rec, d = dbOf(given);
        if (!d) return;
        d.ref('weeklyRsvp/' + rec.rsvpId).once('value').then(function (s) {
            var n = s && s.val ? s.val() : null;
            if (!n || n.weekOf !== weekOf(rec)) return;
            var sm = summary(n), card = box.querySelector('[data-hpw-card]');
            if (!card || card.querySelector('[data-rv-line]')) return;
            var t = now(), eve = (((Number(rec.day) - t.getDay()) % 7 + 7) % 7) === 1 && t.getHours() >= 18;
            var line = D.createElement('div');
            line.setAttribute('data-rv-line', '1'); line.className = 's'; line.style.marginTop = '8px';
            // 106e: nobody invited yet -> no "0 of 0 said In"; the way to invite instead.
            if (!sm.total) { line.innerHTML = '<button type="button" data-hpw="text-group" data-hpw-id="' + esc(rec.id) + '" data-rv-send style="border:0;background:#d4f46a;color:#0f4c3a;border-radius:999px;font-weight:800;min-height:40px;padding:0 14px;font-size:14px;">\uD83D\uDCAC Send the In/Out link</button>'; card.insertBefore(line, card.querySelector('.hpw-btn') || null); return; }
            line.innerHTML = '<b>' + sm.in + ' of ' + sm.total + '</b> said In'
                + (eve && rec.remindNoAnswers !== false && sm.none > 0 ? ' · <b data-rv-remind>' + sm.none + ' haven’t answered</b> <button type="button" data-hpw="whos-in" data-hpw-id="' + esc(rec.id) + '" style="border:0;background:#d4f46a;color:#0f4c3a;border-radius:999px;font-weight:800;min-height:36px;padding:0 12px;margin-left:6px;">Nudge them</button>' : '');
            var anchor = card.querySelector('.hpw-btn');
            card.insertBefore(line, anchor || null);
        }, function () {});
    }

    // ---- B2: the friend's page (rsvp.html) ---------------------------------------------------------
    function page(given) {
        var root = $('rv-app');
        if (!root) return;
        var id = null; try { id = new URLSearchParams(W.location.search).get('w'); } catch (e) { id = null; }
        var d = dbOf(given);
        if (!id || !/^[A-Za-z0-9_-]{20,40}$/.test(id) || !d) { root.innerHTML = '<div class="rv-card"><h1>Link not right</h1><p>Ask the organizer to send it again.</p></div>'; root.setAttribute('data-rv-state', 'bad'); return; }
        var ME = 'hardpan_rsvp_me_' + id, node = null, picking = false, adding = false, saving = '';
        var me = function () { var v = null; try { v = JSON.parse(ls(ME) || 'null'); } catch (e) { v = null; } return v && v.key ? v : null; };
        var draw = function () {
            if (!node) { root.innerHTML = '<div class="rv-card"><h1>Link has ended</h1><p>This week’s link is not open. Ask the organizer for a new one.</p></div>'; root.setAttribute('data-rv-state', 'gone'); return; }
            var s = summary(node), m = me(), row = m ? s.rows.filter(function (r) { return r.key === m.key; })[0] : null;
            var h = '<div class="rv-card"><div class="rv-k">🏆 ' + esc(String(node.name).toUpperCase()) + '</div><h1>' + esc(headline(node)) + '</h1>'
                + '<div class="rv-so" data-rv-so>' + s.in + ' in so far</div></div>';
            if (!m || picking) {
                h += '<div class="rv-sec">Tap your name</div><div class="rv-names">' + s.rows.filter(function (r) { return !r.isNew; }).map(function (r) { return '<button type="button" data-rv-pick="' + esc(r.key) + '">' + esc(r.name) + '</button>'; }).join('')
                    + '<button type="button" data-rv-act="new" class="rv-new">+ Someone new</button></div>';
                if (adding) h += '<div class="rv-add"><input id="rv-new-name" maxlength="40" placeholder="Your name" aria-label="Your name" autocomplete="name"><button type="button" data-rv-act="addok">OK</button></div>';
                root.setAttribute('data-rv-state', 'pick');
            } else {
                var nm = row ? row.name : m.name;
                h += '<div class="rv-hi">Hi ' + esc(String(nm || '').split(' ')[0]) + '! <button type="button" data-rv-act="notme" class="rv-link">Not you?</button></div>'
                    + '<div class="rv-big"><button type="button" data-rv-ans="in" class="rv-in" aria-pressed="' + (row && row.ans === true ? 'true' : 'false') + '">I’m IN</button>'
                    + '<button type="button" data-rv-ans="out" class="rv-out" aria-pressed="' + (row && row.ans === false ? 'true' : 'false') + '">Out</button></div>'
                    + '<div class="rv-msg" role="status" data-rv-msg>' + esc(saving || (row && row.ans === true ? 'You’re IN. See you there.' : row && row.ans === false ? 'You’re out this week.' : '')) + '</div>';
                root.setAttribute('data-rv-state', 'answer');
            }
            var ins = s.rows.filter(function (r) { return r.ans === true; }).map(function (r) { return esc(r.name); });
            h += '<div class="rv-sec">Who’s in</div><div class="rv-who" data-rv-who>' + (ins.length ? ins.join(' · ') : 'Nobody yet') + '</div>'
                + '<div class="rv-foot">HardPan Golf · no account needed</div>';
            root.innerHTML = h;
        };
        var save = function (key, inFlag, name) {
            saving = 'Saving…'; draw();
            return uidNow().then(function (uid) {
                if (!uid) throw new Error('no-auth');
                return d.ref('weeklyRsvp/' + id + '/answers/' + key).set(answer(inFlag, name));
            }).then(function () { saving = ''; draw(); }, function () { saving = 'Could not save — check your signal and tap again.'; draw(); });
        };
        root.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-rv-pick],[data-rv-act],[data-rv-ans]') : null;
            if (!b) return;
            if (b.hasAttribute('data-rv-pick')) { var k = b.getAttribute('data-rv-pick'); var r = summary(node).rows.filter(function (x) { return x.key === k; })[0]; ls(ME, JSON.stringify({ key: k, name: r ? r.name : '' })); picking = false; adding = false; draw(); return; }
            var a = b.getAttribute('data-rv-act');
            if (a === 'new') { adding = true; draw(); var i = $('rv-new-name'); if (i && i.focus) i.focus(); return; }
            if (a === 'addok') { var i2 = $('rv-new-name'); var nm = i2 ? String(i2.value || '').trim().slice(0, 40) : ''; if (!nm) return; ls(ME, JSON.stringify({ key: newPersonKey(), name: nm, isNew: true })); picking = false; adding = false; draw(); return; }
            if (a === 'notme') { picking = true; draw(); return; }
            if (b.hasAttribute('data-rv-ans')) { var m = me(); if (!m) return; save(m.key, b.getAttribute('data-rv-ans') === 'in', m.isNew ? m.name : null); return; }
        });
        root.setAttribute('data-rv-state', 'loading');
        try { d.ref('weeklyRsvp/' + id).on('value', function (s) { node = s && s.val ? s.val() : null; draw(); }, function () { node = null; draw(); }); } catch (e) { node = null; draw(); }
    }

    W.HardPanRsvp = { newId: newId, weekOf: weekOf, rosterOf: rosterOf, record: record, answer: answer, link: link, summary: summary, ensure: ensure, remove: remove,
        inviteText: inviteText, openList: openList, sendLink: sendLink, decorate: decorate, page: page, newPersonKey: newPersonKey, SITE: SITE };
    if ($('rv-app')) {
        if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { page(); }); else setTimeout(function () { page(); }, 0);
    }
})(typeof window !== 'undefined' ? window : null);
