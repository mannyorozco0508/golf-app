// ============================================================================
// HARDPAN - AN OFFLINE GAME DAY START (069 C, Manny 2026-10-25 7:19 AM: "build it exactly as the 10
// preview pictures show"; two phones = two rounds + "Open theirs", never merged; the create-only check
// is a TRANSACTION in the app - NO database rules change).
//
// WHY. A new round needs a code checked against the server (code-issuer.js). With no signal there was
// no code, so Game Day said "No signal ... nothing was saved" and nothing opened. Now Game Day offers an
// OFFLINE ROUND: a LOCAL code, "L-" + 10 characters of the issuer's alphabet. It has a "-", so it can
// never be a real 6-character code, and it never leaves the phone.
//
// THE ROUND LIVES ON THE PHONE, IN WHAT IS ALREADY THERE (URGENT-009):
//   setup        Round Setup's Save holds it (front-door.js holdRound: the durable queue + the stored
//                copy + Resume), and goes to the scorecard - no network write at all.
//   scoring      the scorecard's durableWrite queues every score behind the held round (hpRoundHeld).
//   app killed   nothing lost: the queue and the copy are in localStorage; Resume opens the copy.
//
// AND NOTHING OF IT REACHES THE DATABASE UNDER ITS LOCAL CODE. THE FIREWALL below wraps
// firebase.database(): any ref whose path has an L- code in it answers READS from this phone's copy and
// never sends a WRITE (it stays pending, exactly like a write with no signal - the queue keeps it).
//
// SIGNAL BACK (sync, run from front-door.js sendHeld - Home and the scorecard, on the socket / online
// event and every 20 s while anything is held):
//   1. the organizer gate (organizer-gate.js ensureOrganizer) - the same first write every round needs;
//   2. the round + every score queued on it, as ONE record, written by a CREATE-ONLY TRANSACTION:
//      events/<code>.transaction(cur => cur === null ? round : undefined). Nothing is overwritten, ever.
//   3. which code: first the GROUP's code (a hash of today, the course and the golfers - so two phones
//      that started the same group offline try the SAME code first), then fresh random codes.
//        committed                          -> this phone's round, synced;
//        taken, offlineStart.from === mine  -> mine already (an earlier try that landed late): adopted;
//        taken, the same group (key)        -> THEIRS: remembered for "Open theirs", next code;
//        taken, anything else               -> a CLASH: next code ("drawing another").
//      A transaction that does not answer in 15 s stops this try (it may still land - the codes tried
//      are kept and asked first next time, so a late landing is adopted, never duplicated).
//   4. on this phone the round MOVES to its code: the queue (anything typed meanwhile is re-pathed), the
//      stored copy, Resume, the last-round pointers. Open pages on the L- code move to the real one.
// Scores are NEVER merged between two rounds.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var D = W.document;
    var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var LOCAL_RE = /^L-[A-HJ-NP-Z2-9]{10}$/;
    var SYNCED = 'hardpan_offline_synced_v1';   // { L-code: { code, at, holes, theirs } }
    var TRIED = 'hardpan_offline_tried_v1';     // { L-code: [codes whose transaction did not answer] }
    var SHOW = 'hardpan_offline_show_v1';       // sessionStorage: the "synced" banner still to show
    var WQ = 'golfapp_wq_v1', SNAP = 'golfapp_snap_v1_', HELD = 'round-setup:', HELD_META = 'hardpan_held_rounds_v1';
    var TX_MS = 15000, DRAWS = 5;

    function ls(k, v) {
        try {
            if (v === undefined) return W.localStorage.getItem(k);
            if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v);
        } catch (e) { return null; }
        return null;
    }
    function ss(k, v) {
        try {
            if (v === undefined) return W.sessionStorage.getItem(k);
            if (v === null) W.sessionStorage.removeItem(k); else W.sessionStorage.setItem(k, v);
        } catch (e) { return null; }
        return null;
    }
    function jget(k, def) { try { var v = JSON.parse(ls(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function isLocal(code) { return LOCAL_RE.test(String(code || '').toUpperCase()); }
    function localIn(path) {
        var segs = String(path == null ? '' : path).split('/');
        for (var i = 0; i < segs.length; i++) if (isLocal(segs[i])) return segs[i].toUpperCase();
        return null;
    }
    function rand(n) {
        var out = '', g = W.crypto || W.msCrypto;
        while (out.length < n) {
            var b;
            if (g && typeof g.getRandomValues === 'function') { var a = new Uint8Array(1); g.getRandomValues(a); b = a[0]; } else b = Math.floor(Math.random() * 256);
            if (b >= 256 - (256 % ALPHABET.length)) continue;
            out += ALPHABET.charAt(b % ALPHABET.length);
        }
        return out;
    }
    function newCode() { return 'L-' + rand(10); }

    // ---- THIS PHONE'S COPY OF A LOCAL ROUND --------------------------------------------------
    function Q() { return W.OfflineQueue || null; }
    function store() { try { return W.localStorage; } catch (e) { return null; } }
    function queue() { var q = Q(), s = store(); if (!q || !s) return []; try { return q.peek(s) || []; } catch (e) { return []; } }
    function opsFor(code) {
        var p = 'events/' + code;
        return queue().filter(function (o) { var x = String(o && o.path || ''); return x === p || x.indexOf(p + '/') === 0; });
    }
    function heldOp(code) { var k = HELD + code; return queue().filter(function (o) { return o && o.coalesceKey === k; })[0] || null; }
    function localData(code) {
        var q = Q(), s = store();
        if (!q || !s) return null;
        var snap = null; try { snap = q.loadSnapshot(s, code); } catch (e) { snap = null; }
        var base = (snap && snap.data) || null;
        var ops = opsFor(code);
        if (!base && !ops.length) return null;
        try { return q.applyQueued(base || {}, ops, code); } catch (e) { return base; }
    }
    function holesOf(data) {
        var h = {};
        Object.keys((data && data.scores) || {}).forEach(function (k) { var m = /_h(\d+)$/.exec(k); if (m && Number(data.scores[k]) > 0) h[m[1]] = 1; });
        return Object.keys(h).length;
    }

    // ---- THE FIREWALL ------------------------------------------------------------------------
    var blocked = 0;
    function pending() { blocked++; return new Promise(function () {}); }
    function snapOf(path, value) {
        var segs = String(path).split('/').filter(Boolean);
        return {
            key: segs.length ? segs[segs.length - 1] : null,
            val: function () { return value == null ? null : JSON.parse(JSON.stringify(value)); },
            exists: function () { return value != null; },
            hasChild: function (c) { return !!(value && typeof value === 'object' && value[c] != null); },
            hasChildren: function () { return !!(value && typeof value === 'object' && Object.keys(value).length); },
            numChildren: function () { return value && typeof value === 'object' ? Object.keys(value).length : 0; },
            child: function (c) { var v = value; String(c).split('/').filter(Boolean).forEach(function (k) { v = v && typeof v === 'object' ? v[k] : undefined; }); return snapOf(path + '/' + c, v === undefined ? null : v); },
            forEach: function (fn) { if (!value || typeof value !== 'object') return false; return Object.keys(value).some(function (k) { return fn(snapOf(path + '/' + k, value[k])) === true; }); },
            toJSON: function () { return value == null ? null : value; }
        };
    }
    function localValue(path) {
        var code = localIn(path);
        var segs = String(path).split('/').filter(Boolean);
        var at = segs.indexOf(code);
        if (at < 0) { for (var i = 0; i < segs.length; i++) if (segs[i].toUpperCase() === code) at = i; }
        // Only events/<L-code>/... is a round; anything else under a local code has nothing.
        if (segs[at - 1] !== 'events') return null;
        var v = localData(code);
        for (var j = at + 1; j < segs.length && v != null; j++) v = typeof v === 'object' ? v[segs[j]] : undefined;
        return v === undefined ? null : v;
    }
    function localRef(path) {
        var self = {
            key: String(path).split('/').filter(Boolean).pop() || null,
            toString: function () { return 'local:' + path; },
            child: function (c) { return localRef(path + '/' + c); },
            set: pending, update: pending, remove: pending, setWithPriority: pending, setPriority: pending, transaction: pending,
            push: function () { var p = pending(), r = localRef(path + '/L' + rand(8)); r.then = p.then.bind(p); r.catch = p.catch.bind(p); return r; },
            once: function (ev, cb) { var s = snapOf(path, localValue(path)); if (typeof cb === 'function') setTimeout(function () { try { cb(s); } catch (e) {} }, 0); return Promise.resolve(s); },
            on: function (ev, cb) { if ((ev === 'value' || ev == null) && typeof cb === 'function') setTimeout(function () { try { cb(snapOf(path, localValue(path))); } catch (e) {} }, 0); return cb; },
            off: function () {},
            onDisconnect: function () { return { set: pending, update: pending, remove: pending, cancel: pending }; },
            orderByChild: function () { return self; }, orderByKey: function () { return self; }, orderByValue: function () { return self; },
            limitToFirst: function () { return self; }, limitToLast: function () { return self; },
            startAt: function () { return self; }, endAt: function () { return self; }, equalTo: function () { return self; }
        };
        return self;
    }
    function hasLocalKey(obj) { try { return Object.keys(obj || {}).some(function (k) { return !!localIn(k); }); } catch (e) { return false; } }
    function guardRef(r, path) {
        var p = String(path || '').replace(/^\/+|\/+$/g, '');
        if (!r || (p !== '' && p !== 'events')) return r;
        var g = Object.create(r);
        g.child = function (c) { var full = (p ? p + '/' : '') + c; if (localIn(full)) return localRef(full); return guardRef(r.child(c), full); };
        if (p === '') g.update = function (v) { if (hasLocalKey(v)) return pending(); return r.update.apply(r, arguments); };
        return g;
    }
    function guardDb(d) {
        if (!d || typeof d.ref !== 'function' || d.__hpOfflineGuard) return d;
        var g = Object.create(d);
        g.__hpOfflineGuard = true;
        g.ref = function (path) {
            if (localIn(path)) return localRef(String(path));
            return guardRef(d.ref.apply(d, arguments), path == null ? '' : path);
        };
        return g;
    }
    function installFirewall() {
        var fb = W.firebase;
        if (!fb || typeof fb.database !== 'function' || fb.database.__hpOfflineGuard) return false;
        var real = fb.database, cache = [];
        var wrapped = function () {
            var d = real.apply(this, arguments);
            for (var i = 0; i < cache.length; i++) if (cache[i][0] === d) return cache[i][1];
            var g = guardDb(d); cache.push([d, g]); return g;
        };
        Object.keys(real).forEach(function (k) { try { wrapped[k] = real[k]; } catch (e) {} });
        ['ServerValue', 'Reference', 'Query', 'DataSnapshot', 'enableLogging'].forEach(function (k) { if (real[k] !== undefined && wrapped[k] === undefined) wrapped[k] = real[k]; });
        wrapped.__hpOfflineGuard = true;
        fb.database = wrapped;
        return true;
    }

    // ---- SYNC: THE CREATE-ONLY TRANSACTION -------------------------------------------------------
    function hash32(s, seed) { var h = seed >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
    function day(t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function names(v) { return ((v && v.players) || []).map(function (p) { return String((p && p.name) || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\.$/, ''); }).filter(Boolean).sort(); }
    function groupKey(v, at) { return day(at) + '|' + String((v && (v.activeCourseKey || v.courseName)) || '').toLowerCase() + '|' + names(v).join(','); }
    function keyCode(key) {
        var a = hash32(key, 2166136261), b = hash32(key, 0x9e3779b9), out = '';
        for (var i = 0; i < 6; i++) { var x = i < 3 ? a : b; out += ALPHABET.charAt((x >>> ((i % 3) * 5)) & 31); }
        return out;
    }
    function draw() { return typeof W.generateCode === 'function' ? W.generateCode() : rand(6); }
    function within(p, ms, what) {
        return new Promise(function (res, rej) {
            var t = setTimeout(function () { var e = new Error(what + ' did not answer within ' + ms + 'ms'); e.code = 'timeout'; rej(e); }, ms);
            Promise.resolve(p).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
        });
    }
    function emit(name, detail) { try { W.dispatchEvent(new W.CustomEvent(name, { detail: detail })); } catch (e) {} }
    function meName() { try { return W.HardPanDoors && typeof W.HardPanDoors.meName === 'function' ? W.HardPanDoors.meName() : null; } catch (e) { return null; } }
    function localCodes() {
        var out = [];
        queue().forEach(function (o) { if (o && typeof o.coalesceKey === 'string' && o.coalesceKey.indexOf(HELD) === 0) { var c = o.coalesceKey.slice(HELD.length); if (isLocal(c) && out.indexOf(c) < 0) out.push(c); } });
        return out;
    }
    function hasLocal() { return localCodes().length > 0; }
    function isLocalPath(path) { return !!localIn(path); }

    // THE ROUND MOVES TO ITS CODE ON THIS PHONE.
    function move(L, code, value, sentOps, theirs) {
        var q = Q(), s = store();
        var sentIds = {}; sentOps.forEach(function (o) { sentIds[o.id + '|' + o.v] = 1; });
        // The queue: what went up inside the round leaves; anything typed meanwhile follows the round.
        var all = []; try { all = JSON.parse(ls(WQ) || '[]') || []; } catch (e) { all = []; }
        var from = 'events/' + L, to = 'events/' + code;
        var kept = [];
        all.forEach(function (o) {
            var p = String(o && o.path || '');
            if (!(p === from || p.indexOf(from + '/') === 0)) { kept.push(o); return; }
            if (sentIds[o.id + '|' + o.v] || (o.coalesceKey === HELD + L)) return;   // in the round now
            o.path = to + p.slice(from.length);
            if (typeof o.coalesceKey === 'string') o.coalesceKey = o.coalesceKey.split(L).join(code);
            kept.push(o);
        });
        ls(WQ, JSON.stringify(kept));
        // The stored copy (what Resume and an offline scorecard open), under the real code.
        var old = null; try { old = q && s ? q.loadSnapshot(s, L) : null; } catch (e) { old = null; }
        try { if (q && s) q.saveSnapshot(s, code, value, (old && old.meta) || null); } catch (e) {}
        ls(SNAP + L, null);
        var hm = jget(HELD_META, {}); if (hm[L]) { delete hm[L]; ls(HELD_META, JSON.stringify(hm)); }
        // Every pointer at the local code.
        if (String(ls('lastRoomCode') || '').toUpperCase() === L) ls('lastRoomCode', code);
        var lr = jget('hardpan_last_round', null); if (lr && String(lr.code || '').toUpperCase() === L) { lr.code = code; ls('hardpan_last_round', JSON.stringify(lr)); }
        if (ls('hardpan_round_side') === 'gps|' + L) ls('hardpan_round_side', 'gps|' + code);
        try {
            var keys = []; for (var i = 0; i < W.localStorage.length; i++) keys.push(W.localStorage.key(i));
            keys.forEach(function (k) {
                if (!k || k.indexOf(L) < 0 || k === SNAP + L || k === SYNCED || k === TRIED) return;
                var v = ls(k); var nk = k.split(L).join(code);
                if (ls(nk) == null) ls(nk, String(v).split(L).join(code));
                ls(k, null);
            });
            ['hardpan_saved_rounds_v1', 'hardpan_recent_rounds_v1'].forEach(function (k) { var v = ls(k); if (v && v.indexOf(L) >= 0) ls(k, v.split(L).join(code)); });
        } catch (e) {}
        var holes = holesOf(value);
        var done = jget(SYNCED, {}); done[L] = { code: code, at: Date.now(), holes: holes, theirs: theirs || null }; ls(SYNCED, JSON.stringify(done));
        var tried = jget(TRIED, {}); if (tried[L]) { delete tried[L]; ls(TRIED, JSON.stringify(tried)); }
        return { from: L, to: code, holes: holes, theirs: theirs || null };
    }

    var busy = false;
    function syncOne(db, L, txMs) {
        var TX = txMs || TX_MS;
        var held = heldOp(L);
        if (!held) return Promise.resolve(null);
        var G = W.organizerGate;
        emit('hardpan:offline-syncing', { from: L });
        var gate = G && typeof G.ensureOrganizer === 'function' ? within(G.ensureOrganizer(db), TX, 'the organizer check') : Promise.resolve(null);
        return gate.then(function (uid) {
            var base = JSON.parse(JSON.stringify(held.value || {}));
            // A CREATE: the round carries the uid that writes it (the rules' ownerUid === auth.uid).
            if (uid && G && typeof G.stamp === 'function') G.stamp(base, uid, { exists: false, ownerUid: null });
            var sent = opsFor(L).filter(function (o) { return o.coalesceKey !== HELD + L; });
            var value = Q().applyQueued(base, sent, L);
            var at = Number(held.ts) || Date.now();
            var key = groupKey(value, at);
            value.offlineStart = { from: L, key: key, by: meName() || null, at: at };
            var tried = (jget(TRIED, {})[L] || []).slice();
            var codes = tried.concat([keyCode(key)]);
            for (var i = 0; i < DRAWS; i++) codes.push(draw());
            codes = codes.filter(function (c, ix) { return codes.indexOf(c) === ix; });
            var theirs = null, clashes = 0;
            function next(ix) {
                if (ix >= codes.length) { var e = new Error('no free code after ' + codes.length + ' tries'); e.code = 'exhausted'; throw e; }
                var code = codes[ix];
                var ref = db.ref('events/' + code);
                var tx;
                try { tx = ref.transaction(function (cur) { return cur === null ? value : undefined; }, undefined, false); } catch (e) { tx = Promise.reject(e); }
                return within(tx, TX, 'the round code ' + code).then(function (r) {
                    if (r && r.committed) return move(L, code, value, sent, theirs);
                    var cur = r && r.snapshot && typeof r.snapshot.val === 'function' ? r.snapshot.val() : null;
                    var os = cur && cur.offlineStart;
                    if (os && os.from === L) return move(L, code, cur, sent, theirs);   // mine, from an earlier try
                    if (os && os.key === key && !theirs) {
                        theirs = { code: code, by: os.by || null, names: ((cur.players || []).map(function (p) { return p && p.name; }).filter(Boolean)) };
                    } else if (tried.indexOf(code) < 0) {
                        clashes++;
                        emit('hardpan:offline-clash', { from: L, code: code, clashes: clashes });
                    }
                    return next(ix + 1);
                }, function (err) {
                    if (err && err.code === 'timeout') {
                        var t = jget(TRIED, {}); t[L] = (t[L] || []).concat(t[L] && t[L].indexOf(code) >= 0 ? [] : [code]); ls(TRIED, JSON.stringify(t));
                    }
                    throw err;
                });
            }
            return next(0);
        });
    }
    function sync(db, opts) {
        if (busy || !db || typeof db.ref !== 'function') return Promise.resolve(null);
        var codes = localCodes();
        if (!codes.length) return Promise.resolve(null);
        try { if (W.navigator && W.navigator.onLine === false) return Promise.resolve(null); } catch (e) {}
        busy = true;
        var results = [];
        var chain = Promise.resolve();
        codes.forEach(function (L) {
            chain = chain.then(function () { return syncOne(db, L, opts && opts.txMs); }).then(function (r) {
                if (r) { results.push(r); emit('hardpan:offline-synced', r); }
            }, function (err) { emit('hardpan:offline-sync-stopped', { from: L, reason: String((err && (err.code || err.message)) || err) }); });
        });
        return chain.then(function () { busy = false; return results; }, function () { busy = false; return results; });
    }
    function syncedTo(L) { var m = jget(SYNCED, {})[String(L || '').toUpperCase()]; return m && m.code ? m : null; }

    // ---- THE SCREENS ---------------------------------------------------------------------------
    var CSS = '.hp-off-banner{position:fixed;left:16px;right:16px;z-index:9000;margin:0;padding:10px 12px;border-radius:12px;font:600 14px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;text-align:left;box-shadow:0 4px 14px rgba(0,0,0,.18);box-sizing:border-box}'
        + '.hp-off-banner.off{background:#fff4d6;color:#5a4300;border:1px solid #f0d58a}.hp-off-banner.ok{background:#e4f6e8;color:#0f4c3a;border:1px solid #9fd3ad}.hp-off-banner.wait{background:#eef2ff;color:#1d3557;border:1px solid #c7d2fe}'
        + 'body.gps-side-gps .hp-off-banner{z-index:10200}'   // over the GPS map (z 10050), under its sheets (10400)
        + '.hp-off-banner .row{display:flex;gap:8px;margin-top:8px}.hp-off-banner .row button{flex:1;min-height:44px;border-radius:10px;font:700 15px -apple-system,sans-serif}'
        + '.hp-off-note{margin:8px 0;padding:10px 12px;border-radius:12px;font:600 14px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;text-align:left;background:#fff4d6;color:#5a4300;border:1px solid #f0d58a}';
    function style() { if (!D || D.getElementById('hp-off-style')) return; var s = D.createElement('style'); s.id = 'hp-off-style'; s.textContent = CSS; (D.head || D.documentElement).appendChild(s); }
    function param(n) { try { return new URLSearchParams(W.location.search).get(n); } catch (e) { return null; } }
    function page() { return String(W.location.pathname || '').split('/').pop() || 'index.html'; }
    // Under whatever fixed bar is at the top of the screen (the scorecard strip, the GPS top card).
    function topOffset() {
        var best = 0;
        try {
            Array.prototype.forEach.call(D.querySelectorAll('#hp-strip, #gps-overlay .gps-ld-head, body > *'), function (el) {
                if (el.classList && el.classList.contains('hp-off-banner')) return;
                var cs = W.getComputedStyle(el);
                if ((cs.position !== 'fixed' && cs.position !== 'absolute') || cs.display === 'none' || cs.visibility === 'hidden') return;
                var r = el.getBoundingClientRect();
                // The scorecard strip (fixed), or the GPS map's top card + Menu row (absolute over the map).
                if (r.top < 90 && r.height > 30 && r.height < 260 && r.width > W.innerWidth * 0.6) best = Math.max(best, r.bottom);
            });
        } catch (e) {}
        return Math.round(best + 8);
    }
    function banner(kind, html) {
        style();
        var b = D.getElementById('hp-off-banner');
        if (!b) { b = D.createElement('div'); b.id = 'hp-off-banner'; b.setAttribute('role', 'status'); D.body.appendChild(b); }
        b.className = 'hp-off-banner ' + kind;
        b.innerHTML = html;
        b.style.top = topOffset() + 'px';
        b.style.display = '';
        if (!b.__hpPlace) { b.__hpPlace = setInterval(function () { if (b.style.display !== 'none') b.style.top = topOffset() + 'px'; }, 1500); }
        return b;
    }
    function hideBanner() { var b = D && D.getElementById('hp-off-banner'); if (b) b.style.display = 'none'; }

    // 03 · SCORING OFFLINE (the scorecard of a local round).
    var collapsed = false, bannerKind = 'off';
    function paintOffline(code) {
        if (collapsed || bannerKind !== 'off') return;
        var n = holesOf(localData(code));
        var b = banner('off', '📴 Offline round · ' + n + ' hole' + (n === 1 ? '' : 's') + ' saved on this phone · nothing lost if the app closes');
        b.setAttribute('data-hp-off', 'scoring');
        b.onclick = function () { collapsed = true; hideBanner(); };
    }
    // 04b · SYNCING, 09 · A CODE CLASH.
    function paintSyncing(code) { bannerKind = 'wait'; var n = holesOf(localData(code)); banner('wait', '⏳ Signal back - getting your round code and sending ' + n + ' hole' + (n === 1 ? '' : 's') + '…').setAttribute('data-hp-off', 'syncing'); }
    function paintClash() { bannerKind = 'wait'; banner('wait', '⏳ Getting your round code… the first one drawn was already taken, drawing another. Your scores are safe on this phone.').setAttribute('data-hp-off', 'clash'); }
    // 04 · SYNCED: the real code, Share code / OK. 07 · TWO PHONES: Keep mine / Open theirs.
    function paintSynced(m) {
        bannerKind = 'ok';
        var b = banner('ok', '<b>✅ Signal back - your round is synced.</b><br>Round code <b style="font-size:20px;letter-spacing:.08em">' + esc(m.code) + '</b> · ' + m.holes + ' hole' + (m.holes === 1 ? '' : 's') + ' sent'
            + '<div class="row"><button type="button" data-hp-off-share style="border:0;background:#0f4c3a;color:#fff">Share code</button><button type="button" data-hp-off-ok style="border:1px solid #0f4c3a;background:#fff;color:#0f4c3a">OK</button></div>');
        b.setAttribute('data-hp-off', 'synced');
        b.onclick = function (ev) {
            var t = ev.target;
            if (t && t.hasAttribute && t.hasAttribute('data-hp-off-share')) { hideBanner(); try { if (W.HardPanDoors && typeof W.HardPanDoors.openShare === 'function') W.HardPanDoors.openShare(); } catch (e) {} }
            else if (t && t.hasAttribute && t.hasAttribute('data-hp-off-ok')) hideBanner();
        };
        if (m.remind) setTimeout(function () { try { if (W.HardPanDoors && typeof W.HardPanDoors.openShare === 'function') W.HardPanDoors.openShare(); } catch (e) {} }, 400);
        if (m.theirs) setTimeout(function () { askTheirs(m); }, m.remind ? 900 : 300);
    }
    function list(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function askTheirs(m) {
        if (typeof W.uiConfirm !== 'function') return;
        var t = m.theirs, by = t.by ? String(t.by) : null;
        var me = function (n) { n = String(n || '').toLowerCase(); var b = by.toLowerCase(); return n === b || n.split(' ')[0] === b; };
        var others = (t.names || []).filter(function (n) { return !by || !me(n); });
        if (!others.length) others = (t.names || []).slice();
        var who = by ? (by + '’s phone') : 'Another phone';
        W.uiConfirm({ title: 'Two rounds for this group?',
            body: who + ' also started a round today with ' + list(others) + ': ' + t.code + '.\nYours synced as ' + m.code + '. Scores are never merged by themselves.',
            confirmText: 'Open ' + t.code, cancelText: 'Keep mine', danger: false }).then(function (open) {
            if (open) W.location.href = 'index.html?game=' + encodeURIComponent(t.code);
        }, function () {});
    }
    // 05 · INVITE BEFORE SYNC.
    var REMIND = 'hardpan_offline_remind_v1';
    function inviteLocked(code) {
        if (typeof W.uiConfirm !== 'function') return;
        W.uiConfirm({ title: 'Invite golfers', body: '🔒 This is an offline round, so it has no round code yet.\nOther golfers can join once you have signal and the round is synced. Until then, you keep score for the group on this phone.',
            confirmText: 'Remind me', cancelText: 'OK', danger: false }).then(function (remind) {
            if (remind) { var r = jget(REMIND, {}); r[String(code).toUpperCase()] = 1; ls(REMIND, JSON.stringify(r)); }
        }, function () {});
    }
    // 06 · ANOTHER GOLFER, A CODE THAT IS NOT THERE YET (the lobby's "Open a round you already have").
    function notYet(code, after) {
        if (!D || !after || !after.parentNode) return;
        style();
        var n = D.getElementById('hp-off-notyet');
        if (!n) { n = D.createElement('div'); n.id = 'hp-off-notyet'; n.className = 'hp-off-note'; n.setAttribute('role', 'status'); }
        n.textContent = '⏳ Round ' + code + ' isn’t here yet. If it was started offline, it appears once that phone has signal. Try again in a minute.';
        after.parentNode.insertBefore(n, after.nextSibling);
    }
    // 08 · RESUME AFTER THE APP WAS CLOSED OFFLINE (Games & Bets).
    function resumeLabel(btn, course, thru) {
        if (!btn) return;
        btn.innerHTML = '▶︎ <b></b> · ' + (thru ? 'thru ' + thru : 'not started');
        btn.querySelector('b').textContent = 'Resume offline round' + (course ? ' · ' + String(course).split(' (')[0].replace(/ Golf (Club|Course|Resort)$/, '') : '');
        style();
        var n = D.getElementById('hp-off-resume-note');
        if (!n) { n = D.createElement('div'); n.id = 'hp-off-resume-note'; n.className = 'hp-off-note'; btn.parentNode.insertBefore(n, btn.nextSibling); }
        var h = holesOf(localData(String(ls('lastRoomCode') || '').toUpperCase()));
        n.textContent = '📴 ' + ((W.navigator && W.navigator.onLine === false) ? 'The app was closed with no signal. ' : '') + 'The round and its ' + h + ' hole' + (h === 1 ? '' : 's') + ' were kept on this phone; it syncs when signal returns.';
    }
    // 02 · ROUND SETUP OF A LOCAL ROUND.
    function decorateSetup(code) {
        var c = D.getElementById('display-room-code');
        if (!c || c.getAttribute('data-hp-off') === '1') return;
        c.setAttribute('data-hp-off', '1');
        c.textContent = 'Offline round';
        c.style.fontSize = '1.4rem';
        var label = c.previousElementSibling; if (label) label.textContent = 'Game code';
        style();
        var n = D.createElement('div');
        n.className = 'hp-off-note'; n.id = 'hp-off-setup-note';
        n.textContent = '📴 Saved on this phone. Your round code comes when you have signal, then you can share it.';
        c.parentNode.appendChild(n);
    }

    // ---- WIRING -------------------------------------------------------------------------------
    function moveTo(m) {
        var u; try { u = new URL(W.location.href); } catch (e) { return; }
        u.searchParams.set('game', m.code);
        var r = jget(REMIND, {}); var remind = !!r[m.from]; if (remind) { delete r[m.from]; ls(REMIND, JSON.stringify(r)); }
        ss(SHOW, JSON.stringify({ code: m.code, holes: m.holes, theirs: m.theirs || null, from: m.from, remind: remind }));
        W.location.replace(u.toString());
    }
    function boot() {
        var code = String(param('game') || '').toUpperCase(), pg = page();
        // A page still on a local code that has synced moves to the real one.
        if (isLocal(code)) {
            var m = syncedTo(code);
            if (m) { var done = jget(SYNCED, {})[code]; moveTo({ code: m.code, holes: m.holes, theirs: m.theirs, from: code, shown: done && done.shown }); return; }
        }
        W.addEventListener('hardpan:offline-synced', function (ev) {
            var d = ev && ev.detail;
            if (d && d.from === code && pg !== 'admin.html') moveTo({ code: d.to, holes: d.holes, theirs: d.theirs || null, from: d.from });
            else if (d && d.from === code && pg === 'admin.html') { var u = new URL(W.location.href); u.searchParams.set('game', d.to); W.location.replace(u.toString()); }
        });
        if (/^(index\.html)?$/.test(pg) || pg === 'index.html') {
            var show = null; try { show = JSON.parse(ss(SHOW) || 'null'); } catch (e) { show = null; }
            if (show && show.code === code) { ss(SHOW, null); setTimeout(function () { paintSynced(show); }, 1200); return; }
            if (!isLocal(code)) return;
            setTimeout(function () { paintOffline(code); }, 1500);
            setInterval(function () { paintOffline(code); }, 2500);
            W.addEventListener('hardpan:offline-syncing', function (ev) { if (ev.detail && ev.detail.from === code) paintSyncing(code); });
            W.addEventListener('hardpan:offline-clash', function (ev) { if (ev.detail && ev.detail.from === code) paintClash(); });
            W.addEventListener('hardpan:offline-sync-stopped', function (ev) { if (ev.detail && ev.detail.from === code) { bannerKind = 'off'; collapsed = false; paintOffline(code); } });
        }
        if (pg === 'admin.html' && isLocal(code)) decorateSetup(code);
    }
    installFirewall();
    if (D) { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0); }

    W.HardPanOfflineRound = {
        isLocal: isLocal, isLocalPath: isLocalPath, newCode: newCode, hasLocal: hasLocal, localCodes: localCodes,
        localData: localData, holesOf: holesOf, groupKey: groupKey, keyCode: keyCode,
        sync: sync, syncedTo: syncedTo, guardDb: guardDb, installFirewall: installFirewall, blocked: function () { return blocked; },
        inviteLocked: inviteLocked, notYet: notYet, resumeLabel: resumeLabel, decorateSetup: decorateSetup, paintSynced: paintSynced
    };
})();
