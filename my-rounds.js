// ============================================================================
// 084 - ROUNDS I'M RUNNING (Home, website + GPS app). Manny, Oct 26 2026: "when
// signed in, list rounds I organize (today's first) with an 'Edit setup' button
// that opens setup directly, plus how to get the organizer link."
//
// TWO SOURCES, ONE LIST.
//   (a) THE SERVER: organizers/<uid>/rounds/<CODE> = { at, name, course, day }.
//       Written by remember() after a round is saved by its owner (admin.html's
//       save chain, trip.html's planner batch) and healed from Home when this
//       phone holds a round the signed-in account owns but the server has no
//       pointer for. The rules (database.rules.084-proposed.json) take a
//       pointer ONLY for a round whose ownerUid is that uid, or whose trip that
//       uid owns. Until those rules are published every write here is refused,
//       silently: nothing on the save path waits for it or reports it.
//   (c) THIS PHONE: the rounds this device holds evidence for - a History copy
//       (golfapp_snap_v1_<CODE>, GPS app) whose ownerUid is this session's uid,
//       an organizer token remembered by organizer-gate.js
//       (golfapp_organizer_<CODE>), or lastRoomCode. Shown at once, no signal.
//
// WHAT IS NEVER HERE: the organizer token or the organizer link. Not in a row,
// not in an attribute, not in a pointer. The how-to says where the link lives.
//
// THE BUTTON. "Edit setup" -> admin.html?game=CODE (the wizard opens on Review
// for the owner). It is drawn only for a round the CURRENT uid owns (or one the
// server listed for it); anything else this phone organizes by link gets "Sign in
// to edit", because under the live rules only the owner's sign-in saves setup.
//
// WHICH ROUNDS: today, upcoming, and the last 14 days. Today first, then upcoming
// (soonest first), then the past (newest first). The web shows 1 row + "See all N"
// (its Home is held to one screen); the GPS app 3 rows + "See all N".
// ============================================================================
(function (root) {
    'use strict';
    var DAY = 86400000, PAST_DAYS = 14, LOCAL_MAX = 15;
    var SNAP = 'golfapp_snap_v1_', TOKEN = 'golfapp_organizer_';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function codeOk(c) { return /^[A-Z0-9]{4,10}$/.test(String(c || '')); }
    function midnight(ms) { var d = new Date(Number(ms)); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
    // 'YYYY-MM-DD' (a trip's tee date) -> that local day's midnight; a number stays a number.
    function dayValue(v) {
        if (typeof v === 'number' && v > 0) return v;
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : 0;
    }
    function cut(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) : s; }

    // THE POINTER, from a round's own data. No token, no players, no scores.
    function pointerFor(code, d, opts) {
        d = d || {}; opts = opts || {};
        var course = cut(d.courseName, 80);
        var name = cut(d.eventName, 80);
        if (!name || name === 'Single Round') name = course || ('Round ' + code);
        var p = { at: opts.at != null ? opts.at : Date.now(), name: name };
        if (course) p.course = course;
        var day = dayValue(opts.day) || dayValue(d.teeDate) || Number(d.createdAt) || 0;
        if (day > 0) p.day = midnight(day);
        return p;
    }

    // WHEN: 'today' | 'upcoming' | 'past' | null (older than 14 days, or no day).
    function when(day, now) {
        var t = midnight(now || Date.now()), d = Number(day) > 0 ? midnight(day) : 0;
        if (!d) return null;
        if (d === t) return 'today';
        if (d > t) return 'upcoming';
        return (t - d) <= PAST_DAYS * DAY ? 'past' : null;
    }
    function dayLabel(day, now) {
        var w = when(day, now);
        if (w === 'today') return 'Today';
        var d = new Date(Number(day)), n = new Date(now || Date.now());
        if (midnight(day) === midnight(Number(now || Date.now()) + DAY)) return 'Tomorrow';
        if (midnight(day) === midnight(Number(now || Date.now()) - DAY)) return 'Yesterday';
        var D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return D[d.getDay()] + ' ' + M[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== n.getFullYear() ? ', ' + d.getFullYear() : '');
    }

    // THE LIST: server pointers + this phone's rows, one row per code, inside the
    // window, in order. A server row wins over a phone row for the same code
    // (it is the account's own record); `editable` is OR-ed.
    function rows(serverPointers, localRows, now) {
        now = now || Date.now();
        var by = {};
        Object.keys(serverPointers || {}).forEach(function (code) {
            var p = serverPointers[code];
            if (!codeOk(code) || !p || typeof p !== 'object') return;
            by[code] = { code: code, name: p.name || ('Round ' + code), course: p.course || '', day: Number(p.day) || Number(p.at) || 0, editable: true, server: true };
        });
        (localRows || []).forEach(function (r) {
            if (!r || !codeOk(r.code)) return;
            var have = by[r.code];
            if (have) { have.editable = have.editable || !!r.editable; return; }
            by[r.code] = { code: r.code, name: r.name || ('Round ' + r.code), course: r.course || '', day: Number(r.day) || 0, editable: !!r.editable, server: false };
        });
        var out = Object.keys(by).map(function (k) { var r = by[k]; r.when = when(r.day, now); return r; })
            .filter(function (r) { return r.when; });
        var rank = { today: 0, upcoming: 1, past: 2 };
        out.sort(function (a, b) {
            if (rank[a.when] !== rank[b.when]) return rank[a.when] - rank[b.when];
            if (a.when === 'upcoming') return a.day - b.day || a.code.localeCompare(b.code);
            return b.day - a.day || a.code.localeCompare(b.code);
        });
        return out;
    }

    // THIS PHONE'S ORGANIZER EVIDENCE. Pure over a Storage-like object.
    //   { code, name, course, day, owner, token, needsRead }
    // `owner` comes from a History copy; `token` is only ever true/false here -
    // the token's value is never read out of storage into a row.
    function localEvidence(store) {
        var out = {}, add = function (code) { code = String(code || '').toUpperCase(); if (!codeOk(code)) return null; return out[code] = out[code] || { code: code }; };
        if (!store) return [];
        try {
            for (var i = 0; i < store.length; i++) {
                var k = store.key(i);
                if (!k) continue;
                if (k.indexOf(SNAP) === 0) {
                    var snap = null; try { snap = JSON.parse(store.getItem(k)); } catch (e) { snap = null; }
                    var d = snap && snap.data;
                    if (!d || typeof d !== 'object') continue;
                    var r = add(k.slice(SNAP.length)); if (!r) continue;
                    var p = pointerFor(r.code, d, { at: 0 });
                    r.name = p.name; r.course = p.course || ''; r.day = p.day || (Number(snap.at) ? midnight(snap.at) : 0);
                    r.owner = d.ownerUid ? String(d.ownerUid) : null;
                    r.tripCode = d.tripCode ? String(d.tripCode) : null;
                } else if (k.indexOf(TOKEN) === 0) {
                    var t = add(k.slice(TOKEN.length)); if (t) t.token = true;
                }
            }
            var last = store.getItem('lastRoomCode'); if (last) { var l = add(last); if (l) l.last = true; }
        } catch (e) { /* what was read so far */ }
        return Object.keys(out).map(function (c) { var r = out[c]; r.needsRead = !r.name; return r; }).slice(0, 60);
    }

    // Which of this phone's rounds belong on the card, and with which button.
    //   signed in : only rounds the account owns (Edit setup).
    //   signed out: rounds this session's uid owns (Edit setup - it does save) and
    //               rounds held by organizer link (Sign in to edit).
    function localRows(evidence, uid, signedIn) {
        return (evidence || []).filter(function (r) { return r.name; }).map(function (r) {
            var mine = !!(uid && r.owner && r.owner === uid);
            if (signedIn) return mine ? { code: r.code, name: r.name, course: r.course, day: r.day, editable: true } : null;
            if (mine) return { code: r.code, name: r.name, course: r.course, day: r.day, editable: true };
            if (r.token) return { code: r.code, name: r.name, course: r.course, day: r.day, editable: false };
            return null;
        }).filter(Boolean);
    }

    function setupHref(code) { return 'admin.html?game=' + encodeURIComponent(code); }

    var HOWTO = '<details class="mr-how"><summary>How to get the organizer link</summary>'
        + '<ol><li>On the phone or computer that <b>set the round up</b>, open the round.</li>'
        + '<li>&#9776; Round Menu &rsaquo; <b>Group Links</b>.</li>'
        + '<li><b>&#128273; Organizer Link</b> &rsaquo; <b>Share</b>, to yourself.</li></ol>'
        + '<div class="mr-warn">&#128274; Anyone with that link can open the setup screens. Keep it to yourself. Saving changes still needs you signed in.</div></details>';

    // THE CARD'S HTML. state: { rows, signedIn, email, expanded }, opts: { show: 1|3 }
    function cardHtml(state, opts) {
        var list = state.rows || [], show = state.expanded ? list.length : Math.max(1, (opts && opts.show) || 3);
        if (!list.length) return '';
        var h = '<div class="mr-card" data-mr-card>'
            + '<div class="mr-h">Rounds I&rsquo;m running</div>'
            + '<div class="mr-sub">' + (state.signedIn
                ? (state.email ? 'Signed in as ' + esc(state.email) : 'Signed in') + ' &middot; today first'
                : 'Sign in with the email you set your rounds up with to edit their setup.') + '</div>';
        list.slice(0, show).forEach(function (r) {
            var label = dayLabel(r.day);
            h += '<div class="mr-row" data-mr-code="' + esc(r.code) + '"><div class="mr-i">'
                + '<div class="mr-d' + (r.when === 'today' ? ' mr-today' : '') + '">' + esc(label) + '</div>'
                + '<div class="mr-n">' + esc(r.name) + '</div>'
                + '<div class="mr-s">' + (r.course && r.course !== r.name ? esc(r.course) + ' &middot; ' : '') + '<span class="mr-code">' + esc(r.code) + '</span></div></div>'
                + (r.editable
                    ? '<a class="mr-btn' + (r.when === 'today' ? '' : ' mr-o') + '" href="' + esc(setupHref(r.code)) + '" data-mr-edit="' + esc(r.code) + '">Edit setup</a>'
                    : '<button type="button" class="mr-btn" data-mr-signin>Sign in to edit</button>')
                + '</div>';
        });
        if (list.length > show) h += '<button type="button" class="mr-more" data-mr-more>See all ' + list.length + ' &rsaquo;</button>';
        else if (state.expanded && list.length > ((opts && opts.show) || 3)) h += '<button type="button" class="mr-more" data-mr-less>Show fewer</button>';
        if (!state.signedIn) h += '<button type="button" class="mr-signin" data-mr-signin>Sign in to edit</button>' + HOWTO;
        return h + '</div>';
    }

    var CSS = '.mr-card{box-sizing:border-box;width:100%;padding:12px 14px 8px;border:1px solid var(--mr-line,#d0e1db);border-radius:14px;background:var(--mr-card,#fff);text-align:left;color:var(--mr-text,#1a1a1a)}'
        + '.mr-h{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mr-muted,#555)}'
        + '.mr-sub{font-size:12px;color:var(--mr-muted,#555);margin:2px 0 4px}'
        + '.mr-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--mr-line,#d0e1db)}'
        + '.mr-i{flex:1 1 auto;min-width:0}'
        + '.mr-d{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mr-muted,#555)}'
        + '.mr-d.mr-today{color:var(--mr-green,#0f4c3a)}'
        + '.mr-n{font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
        + '.mr-s{font-size:12px;color:var(--mr-muted,#555);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
        + '.mr-code{font-family:ui-monospace,Menlo,monospace;font-weight:800;letter-spacing:.04em}'
        + '.mr-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:10px;border:2px solid var(--mr-green,#0f4c3a);background:var(--mr-green,#0f4c3a);color:#fff;font:inherit;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;white-space:nowrap}'
        + '.mr-btn.mr-o{background:transparent;color:var(--mr-green,#0f4c3a)}'
        + '.mr-more{display:block;width:100%;min-height:40px;border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:var(--mr-link,#1d3557);text-decoration:underline;cursor:pointer}'
        + '.mr-signin{display:block;width:100%;min-height:44px;margin:6px 0 2px;border:0;border-radius:10px;background:var(--mr-green,#0f4c3a);color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer}'
        + '.mr-how{font-size:12.5px;color:var(--mr-muted,#555);line-height:1.45;padding:4px 0 6px}'
        + '.mr-how summary{font-weight:800;color:var(--mr-link,#1d3557);min-height:32px;line-height:32px;cursor:pointer}'
        + '.mr-how ol{margin:4px 0 6px 18px;padding:0}'
        + '.mr-warn{background:var(--mr-warn-bg,#fbefd9);color:var(--mr-warn,#8a5a00);border-radius:10px;padding:8px 10px;font-size:12px}';

    // ---- THE SERVER SIDE (fire-and-forget; never on a save's critical path) ----
    function serverTime() {
        try { return root.firebase.database.ServerValue.TIMESTAMP; } catch (e) { return Date.now(); }
    }
    // remember(db, uid, code, roundData, opts) -> Promise<boolean>. Never rejects.
    function remember(db, uid, code, data, opts) {
        try {
            code = String(code || '').toUpperCase();
            if (!db || !uid || !codeOk(code)) return Promise.resolve(false);
            var p = pointerFor(code, data, { at: serverTime(), day: opts && opts.day });
            return Promise.resolve(db.ref('organizers/' + uid + '/rounds/' + code).set(p)).then(function () { return true; }, function () { return false; });
        } catch (e) { return Promise.resolve(false); }
    }
    function load(db, uid) {
        if (!db || !uid) return Promise.resolve({});
        return Promise.resolve(db.ref('organizers/' + uid + '/rounds').once('value'))
            .then(function (s) { return (s && s.val && s.val()) || {}; }, function () { return {}; });
    }
    function readRound(db, code) {
        var f = ['ownerUid', 'eventName', 'courseName', 'createdAt', 'tripCode'];
        return Promise.all(f.map(function (k) {
            return Promise.resolve(db.ref('events/' + code + '/' + k).once('value')).then(function (s) { return s.val(); }, function () { return null; });
        })).then(function (v) { var d = {}; f.forEach(function (k, i) { if (v[i] != null) d[k] = v[i]; }); return d; });
    }

    // ---- MOUNT: draws into `box`, re-draws on sign-in changes ------------------
    // env: { db, auth (firebase.auth()), store (localStorage), show (1|3), signIn(), now() }
    function mount(box, env) {
        if (!box || !env) return null;
        var st = { rows: [], signedIn: false, email: null, expanded: false }, gen = 0;
        if (!document.getElementById('mr-css')) {
            var s = document.createElement('style'); s.id = 'mr-css'; s.textContent = CSS; document.head.appendChild(s);
        }
        function paint() {
            var html = cardHtml(st, { show: env.show || 3 });
            box.innerHTML = html;
            box.style.display = html ? '' : 'none';
        }
        box.addEventListener('click', function (e) {
            var t = e.target && e.target.closest ? e.target.closest('[data-mr-more],[data-mr-less],[data-mr-signin]') : null;
            if (!t) return;
            if (t.hasAttribute('data-mr-more')) { st.expanded = true; paint(); }
            else if (t.hasAttribute('data-mr-less')) { st.expanded = false; paint(); }
            else if (typeof env.signIn === 'function') env.signIn();
        });
        function refresh(user) {
            var my = ++gen, now = env.now ? env.now() : Date.now();
            var uid = user && user.uid ? String(user.uid) : null;
            var signedIn = !!(user && !user.isAnonymous && uid);
            st.signedIn = signedIn; st.email = signedIn ? (user.email || null) : null;
            var ev = localEvidence(env.store);
            var local = localRows(ev, uid, signedIn);
            st.rows = rows({}, local, now); paint();          // this phone, at once
            if (!env.db) return;
            // Rounds this phone knows only by code (the website, lastRoomCode): read
            // five small fields each, never the scores.
            var unread = ev.filter(function (r) { return r.needsRead && (r.token || r.last); }).slice(0, LOCAL_MAX);
            var reads = Promise.all(unread.map(function (r) {
                return readRound(env.db, r.code).then(function (d) {
                    if (!d.ownerUid && !d.eventName && !d.courseName) return;   // gone
                    var p = pointerFor(r.code, d, { at: 0 });
                    r.name = p.name; r.course = p.course || ''; r.day = p.day || 0; r.owner = d.ownerUid || null;
                });
            }));
            var server = signedIn ? load(env.db, uid) : Promise.resolve({});
            Promise.all([reads, server]).then(function (res) {
                if (my !== gen) return;
                var ptrs = res[1] || {};
                local = localRows(ev, uid, signedIn);
                var list = rows(ptrs, local, now);
                // A pointer to a round that was deleted (End round - don't save) is
                // hidden, never shown as a dead row.
                var check = list.filter(function (r) { return r.server; });
                return Promise.all(check.map(function (r) {
                    return Promise.resolve(env.db.ref('events/' + r.code + '/ownerUid').once('value')).then(function (s) { return s.exists(); }, function () { return true; });
                })).then(function (alive) {
                    if (my !== gen) return;
                    var dead = {}; check.forEach(function (r, i) { if (!alive[i]) dead[r.code] = true; });
                    st.rows = list.filter(function (r) { return !dead[r.code]; }); paint();
                    // HEAL: a round this account owns that the server does not list yet.
                    if (signedIn) local.forEach(function (r) {
                        if (!ptrs[r.code] && r.editable) {
                            var e = ev.filter(function (x) { return x.code === r.code; })[0] || {};
                            remember(env.db, uid, r.code, { eventName: r.name, courseName: r.course, createdAt: r.day, tripCode: e.tripCode });
                        }
                    });
                });
            }).catch(function () {});
        }
        try {
            if (env.auth && typeof env.auth.onAuthStateChanged === 'function') env.auth.onAuthStateChanged(function (u) { refresh(u); });
            else refresh(env.auth && env.auth.currentUser);
        } catch (e) { refresh(null); }
        return { refresh: refresh, state: st };
    }

    var api = { pointerFor: pointerFor, when: when, dayLabel: dayLabel, rows: rows, localEvidence: localEvidence, localRows: localRows,
        cardHtml: cardHtml, setupHref: setupHref, remember: remember, load: load, mount: mount, CSS: CSS, PAST_DAYS: PAST_DAYS };
    root.HardPanMyRounds = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
