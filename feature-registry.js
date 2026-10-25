// ============================================================================
// HARDPAN GPS - THE CUSTOMIZABLE ROUND SCREEN (URGENT-066 #1, 2026-10-24)
//
// THREE THINGS IN ONE FILE, and nothing else:
//
//   1  THE FEATURE REGISTRY. An extra (games ticker, leaderboard, stats strip, and
//      later voice scoring and scorecard scan) registers ONE definition. The round
//      screen draws it in its SLOT when the golfer has it on. A feature never
//      positions itself and never reaches into gps-view.js.
//   2  THE LAYOUT STORE. { v: 1, order: [ids], on: { id: true }, at: ms } on this
//      phone (localStorage hardpan_layout_v1) and - only when features.layoutSync
//      is true, which waits for the layoutPrefs rules to be published with Manny's
//      typed OK - also at layoutPrefs/<uid> for a signed-in golfer. Newer `at` wins.
//   3  THE CUSTOMIZE PANEL (Tools > Customize your screen): toggle and drag to
//      reorder the extras; paid ones show a lock that explains, never nags; the
//      notification switches the app already has (same store, same defaults).
//
// ONLY ADDS (Manny, URGENT-067). A golfer who never customizes sees today's round
// screen exactly: every extra here is OFF until it is turned on, and nothing on
// the screen is hidden or moved by this file. The one new thing they see is a
// first-round hint that shows once.
//
// NO MONEY HERE. The games ticker shows bet-strip.js's own status lines
// (buildActionRows - the presenter the scorecard already uses); the leaderboard
// shows gps-view.js's own round score per golfer. This file adds no arithmetic
// about games or money and writes nothing a money engine reads.
//
// NO LOCATION HERE. The layout is a list of ids and booleans.
//
// REGISTERING (any file, before or after this one loads):
//   (window.HardPanFeatureQueue = window.HardPanFeatureQueue || []).push({
//       id, label, sub, icon, isNew, kind: 'button'|'strip'|'panel', slot: 'strip'|'side'|'dock',
//       screens: ['round'], defaultOn: false | { scorekeeper, playing, watching },
//       tier: 'free'|'gps'|'host'|'allin', freeUses, unit ('scan': "3 free scans"), available(ctx), unlocked(ctx),
//       mount(el, ctx) -> { update(ctx), unmount() }, lockedTap(ctx) });
// Plain var / function, no const at the top level (a page that re-declares a
// name must not die).
// ============================================================================
(function (W) {
    'use strict';
    if (!W || W.HardPanFeatures) return;
    var ID_RE = /^[a-z][a-zA-Z0-9]{1,31}$/;
    var SLOTS = { strip: 1, side: 1, dock: 1 };
    var KINDS = { button: 1, strip: 1, panel: 1 };
    var TIERS = { free: '', gps: 'GPS Map', host: 'Host', allin: 'All-in' };
    var MAX_ORDER = 32;
    var LKEY = 'hardpan_layout_v1';
    var HINT_KEY = 'hardpan_customize_hint_v1';
    var USES_KEY = 'hardpan_feature_uses_v1';
    var NEW_DAYS = 30;

    var defs = [], byId = {}, host = null, mounted = {}, prefsCache = null, remoteAsked = false;

    function warn(m) { try { console.warn('[HardPanFeatures] ' + m); } catch (e) {} }
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // ---- 1. THE REGISTRY ---------------------------------------------------------------------
    function check(d) {
        if (!d || typeof d !== 'object') return 'not an object';
        if (!ID_RE.test(String(d.id || ''))) return 'bad id ' + JSON.stringify(d.id);
        if (byId[d.id]) return 'duplicate id ' + d.id;
        if (!SLOTS[d.slot]) return d.id + ': unknown slot ' + JSON.stringify(d.slot);
        if (d.kind != null && !KINDS[d.kind]) return d.id + ': unknown kind ' + JSON.stringify(d.kind);
        if (d.tier != null && !(d.tier in TIERS)) return d.id + ': unknown tier ' + JSON.stringify(d.tier);
        if (typeof d.mount !== 'function') return d.id + ': no mount()';
        if (!d.label) return d.id + ': no label';
        return null;
    }
    function register(d) {
        var why = check(d);
        if (why) { warn('refused: ' + why); return false; }
        var def = Object.assign({ kind: 'button', screens: ['round'], defaultOn: false, tier: 'free', freeUses: 0, sub: '', icon: '' }, d);
        defs.push(def); byId[def.id] = def;
        if (host) { try { sync(host); } catch (e) {} }
        return true;
    }
    function list() { return defs.slice(); }

    // ---- 2. THE LAYOUT STORE -----------------------------------------------------------------
    // Anything unreadable becomes "never customized". Unknown ids are dropped when the
    // layout is USED, not when it is read, so a feature that ships later still finds its
    // saved place on this phone.
    function normalise(raw) {
        var p = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        var order = [], seen = {};
        var src = Array.isArray(p.order) ? p.order : (p.order && typeof p.order === 'object' ? Object.keys(p.order).sort(function (a, b) { return a - b; }).map(function (k) { return p.order[k]; }) : []);
        src.forEach(function (id) { id = String(id); if (ID_RE.test(id) && !seen[id] && order.length < MAX_ORDER) { seen[id] = 1; order.push(id); } });
        var on = {};
        if (p.on && typeof p.on === 'object') Object.keys(p.on).forEach(function (id) { if (ID_RE.test(id) && p.on[id] === true) on[id] = true; });
        var at = Number(p.at); if (!isFinite(at) || at < 0) at = 0;
        return { v: 1, order: order, on: on, at: at };
    }
    function isNative() { try { return !!(W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    function syncOn() { try { var f = (W.HARDPAN_GPS_CONFIG || {}).features || {}; return f.layoutSync === true; } catch (e) { return false; } }
    function signedInUid() {
        try { var u = W.firebase && W.firebase.auth && W.firebase.auth().currentUser; return u && u.uid && !u.isAnonymous ? u.uid : null; } catch (e) { return null; }
    }
    function remotePath(uid) { return 'layoutPrefs/' + uid; }
    // For the rules (and RTDB): order as an array; on with only true values (an empty
    // object is dropped by RTDB, so `on` is optional in the rules).
    function forSave(p) { var n = normalise(p); var out = { v: 1, order: n.order.slice(), at: n.at }; if (Object.keys(n.on).length) out.on = n.on; return out; }
    function loadPrefs() {
        if (!prefsCache) prefsCache = normalise(lsGet(LKEY));
        if (!remoteAsked && syncOn()) {
            var uid = signedInUid();
            if (uid) {
                remoteAsked = true;
                try {
                    W.firebase.database().ref(remotePath(uid)).once('value').then(function (s) {
                        var r = normalise(s && s.val());
                        if (r.at > prefsCache.at) { prefsCache = r; lsSet(LKEY, forSave(r)); if (host) sync(host); }
                    }).catch(function () {});
                } catch (e) {}
            }
        }
        return prefsCache;
    }
    function savePrefs(p) {
        var n = normalise(p); n.at = Date.now();
        prefsCache = n;
        lsSet(LKEY, forSave(n));
        if (syncOn()) {
            var uid = signedInUid();
            if (uid) { try { W.firebase.database().ref(remotePath(uid)).set(forSave(n)).catch(function () {}); } catch (e) {} }
        }
        return n;
    }
    function resetPrefs() { return savePrefs({ order: [], on: {} }); }

    // ---- ctx: what a feature gets ------------------------------------------------------------
    function usesAll() { var u = lsGet(USES_KEY); return u && typeof u === 'object' ? u : {}; }
    function usedOf(id) { var n = Number(usesAll()[id]); return isFinite(n) && n > 0 ? n : 0; }
    function ctxNow() {
        var h = host || {};
        var call = function (f, dflt) { try { return typeof f === 'function' ? f() : dflt; } catch (e) { return dflt; } };
        var ent = Object.assign({ gps: false, host: false, allin: false }, call(h.ent, {}) || {});
        var round = call(h.round, null);
        var frozen = null;
        try { frozen = round ? JSON.parse(JSON.stringify({ code: h.code ? h.code() : '', courseName: round.courseName || '', players: round.players || [], courseData: round.courseData || [], scores: round.scores || {} })) : null; } catch (e) { frozen = null; }
        if (frozen) { try { Object.freeze(frozen); } catch (e) {} }
        var ctx = {
            round: frozen, hole: call(h.hole, null), me: call(h.me, null), role: call(h.role, 'watching'), ent: ent,
            usesLeft: function (id) { var d = byId[id]; var max = d ? Number(d.freeUses) || 0 : 0; return Math.max(0, max - usedOf(id)); },
            useOne: function (id) { var u = usesAll(); u[id] = usedOf(id) + 1; lsSet(USES_KEY, u); return ctx.usesLeft(id); },
            yardage: function () { return call(h.yardage, null); },
            toast: function (t) { try { if (typeof W.uiToast === 'function') W.uiToast(String(t), 3000); } catch (e) {} },
            haptic: function () { try { var H = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.Haptics; if (H && H.impact) H.impact({ style: 'LIGHT' }); } catch (e) {} },
            openSheet: function (html) { return openSheet(html); },
            proposeScores: function (list, opts) { return proposeScores(list, opts); }
        };
        return ctx;
    }
    function availableNow(d, ctx) {
        if (d.screens && d.screens.indexOf('round') === -1) return false;
        if (typeof d.available === 'function') { try { return !!d.available(ctx); } catch (e) { return false; } }
        return true;
    }
    function lockedNow(d, ctx) {
        if (!d.tier || d.tier === 'free') return false;
        if (typeof d.unlocked === 'function') { try { return !d.unlocked(ctx); } catch (e) { return true; } }
        return !ctx.ent[d.tier];
    }
    function defaultFor(d, role) {
        var v = d.defaultOn;
        if (v && typeof v === 'object') return v[role] === true;
        return v === true;
    }
    // THE ONE ANSWER to "what is on, in what order": the saved order first (known ids
    // only), then features the saved layout has never seen, in registration order, at
    // their defaults (OFF unless the feature says on for this role).
    function effective(prefs, ctx) {
        var p = normalise(prefs), out = [], seen = {};
        var avail = defs.filter(function (d) { return availableNow(d, ctx); });
        var known = {}; p.order.forEach(function (id) { known[id] = 1; });
        p.order.forEach(function (id) { var d = byId[id]; if (d && !seen[id] && avail.indexOf(d) !== -1) { seen[id] = 1; out.push({ def: d, on: p.on[id] === true }); } });
        avail.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; out.push({ def: d, on: known[d.id] ? p.on[d.id] === true : defaultFor(d, ctx.role) }); } });
        return out.map(function (x) {
            var locked = lockedNow(x.def, ctx), left = ctx.usesLeft(x.def.id);
            return { id: x.def.id, def: x.def, on: x.on, locked: locked, usesLeft: left, shows: x.on && (!locked || left > 0) };
        });
    }

    // ---- MOUNTING INTO THE ROUND SCREEN ------------------------------------------------------
    // host (from gps-view.js): { el, under(), dock(), code(), round(), me(), hole(), role(), ent(),
    //   standings(), yardage(), relayout() }. Returns true when what is mounted changed.
    function slotParent(slot) {
        if (!host) return null;
        try {
            if (slot === 'dock') return host.dock ? host.dock() : null;
            var u = host.under ? host.under() : null;
            if (!u) return null;
            var cls = 'hpf-host hpf-' + slot;
            var el = u.querySelector(':scope > .hpf-' + slot);
            if (!el) {
                el = document.createElement('div'); el.className = cls; el.setAttribute('data-hpf-slot', slot);
                // strip first, then side, then whatever the screen already had there
                var after = slot === 'side' ? u.querySelector(':scope > .hpf-strip') : null;
                if (after) u.insertBefore(el, after.nextSibling); else u.insertBefore(el, u.firstChild);
            }
            return el;
        } catch (e) { return null; }
    }
    function sync(h) {
        if (h) host = h;
        if (!host || !host.el) return false;
        ensureCss();
        var ctx = ctxNow();
        var eff = effective(loadPrefs(), ctx);
        var changed = false;
        var want = {};
        eff.forEach(function (x) { if (x.shows) want[x.id] = x; });
        Object.keys(mounted).forEach(function (id) {
            var m = mounted[id];
            if (!want[id] || !m.el.isConnected) {
                try { if (m.handle && m.handle.unmount) m.handle.unmount(); } catch (e) {}
                try { m.el.remove(); } catch (e) {}
                delete mounted[id]; changed = true;
            }
        });
        // In the golfer's order, within each slot.
        eff.forEach(function (x) {
            if (!x.shows) return;
            var par = slotParent(x.def.slot);
            if (!par) return;
            var m = mounted[x.id];
            if (!m) {
                var el = document.createElement('div');
                el.className = 'hpf-slot hpf-' + x.def.slot + '-item';
                el.setAttribute('data-hpf', x.id);
                var handle = null;
                try { handle = x.def.mount(el, ctx) || null; } catch (e) { warn(x.id + ' mount failed: ' + (e && e.message)); }
                m = mounted[x.id] = { el: el, handle: handle };
                changed = true;
            } else {
                try { if (m.handle && m.handle.update) m.handle.update(ctx); } catch (e) {}
            }
            par.appendChild(m.el);   // appendChild moves it: the DOM order follows the golfer's order
        });
        // Empty slot hosts take no room.
        ['strip', 'side'].forEach(function (s) {
            try { var u = host.under && host.under(); var el = u && u.querySelector(':scope > .hpf-' + s); if (el) el.style.display = el.children.length ? '' : 'none'; } catch (e) {}
        });
        maybeHint();
        return changed;
    }
    function relayout() { try { if (host && host.relayout) host.relayout(); } catch (e) {} }
    function detach() {
        Object.keys(mounted).forEach(function (id) { var m = mounted[id]; try { if (m.handle && m.handle.unmount) m.handle.unmount(); } catch (e) {} try { m.el.remove(); } catch (e) {} });
        mounted = {}; host = null;
    }
    function shown() { return Object.keys(mounted); }

    // ---- THE BUILT-IN EXTRAS (registered through the same API) --------------------------------
    function tickerRows(ctx) {
        try {
            if (typeof W.buildActionRows !== 'function' || !host || !host.round) return [];
            var d = host.round();
            if (!d) return [];
            return W.buildActionRows(d, d.courseData || [], d.scores || {}, null) || [];
        } catch (e) { return []; }
    }
    register({
        id: 'ticker', label: 'Games ticker', sub: 'Who is up in each game, one line', icon: '🏆', kind: 'strip', slot: 'strip', tier: 'free', defaultOn: false,
        mount: function (el, ctx) {
            var draw = function () {
                var rows = tickerRows(ctx);
                var html = rows.length ? rows.map(function (r) { return '<span class="hpf-tk-i"><b>' + esc(String(r.label || '').toUpperCase()) + '</b> ' + esc(r.status) + '</span>'; }).join('')
                    : '<span class="hpf-tk-i hpf-dim">No games yet · ☰ Menu to add one</span>';
                if (el.getAttribute('data-h') !== html) { el.setAttribute('data-h', html); el.innerHTML = '<div class="hpf-ticker" role="status" aria-label="Games">' + html + '</div>'; }
            };
            draw();
            return { update: draw, unmount: function () {} };
        }
    });
    register({
        id: 'leaderboard', label: 'Live leaderboard', sub: 'Top of the group, live', icon: '📋', kind: 'panel', slot: 'side', tier: 'free', defaultOn: false,
        mount: function (el) {
            var draw = function () {
                var st = []; try { st = (host && host.standings && host.standings()) || []; } catch (e) { st = []; }
                var played = st.filter(function (s) { return s.rs && s.rs.thru > 0; });
                played.sort(function (a, b) { return (a.rs.grossToPar - b.rs.grossToPar) || (b.rs.thru - a.rs.thru); });
                var tp = function (n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : '−' + Math.abs(n)); };
                var small = (W.innerHeight || 800) < 700;
                var html;
                if (!played.length) html = '<div class="hpf-lb hpf-lb-1"><span class="hpf-live">● LIVE</span> <span class="hpf-dim">No scores yet</span></div>';
                else if (small) html = '<div class="hpf-lb hpf-lb-1"><span class="hpf-live">● LIVE</span>' + played.slice(0, 3).map(function (s, i) { return ' <span>' + (i + 1) + ' ' + esc(s.name) + ' ' + tp(s.rs.grossToPar) + '</span>'; }).join('') + '</div>';
                else html = '<div class="hpf-lb"><div class="hpf-live">● LIVE</div>' + played.slice(0, 4).map(function (s, i) { return '<div class="hpf-lb-r"><span>' + (i + 1) + ' ' + esc(s.name) + '</span><span>' + tp(s.rs.grossToPar) + ' <small>thru ' + s.rs.thru + '</small></span></div>'; }).join('') + '</div>';
                if (el.getAttribute('data-h') !== html) { el.setAttribute('data-h', html); el.innerHTML = html; }
            };
            draw();
            return { update: draw, unmount: function () {} };
        }
    });
    function statsLine(ctx) {
        try {
            var S = W.HardPanGpsStats, me = ctx.me, r = ctx.round;
            if (!S || !S.quick || !me || !r) return null;
            var rec = S.quick.load(String(r.code || ''), me.id);
            var fir = 0, firN = 0, gir = 0, girN = 0, putts = 0, puttN = 0;
            (r.courseData || []).forEach(function (h) {
                var v = parseInt((r.scores || {})['p' + me.id + '_h' + h.hole], 10);
                if (!(v > 0)) return;
                var c = S.quick.hole(String(r.code || ''), me.id, h.hole, v, h.par) || {};
                if (S.quick.fwAsked(h.par) && c.fw) { firN++; if (c.fw === 'hit') fir++; }
                if (c.putts != null) { puttN++; putts += Number(c.putts) || 0; girN++; if (c.gir) gir++; }
            });
            return { rec: !!rec, fir: fir, firN: firN, gir: gir, girN: girN, putts: putts, puttN: puttN };
        } catch (e) { return null; }
    }
    register({
        id: 'stats', label: 'Stats strip', sub: 'Fairways, greens, putts as you go', icon: '▦', kind: 'strip', slot: 'side', tier: 'free', defaultOn: false,
        available: function () { return !!W.HardPanGpsStats; },
        mount: function (el, ctx0) {
            var draw = function (ctx) {
                var s = statsLine(ctx || ctx0);
                var html = (!s || (!s.firN && !s.puttN))
                    ? '<div class="hpf-chips"><span class="hpf-dim">Stats: tap putts / fairway on the score sheet</span></div>'
                    : '<div class="hpf-chips"><span>FIR ' + s.fir + '/' + s.firN + '</span><span>GIR ' + s.gir + '/' + s.girN + '</span><span>Putts ' + s.putts + '</span></div>';
                if (el.getAttribute('data-h') !== html) { el.setAttribute('data-h', html); el.innerHTML = html; }
            };
            draw(ctx0);
            return { update: draw, unmount: function () {} };
        }
    });

    // ---- 3. THE PANEL ------------------------------------------------------------------------
    function panelRoot() { return host && host.el ? host.el : document.body; }
    function closePanel() {
        var r = panelRoot();
        Array.prototype.forEach.call(r.querySelectorAll('.hpf-sheet, .hpf-back'), function (e) { e.remove(); });
    }
    function openSheet(html) {
        closePanel();
        ensureCss();
        var r = panelRoot();
        var back = document.createElement('div'); back.className = 'hpf-back';
        var sh = document.createElement('div'); sh.className = 'hpf-sheet hpf-small'; sh.setAttribute('role', 'dialog');
        sh.innerHTML = '<div class="hpf-grip"></div>' + html;
        back.addEventListener('click', closePanel);
        r.appendChild(back); r.appendChild(sh);
        return sh;
    }
    function newBadge(d) {
        if (!d.isNew) return '';
        var since = Number(d.isNew); // true = always NEW until the feature drops the flag; a ms date = NEW for 30 days from it
        if (isFinite(since) && since > 1e12 && Date.now() - since > NEW_DAYS * 864e5) return '';
        return '<span class="hpf-new">NEW</span>';
    }
    function rowHtml(x) {
        var d = x.def, tier = TIERS[d.tier] || '';
        var right = x.locked && !x.on
            ? '<button type="button" class="hpf-lock" data-hpf-lock="' + esc(d.id) + '" aria-label="' + esc(d.label + ' - ' + tier + ', how to get it') + '">🔒 ' + esc(tier) + (Number(d.freeUses) > 0 ? ' · ' + x.usesLeft + ' free' : '') + '</button>'
            : '<button type="button" class="hpf-sw' + (x.on ? ' on' : '') + '" role="switch" aria-checked="' + (x.on ? 'true' : 'false') + '" data-hpf-sw="' + esc(d.id) + '" aria-label="' + esc(d.label) + '"><i></i></button>';
        return '<div class="hpf-row" data-hpf-row="' + esc(d.id) + '"><span class="hpf-grab" aria-label="Drag to reorder" role="button" tabindex="0">≡</span><span class="hpf-ic" aria-hidden="true">' + esc(d.icon || '•') + '</span>'
            + '<div class="hpf-txt"><div class="hpf-l">' + esc(d.label) + newBadge(d) + '</div>' + (d.sub ? '<div class="hpf-s">' + esc(d.sub) + '</div>' : '') + '</div>' + right + '</div>';
    }
    function coreRow(ic, l, s) { return '<div class="hpf-row hpf-core-row"><span class="hpf-ic" aria-hidden="true">' + ic + '</span><div class="hpf-txt"><div class="hpf-l">' + esc(l) + '</div><div class="hpf-s">' + esc(s) + '</div></div><span class="hpf-core">Always</span></div>'; }

    // NOTIFICATIONS (Manny, approved 2026-10-24): three switches - Round results (essentials),
    // Game challenges & presses (bets), Birdies & big moments (hype) - ALL OFF until the golfer
    // turns one on, and NO iOS permission prompt until then. The same store as the account
    // screen (pushPrefs/<uid> via push-boot.js pushPrefsForSave) and the same normaliser
    // (push-notify.js). Only in the app, as there: a browser has no push.
    var notif = { prefs: null, saving: false };
    function notifyUid() { try { var u = W.firebase && W.firebase.auth && W.firebase.auth().currentUser; return u && u.uid ? u.uid : null; } catch (e) { return null; } }
    function notifPrefs() { var raw = typeof W.pushPrefsWithLocal === 'function' ? W.pushPrefsWithLocal(notif.prefs) : notif.prefs; return typeof W.pushPrefsNormalise === 'function' ? W.pushPrefsNormalise(raw) : { essentials: !!(raw && raw.essentials === true), bets: !!(raw && raw.bets === true), hype: !!(raw && raw.hype === true) }; }
    function notifHtml() {
        if (!isNative()) return '<div class="hpf-note">Notifications are set in the HardPan app on your phone.</div>';
        if (!notifyUid()) return '<div class="hpf-note">Sign in to choose your notifications.</div>';
        var p = notifPrefs();
        var row = function (k, ic, l, sub, on) { return '<div class="hpf-row hpf-core-row"><span class="hpf-ic" aria-hidden="true">' + ic + '</span><div class="hpf-txt"><div class="hpf-l">' + l + '</div><div class="hpf-s">' + sub + '</div></div><button type="button" class="hpf-sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-hpf-nsw="' + k + '" aria-label="' + l.replace(/&amp;/g, 'and') + '"><i></i></button></div>'; };
        return '<div class="hpf-note">All off until you turn one on. No reminders and no ads, ever.</div>'
            + row('essentials', '✅', 'Round results', '"You\'re in" and final results', p.essentials)
            + row('bets', '🤝', 'Game challenges &amp; presses', 'Someone presses or challenges you', p.bets)
            + row('hype', '🐦', 'Birdies &amp; big moments', 'At most one a hole', p.hype);
    }
    function notifLoad(redraw) {
        var uid = notifyUid();
        if (!isNative() || !uid || notif.prefs) return;
        try { W.firebase.database().ref('pushPrefs/' + uid).once('value').then(function (s) { notif.prefs = s.val() || {}; redraw(); }).catch(function () {}); } catch (e) {}
    }
    // THE FIRST SWITCH ON is the moment iOS is asked: the same registration the round uses
    // (push-boot.js pushRegisterToken), now allowed to prompt.
    function notifAskNow(uid) {
        if (typeof W.pushRegisterToken !== 'function') return;
        try {
            W.pushRegisterToken({
                uid: uid, playerId: (host && host.me && host.me() ? host.me().id : ''), roundCode: host && host.code ? host.code() : '',
                save: function (rec) { var key = typeof W.pushDeviceKey === 'function' ? W.pushDeviceKey(rec.token) : null; return key ? W.firebase.database().ref('pushTokens/' + uid + '/' + key).set(rec) : Promise.resolve(); }
            }).catch(function () {});
        } catch (e) {}
    }
    function notifToggle(k, redraw) {
        var uid = notifyUid(); if (!uid || notif.saving) return;
        var p = notifPrefs(); p[k] = !p[k];
        var payload = typeof W.pushPrefsForSave === 'function' ? W.pushPrefsForSave(p) : { essentials: !!p.essentials, bets: !!p.bets, hype: !!p.hype };
        var on = !!(payload.essentials || payload.bets || payload.hype);
        if (typeof W.pushSetOptinHere === 'function') W.pushSetOptinHere(on);
        notif.prefs = payload; notif.saving = true; redraw();
        try {
            var ref = W.firebase.database().ref('pushPrefs/' + uid);
            (typeof W.pushPrefsSave === 'function' ? W.pushPrefsSave(ref, payload) : ref.update(payload)).then(function () { notif.saving = false; }).catch(function () { notif.saving = false; });
        } catch (e) { notif.saving = false; }
        if (on && p[k]) notifAskNow(uid);
    }

    // state (internal): { work, dirty } when coming back from a lock's explainer.
    function openPanel(state) {
        ensureCss();
        var ctx = ctxNow();
        var work = state && state.work ? state.work : effective(loadPrefs(), ctx).map(function (x) { return { id: x.id, on: x.on }; });
        var dirty = !!(state && state.dirty);
        var sh = openSheet('');
        sh.classList.remove('hpf-small'); sh.classList.add('hpf-panel'); sh.setAttribute('aria-label', 'Customize your screen');
        var asPrefs = function () { return { order: work.map(function (w) { return w.id; }), on: work.reduce(function (o, w) { if (w.on) o[w.id] = true; return o; }, {}) }; };
        var draw = function () {
            var eff = effective(asPrefs(), ctx);
            var top = sh.scrollTop;
            sh.innerHTML = '<div class="hpf-grip"></div><div class="hpf-hd"><div class="hpf-title">Customize your screen</div><button type="button" class="hpf-done">Done</button></div>'
                + '<div class="hpf-sub">Only what you turn on shows up. Drag ≡ to change the order.</div>'
                + '<div class="hpf-h">ALWAYS ON</div>'
                + coreRow('✏️', 'Score entry', 'Hole, Enter score, Card') + coreRow('🎲', 'Your games', 'Menu: games, standings, settle up') + coreRow('📍', 'GPS map & yardages', 'Map, front / middle / back, plays like')
                + '<div class="hpf-h">EXTRAS ON YOUR ROUND SCREEN</div><div class="hpf-list">' + eff.map(rowHtml).join('') + '</div>'
                + '<div class="hpf-h">NOTIFICATIONS</div>' + notifHtml()
                + '<div class="hpf-foot"><span class="hpf-dim">' + (syncOn() && signedInUid() ? 'Saved to your account and this phone' : 'Saved on this phone') + '</span><button type="button" class="hpf-reset">Back to simple</button></div>';
            sh.scrollTop = top;
        };
        draw();
        notifLoad(draw);
        var finish = function () {
            if (dirty) savePrefs(asPrefs());
            closePanel();
            if (host) { sync(host); relayout(); }
        };
        sh.addEventListener('click', function (e) {
            var t = e.target, b;
            if (!t || !t.closest) return;
            if (t.closest('.hpf-done')) { finish(); return; }
            if (t.closest('.hpf-reset')) { work.forEach(function (w) { w.on = false; }); dirty = true; draw(); return; }
            if ((b = t.closest('[data-hpf-sw]'))) { var id = b.getAttribute('data-hpf-sw'); work.forEach(function (w) { if (w.id === id) w.on = !w.on; }); dirty = true; draw(); return; }
            if ((b = t.closest('[data-hpf-nsw]'))) { notifToggle(b.getAttribute('data-hpf-nsw'), draw); return; }
            if ((b = t.closest('[data-hpf-lock]'))) {
                var lid = b.getAttribute('data-hpf-lock');
                explainLock(lid, ctx, function () { work.forEach(function (w) { if (w.id === lid) w.on = true; }); dirty = true; }, function () { openPanel({ work: work, dirty: dirty }); });
            }
        });
        // THE BACKDROP closes as Done does (the change is kept, as with the Tools sheet).
        var back = panelRoot().querySelector('.hpf-back');
        if (back) { back.removeEventListener('click', closePanel); back.addEventListener('click', finish); }
        dragReorder(sh, function () { return work; }, function (next) { work = next; dirty = true; draw(); });
        return sh;
    }
    // DRAG TO REORDER: press the handle, move, let go. The row follows the finger; the list
    // takes the new order on release. Keyboard: Up / Down on a focused handle moves one place.
    function dragReorder(sh, get, set) {
        var drag = null;
        sh.addEventListener('pointerdown', function (e) {
            var g = e.target && e.target.closest && e.target.closest('.hpf-grab');
            if (!g) return;
            var row = g.closest('.hpf-row'); if (!row) return;
            e.preventDefault();
            var rows = Array.prototype.slice.call(sh.querySelectorAll('.hpf-list > .hpf-row'));
            drag = { id: row.getAttribute('data-hpf-row'), row: row, y0: e.clientY, mids: rows.map(function (r) { var b = r.getBoundingClientRect(); return { id: r.getAttribute('data-hpf-row'), mid: b.top + b.height / 2 }; }) };
            row.classList.add('hpf-lift');
            try { sh.setPointerCapture(e.pointerId); } catch (x) {}
        });
        sh.addEventListener('pointermove', function (e) { if (!drag) return; drag.row.style.transform = 'translateY(' + (e.clientY - drag.y0) + 'px)'; });
        var end = function (e) {
            if (!drag) return;
            var y = e.clientY, d = drag; drag = null;
            d.row.classList.remove('hpf-lift'); d.row.style.transform = '';
            var ids = d.mids.map(function (m) { return m.id; }).filter(function (id) { return id !== d.id; });
            var at = d.mids.filter(function (m) { return m.id !== d.id && m.mid < y; }).length;
            ids.splice(at, 0, d.id);
            var w = get(), byIdW = {}; w.forEach(function (x) { byIdW[x.id] = x; });
            var next = ids.map(function (id) { return byIdW[id]; }).filter(Boolean);
            w.forEach(function (x) { if (next.indexOf(x) === -1) next.push(x); });
            if (next.map(function (x) { return x.id; }).join() !== w.map(function (x) { return x.id; }).join()) set(next);
        };
        sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
        sh.addEventListener('keydown', function (e) {
            var g = e.target && e.target.closest && e.target.closest('.hpf-grab'); if (!g) return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            var id = g.closest('.hpf-row').getAttribute('data-hpf-row'), w = get().slice(), i = w.map(function (x) { return x.id; }).indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
            if (i < 0 || j < 0 || j >= w.length) return;
            var t = w[i]; w[i] = w[j]; w[j] = t; set(w);
            var g2 = sh.querySelector('[data-hpf-row="' + id + '"] .hpf-grab'); if (g2) g2.focus();
        });
    }
    // TAPPING A LOCK EXPLAINS, NEVER NAGS: what it is, which plan has it, the free tries left.
    // "Try a free one" turns it on (only while tries are left); "Not now" goes back. Nothing
    // here opens a store or asks again on its own.
    function explainLock(id, ctx, tryIt, back) {
        var d = byId[id]; if (!d) return;
        if (typeof d.lockedTap === 'function') { try { d.lockedTap(ctx); return; } catch (e) {} }
        var left = ctx.usesLeft(id), tier = TIERS[d.tier] || 'a paid plan';
        // def.unit names one free use ('scan' -> "3 free scans", "Try a free scan"; Manny's wording, 2026-10-24).
        var unit = d.unit ? String(d.unit) : 'try', units = unit === 'try' ? 'tries' : unit + 's';
        var sh = openSheet('<div class="hpf-expl"><h3>' + esc((d.icon ? d.icon + ' ' : '') + d.label) + '</h3><p>' + esc(d.sub || '') + '</p>'
            + '<p>Part of the ' + esc(tier) + ' plan.' + (Number(d.freeUses) > 0 ? (left > 0 ? ' You have <b>' + left + ' free ' + esc(left === 1 ? unit : units) + '</b> to try it.' : ' Your free ' + esc(units) + ' are used up.') : '') + '</p>'
            + (left > 0 ? '<button type="button" class="hpf-b1" data-hpf-try>Try a free ' + esc(unit === 'try' ? 'one' : unit) + '</button>' : '')
            + '<button type="button" class="hpf-b2" data-hpf-notnow>Not now</button></div>');
        sh.addEventListener('click', function (e) {
            if (e.target.closest('[data-hpf-try]')) { tryIt(); back(); }
            else if (e.target.closest('[data-hpf-notnow]')) back();
        });
    }

    // proposeScores: ONE confirm step for any number of scores - one hole (voice) or a whole
    // scanned card (every golfer x 18 holes) - then each one through the card's own save
    // (host.saveScore -> index.html gpsSheetHole(n).save -> saveScore -> the offline queue).
    // A feature never writes a score. The same golfer + hole twice: the later one is used.
    // Resolves true when every score saved, false when cancelled or any save failed.
    // phone3: SIRI / VOICE WITH THE ROUND OPEN BUT NOT THE GPS SCREEN (the card, Home's round): no
    // mounted host, so the confirm uses the CARD's own save directly - the same call gps-view.js's host
    // makes (index.html gpsSheetHole(n).save -> saveScore -> the offline queue). Read-only otherwise.
    /* global gpsSheetHole, currentData, currentMode */
    function pageHost() {
        try {
            if (typeof gpsSheetHole !== 'function' || typeof currentData === 'undefined' || !currentData) return null;
            return {
                round: function () { return currentData; },
                code: function () { try { return String(currentMode || ''); } catch (e) { return ''; } },
                saveScore: function (pid, hole, v) { gpsSheetHole(Number(hole)).save(pid, v); }
            };
        } catch (e) { return null; }
    }
    function proposeScores(listIn, opts) {
        var seen = {}, list = [];
        (Array.isArray(listIn) ? listIn : []).forEach(function (s) {
            if (!(s && s.pid != null && Number(s.hole) > 0 && Number(s.hole) <= 36 && Number(s.strokes) > 0 && Number(s.strokes) < 20)) return;
            var k = String(s.pid) + '_' + Number(s.hole);
            if (seen[k] != null) list[seen[k]] = s; else { seen[k] = list.length; list.push(s); }
        });
        var h = host || pageHost();
        if (!list.length || !h || typeof h.saveScore !== 'function') return Promise.resolve(false);
        var d = (h.round && h.round()) || {};
        var nameOf = function (pid) { var p = (d.players || []).filter(function (x) { return String(x.id) === String(pid); })[0]; return p ? p.name : 'Golfer'; };
        // Shown as a card: one line per golfer, their holes in order ("1:4 2:5 ..."), so a whole
        // scanned card is one screen to check and one tap to save.
        var byP = {}, order = [];
        list.forEach(function (s) { var k = String(s.pid); if (!byP[k]) { byP[k] = []; order.push(k); } byP[k].push(s); });
        var holes = {}; list.forEach(function (s) { holes[Number(s.hole)] = 1; });
        var nH = Object.keys(holes).length;
        return new Promise(function (resolve) {
            var src = opts && opts.source ? String(opts.source) : '';
            var body = order.map(function (k) {
                var hs = byP[k].slice().sort(function (a, b) { return a.hole - b.hole; });
                var tot = hs.reduce(function (t, s) { return t + Number(s.strokes); }, 0);
                return '<div class="hpf-ps-p"><div class="hpf-lb-r"><b>' + esc(nameOf(k)) + '</b><span>' + (hs.length > 1 ? hs.length + ' holes · ' + tot : '') + '</span></div>'
                    + '<div class="hpf-ps-h">' + hs.map(function (s) { return '<span><small>' + Number(s.hole) + '</small>' + Number(s.strokes) + (s.putts != null ? '<i>' + Number(s.putts) + 'p</i>' : '') + '</span>'; }).join('') + '</div></div>';
            }).join('');
            var sh = openSheet('<div class="hpf-expl"><h3>Save ' + (list.length === 1 ? 'this score' : list.length + ' scores') + '?</h3>'
                + '<p class="hpf-dim">' + (src ? 'From ' + esc(src) + '. ' : '') + (nH > 1 ? nH + ' holes, ' : '') + order.length + ' golfer' + (order.length === 1 ? '' : 's') + '. Check before saving.</p>'
                + body
                + '<button type="button" class="hpf-b1" data-hpf-save>Save ' + (list.length === 1 ? '' : 'all ' + list.length) + '</button><button type="button" class="hpf-b2" data-hpf-cancel>Cancel</button></div>');
            sh.setAttribute('data-hpf-propose', String(list.length));
            sh.addEventListener('click', function (e) {
                if (e.target.closest('[data-hpf-save]')) {
                    var bad = 0;
                    list.forEach(function (s) { try { h.saveScore(s.pid, Number(s.hole), Number(s.strokes)); } catch (x) { bad++; } });
                    closePanel(); resolve(bad === 0);
                } else if (e.target.closest('[data-hpf-cancel]')) { closePanel(); resolve(false); }
            });
        });
    }
    // Siri / App Intents (native): the same confirm, through one page event.
    try { W.addEventListener('hardpan:propose-scores', function (e) { var dt = e && e.detail || {}; proposeScores(dt.scores || dt, { source: dt.source || 'voice' }); }); } catch (e) {}

    // ---- THE ONE-TIME HINT (first round on the GPS screen; never again after it shows) ----
    function maybeHint() {
        try {
            if (!host || !host.el || !host.under) return;
            if (W.localStorage.getItem(HINT_KEY)) return;
            if (W.__hardpanNoHint) return;
            var u = host.under(); if (!u || u.querySelector('.hpf-hint')) return;
            W.localStorage.setItem(HINT_KEY, String(Date.now()));
            var h = document.createElement('div'); h.className = 'hpf-hint hpf-slot'; h.setAttribute('role', 'status');
            h.innerHTML = '<button type="button" class="hpf-hint-go">✎ Make this screen yours: Tools ▸ Customize</button><button type="button" class="hpf-hint-x" aria-label="Dismiss">✕</button>';
            var gone = function () { try { h.remove(); } catch (e) {} };   // an overlay line: nothing is re-framed when it goes
            h.querySelector('.hpf-hint-x').addEventListener('click', gone);
            h.querySelector('.hpf-hint-go').addEventListener('click', function () { gone(); openPanel(); });
            setTimeout(gone, 12000);
            u.appendChild(h);
        } catch (e) {}
    }

    // ---- STYLE (inside #gps-overlay; z-index over the Tools sheet) ---------------------------
    function ensureCss() {
        if (document.getElementById('hpf-css')) return;
        var F = '-apple-system,BlinkMacSystemFont,system-ui,sans-serif';
        var css = ''
            + '.hpf-host{pointer-events:auto;display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:100%;}'
            + '.hpf-slot{pointer-events:auto;max-width:100%;}'
            + '.hpf-ticker{display:flex;gap:12px;overflow-x:auto;white-space:nowrap;max-width:100%;background:rgba(11,15,12,.92);color:#f4f4ef;border-radius:14px;padding:7px 10px;font:700 13px/1.2 ' + F + ';box-sizing:border-box;scrollbar-width:none;}'
            + '.hpf-ticker::-webkit-scrollbar{display:none;}.hpf-ticker b{color:#cdee7c;}'
            + '.hpf-lb{background:rgba(11,15,12,.92);color:#f4f4ef;border-radius:14px;padding:8px 10px;font:700 13px/1.5 ' + F + ';min-width:150px;box-sizing:border-box;}'
            + '.hpf-lb-1{display:flex;gap:10px;white-space:nowrap;padding:7px 10px;}'
            + '.hpf-lb-r{display:flex;justify-content:space-between;gap:12px;}.hpf-lb-r small{opacity:.6;font-weight:600;}'
            + '.hpf-live{color:#ff6b6b;font-size:11px;font-weight:900;letter-spacing:.1em;}'
            + '.hpf-chips{display:flex;gap:6px;flex-wrap:wrap;}.hpf-chips span{background:rgba(11,15,12,.92);color:#f4f4ef;border-radius:11px;padding:5px 8px;font:800 12px/1.2 ' + F + ';}'
            + '.hpf-dim{opacity:.7;font-weight:600;}'
            + '#gps-overlay .gps-ld-rail > .hpf-dock-item{display:flex;align-items:center;justify-content:center;}'
            + '.hpf-dock-item > button{all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font:800 12px/1.1 ' + F + ';gap:2px;min-width:44px;min-height:44px;text-align:center;}'
            + '.hpf-hint{display:flex;align-items:center;gap:6px;background:#cdee7c;color:#0d1a10;border-radius:14px;padding:4px 6px 4px 10px;box-shadow:0 6px 18px rgba(0,0,0,.45);}'
            + '.hpf-hint button{all:unset;cursor:pointer;font:700 14px/1.25 ' + F + ';padding:6px 2px;}.hpf-hint .hpf-hint-x{font-weight:900;opacity:.6;padding:6px 8px;}'
            + '.hpf-back{position:absolute;inset:0;z-index:60;background:rgba(0,0,0,.45);}'
            + '.hpf-sheet{position:absolute;z-index:61;left:0;right:0;bottom:0;margin:0 auto;max-width:560px;max-height:calc(100% - var(--gps-bar-b,0px) - 24px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#121614;color:#f2f5ef;border-radius:22px 22px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.55);font-family:' + F + ';padding:8px 16px calc(22px + env(safe-area-inset-bottom,0px));box-sizing:border-box;touch-action:pan-y;}'
            + 'body > .hpf-sheet,body > .hpf-back{position:fixed;}body > .hpf-back{z-index:100000;}body > .hpf-sheet{z-index:100001;}'
            + '.hpf-grip{width:40px;height:5px;border-radius:3px;background:#55605a;margin:4px auto 10px;}'
            + '.hpf-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;}.hpf-title{font-size:22px;font-weight:800;}'
            + '.hpf-done{background:#cdee7c;color:#0d1a10;border:0;border-radius:16px;font:800 15px/1 ' + F + ';padding:10px 16px;min-height:44px;}'
            + '.hpf-sub{font-size:13px;opacity:.75;margin:4px 0 8px;line-height:1.35;}'
            + '.hpf-h{font-size:12px;font-weight:800;letter-spacing:.12em;color:#a8b3ac;margin:14px 2px 6px;}'
            + '.hpf-row{display:flex;align-items:center;gap:10px;background:#1c221f;border-radius:14px;padding:8px 12px;margin-bottom:6px;min-height:52px;box-sizing:border-box;position:relative;}'
            + '.hpf-row.hpf-lift{background:#26302a;box-shadow:0 8px 20px rgba(0,0,0,.6);z-index:2;}'
            + '.hpf-grab{color:#7e8a83;font-size:22px;width:28px;min-height:44px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab;}'
            + '.hpf-ic{font-size:20px;width:26px;text-align:center;flex:none;}.hpf-txt{flex:1;min-width:0;}'
            + '.hpf-l{font-size:16px;font-weight:700;}.hpf-s{font-size:12px;opacity:.72;margin-top:2px;}'
            + '.hpf-new{display:inline-block;background:#cdee7c;color:#0d1a10;font-size:10px;font-weight:900;padding:1px 5px;border-radius:5px;margin-left:6px;vertical-align:2px;}'
            + '.hpf-sw{flex:none;width:50px;height:30px;border-radius:15px;background:#3c4541;position:relative;border:0;padding:0;}'
            + '.hpf-sw i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .15s;}'
            + '.hpf-sw.on{background:#8fd14f;}.hpf-sw.on i{left:23px;}'
            + '.hpf-lock{flex:none;display:flex;align-items:center;gap:4px;background:#2a2f2c;border:1px solid #47504b;border-radius:12px;padding:6px 8px;min-height:36px;font:800 12px/1 ' + F + ';color:#e9d27a;}'
            + '.hpf-core{flex:none;font-size:11px;font-weight:800;color:#a8b3ac;border:1px solid #47504b;border-radius:10px;padding:4px 7px;}'
            + '.hpf-note{font-size:12px;opacity:.7;margin:2px 2px 6px;line-height:1.35;}'
            + '.hpf-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;font-size:13px;}'
            + '.hpf-reset{all:unset;cursor:pointer;color:#cdee7c;font-weight:700;padding:10px 0;}'
            + '.hpf-expl h3{margin:0 0 6px;font-size:19px;}.hpf-expl p{margin:0 0 10px;font-size:14px;opacity:.85;line-height:1.4;}'
            + '.hpf-ps-p{background:#1c221f;border-radius:12px;padding:8px 10px;margin:0 0 6px;}.hpf-ps-h{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}'
            + '.hpf-ps-h span{min-width:30px;text-align:center;background:#2a302d;border-radius:8px;padding:3px 4px;font:800 14px/1.1 ' + F + ';}.hpf-ps-h small{display:block;font-size:10px;opacity:.6;font-weight:700;}.hpf-ps-h i{display:block;font-size:10px;font-style:normal;opacity:.7;}'
            + '.hpf-b1,.hpf-b2{display:block;width:100%;text-align:center;border:0;border-radius:14px;padding:13px;font:800 16px/1 ' + F + ';margin-top:8px;}'
            + '.hpf-b1{background:#cdee7c;color:#0d1a10;}.hpf-b2{background:#2a302d;color:#f2f5ef;}';
        // INSIDE #gps-overlay its own `#gps-overlay button` rule (background: transparent) outranks a
        // bare class, so every rule here is also written under #gps-overlay.
        css = css.split('}').filter(function (r) { return r.indexOf('{') > 0; }).map(function (r) {
            var i = r.indexOf('{'), sels = r.slice(0, i).split(','), body = r.slice(i);
            var all = sels.slice();
            sels.forEach(function (x) { x = x.trim(); if (x.indexOf('#gps-overlay') !== 0 && x.indexOf('body') !== 0 && x.indexOf('::') === -1) all.push('#gps-overlay ' + x); });
            return all.join(',') + body + '}';
        }).join('');
        var st = document.createElement('style'); st.id = 'hpf-css'; st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    var api = {
        register: register, list: list, sync: sync, detach: detach, shown: shown,
        openPanel: function () { return openPanel(); }, closePanel: closePanel, isPanelOpen: function () { return !!panelRoot().querySelector('.hpf-panel'); },
        prefs: function () { return normalise(loadPrefs()); }, savePrefs: savePrefs, resetPrefs: resetPrefs,
        effective: function (p) { return effective(p == null ? loadPrefs() : p, ctxNow()).map(function (x) { return { id: x.id, on: x.on, locked: x.locked, usesLeft: x.usesLeft, shows: x.shows, slot: x.def.slot }; }); },
        proposeScores: proposeScores,
        // pure, for tests and the rules proposal
        normalise: normalise, forSave: forSave, ID_RE: ID_RE, MAX_ORDER: MAX_ORDER, KEY: LKEY, HINT_KEY: HINT_KEY, remotePath: remotePath,
        _reset: function () { prefsCache = null; remoteAsked = false; notif.prefs = null; }
    };
    W.HardPanFeatures = api;
    // THE QUEUE: whatever registered before this file loaded, then every later push registers at once.
    var q = W.HardPanFeatureQueue;
    W.HardPanFeatureQueue = { push: function () { for (var i = 0; i < arguments.length; i++) register(arguments[i]); return defs.length; } };
    if (Array.isArray(q)) q.forEach(function (d) { register(d); });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
