// ============================================================================
// HARDPAN INDEX (unofficial) - mailbox 008, feature 8 (switch: HardPanFeature('hpIndex'))
//
// A handicap index worked out ON THIS PHONE from the golfer's own finished 18-hole
// rounds, the World Handicap System way. It is NOT an official handicap, it is posted
// nowhere, and nothing here writes to Firebase. HardPan only (GPS_SHELL), and part of
// the paid GPS features: a phone without GPS Map sees none of it (no pop-up).
//
// THE MATH (pure, exported for hp_index_test.js):
//   Score Differential = (113 / Slope) x (Adjusted Gross Score - Course Rating - PCC),
//     PCC = 0, rounded to the nearest tenth.
//   Adjusted Gross Score: each hole capped at NET DOUBLE BOGEY = par + 2 + the strokes
//     received on that hole, from the course handicap of the index in effect when the
//     round was played (the rounds before it). No index yet: par + 5 per hole.
//   Course Handicap = round(Index x Slope / 113 + (Course Rating - Par)).
//   Index = the average of the lowest differentials of the most recent 20, by the WHS
//     table (3: lowest 1 - 2.0; 4: lowest 1 - 1.0; 5: lowest 1; 6: lowest 2 - 1.0;
//     7-8: 2; 9-11: 3; 12-14: 4; 15-16: 5; 17-18: 6; 19: 7; 20: 8), rounded to the
//     nearest tenth, never above 54.0. Fewer than 3 rounds: no index.
//   NOT DONE: soft / hard cap, exceptional-score reduction, 9-hole rounds, PCC.
//
// WHERE THE ROUNDS COME FROM: the app keeps no cross-round, per-golfer history with
// gross per hole (stats are per round; my-groups holds names; hardpan_last_round one
// pointer). So the scorecard (index.html) hands every render to noteRound(), and once
// THIS PHONE'S golfer ("This is me" - golfapp_me_<code>; else the GPS name tag,
// hardpan_gps_golfer_<code>) has a score on all 18 holes, the round is kept here, in
// localStorage hardpan_hp_index_v1 only: code, date, course, the tee's rating / slope /
// par, and par / stroke index / gross per hole. A correction later updates it.
// The tee: the golfer's own (players/N/tee) when it is rated, else the round's
// teeRating. A round with no rating or slope is kept and listed as NOT COUNTED.
//
// MONEY IS UNTOUCHED: the Round Setup chip only types a number into the handicap box,
// exactly as a golfer would. handicap.js is not read or changed.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_hp_index_v1';
    var MAX_KEPT = 60;
    var LABEL = 'HardPan Index (unofficial)';
    var NEED = 'Play 3 rounds to get a HardPan Index';

    // ---- PURE ----------------------------------------------------------------------
    function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
    // To the nearest tenth, half away from zero (12.35 -> 12.4, -1.25 -> -1.3).
    function r1(x) {
        var s = x < 0 ? -1 : 1, v = s * Math.round(Math.abs(x) * 10 + 1e-9) / 10;
        return v === 0 ? 0 : v;
    }
    // WHS: how many of the lowest differentials count, and the adjustment, by round count.
    function table(n) {
        if (n < 3) return null;
        if (n === 3) return { use: 1, adj: -2.0 };
        if (n === 4) return { use: 1, adj: -1.0 };
        if (n === 5) return { use: 1, adj: 0 };
        if (n === 6) return { use: 2, adj: -1.0 };
        if (n <= 8) return { use: 2, adj: 0 };
        if (n <= 11) return { use: 3, adj: 0 };
        if (n <= 14) return { use: 4, adj: 0 };
        if (n <= 16) return { use: 5, adj: 0 };
        if (n <= 18) return { use: 6, adj: 0 };
        if (n === 19) return { use: 7, adj: 0 };
        return { use: 8, adj: 0 };
    }
    // diffs: most recent FIRST. Only the 20 most recent are read.
    function indexFrom(diffs) {
        var recent = (diffs || []).filter(function (d) { return typeof d === 'number' && isFinite(d); }).slice(0, 20);
        var t = table(recent.length);
        if (!t) return null;
        var low = recent.slice().sort(function (a, b) { return a - b; }).slice(0, t.use);
        var avg = low.reduce(function (a, b) { return a + b; }, 0) / low.length;
        return { index: Math.min(54, r1(avg + t.adj)), rounds: recent.length, used: t.use, adj: t.adj };
    }
    function courseHandicap(index, slope, rating, par) {
        if (index == null || !(slope > 0) || rating == null || par == null) return null;
        return Math.round(index * slope / 113 + (rating - par));
    }
    // Strokes received on a hole of stroke index si (1 = hardest) with course handicap ch.
    // A plus handicap gives strokes back from the easiest holes (si 18 first). A hole with
    // no stroke index gets only the whole-round share (ch / 18, rounded down).
    function strokesOnHole(ch, si) {
        if (!ch) return 0;
        var n = Math.abs(ch), base = Math.floor(n / 18), rem = n % 18, ok = si >= 1 && si <= 18 && Math.floor(si) === si;
        var extra = !ok ? 0 : (ch > 0 ? (si <= rem ? 1 : 0) : (si > 18 - rem ? 1 : 0));
        return ch > 0 ? base + extra : (base + extra ? -(base + extra) : 0);
    }
    // The most a hole can count for: net double bogey, or par + 5 with no index yet.
    function holeMax(par, si, ch) { return ch == null ? par + 5 : par + 2 + strokesOnHole(ch, si); }
    function teeOf(rec) {
        var t = (rec && rec.tee) || {};
        var par = num(t.par);
        if (par == null) par = (rec.holes || []).reduce(function (a, h) { return a + (num(h.par) || 0); }, 0) || null;
        return { slope: num(t.slope), rating: num(t.rating), par: par, name: String(t.name || '') };
    }
    // Why a kept round does not count, or '' when it does.
    function skipReason(rec) {
        var holes = (rec && rec.holes) || [];
        if (holes.length !== 18) return 'not an 18-hole round';
        if (holes.some(function (h) { return !(num(h.gross) > 0) || !(num(h.par) >= 3); })) return 'not every hole has a score';
        var t = teeOf(rec);
        if (!(t.slope >= 55 && t.slope <= 155) || !(t.rating > 0)) return 'no course rating / slope for that tee';
        return '';
    }
    // One round: { ok, diff, ags, gross, ch } with priorIndex the index in effect (or null).
    function differential(rec, priorIndex) {
        var why = skipReason(rec);
        if (why) return { ok: false, reason: why };
        var t = teeOf(rec);
        var ch = priorIndex == null ? null : courseHandicap(priorIndex, t.slope, t.rating, t.par);
        var gross = 0, ags = 0;
        rec.holes.forEach(function (h) {
            var g = num(h.gross), p = num(h.par);
            gross += g;
            ags += Math.min(g, holeMax(p, num(h.si), ch));
        });
        return { ok: true, diff: r1((113 / t.slope) * (ags - t.rating - 0)), ags: ags, gross: gross, ch: ch };
    }
    // Every kept round, oldest first; each scored with the index the rounds before it give.
    function compute(rounds) {
        var list = (rounds || []).slice().sort(function (a, b) { return (num(a.at) || 0) - (num(b.at) || 0) || String(a.code).localeCompare(String(b.code)); });
        var counted = [], skipped = [];
        list.forEach(function (rec) {
            var prior = indexFrom(counted.map(function (c) { return c.diff; }).reverse());
            var d = differential(rec, prior ? prior.index : null);
            if (!d.ok) { skipped.push({ code: rec.code, course: rec.course || '', at: rec.at, reason: d.reason }); return; }
            counted.push({ code: rec.code, course: rec.course || '', at: rec.at, diff: d.diff, ags: d.ags, gross: d.gross, ch: d.ch });
        });
        var fin = indexFrom(counted.map(function (c) { return c.diff; }).reverse());
        return { index: fin ? fin.index : null, text: fin ? fmt(fin.index) : '', rounds: fin ? fin.rounds : counted.length, used: fin ? fin.used : 0,
            counted: counted.length, need: Math.max(0, 3 - counted.length), skipped: skipped, differentials: counted };
    }
    // 12.4 -> "12.4"; a plus index (-1.2) -> "+1.2".
    function fmt(index) { if (index == null) return ''; return (index < 0 ? '+' : '') + Math.abs(index).toFixed(1); }

    // ---- STORAGE (this phone only) ---------------------------------------------------
    function ls() { try { return W.localStorage || null; } catch (e) { return null; } }
    function readStore() {
        var s = ls(); if (!s) return { v: 1, rounds: [] };
        try { var v = JSON.parse(s.getItem(KEY) || 'null'); if (v && v.v === 1 && Array.isArray(v.rounds)) return v; } catch (e) {}
        return { v: 1, rounds: [] };
    }
    function writeStore(st) { var s = ls(); if (!s) return false; try { s.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; } }
    function rounds() { return readStore().rounds; }
    function featureOn() { return typeof W.HardPanFeature === 'function' && W.HardPanFeature('hpIndex') === true; }
    // The golfer this phone is in a round: "This is me", else the GPS name tag.
    function meIn(code, meId) {
        if (meId != null && meId !== '') return String(meId);
        var s = ls(); if (!s) return null;
        try { return s.getItem('golfapp_me_' + code) || s.getItem('hardpan_gps_golfer_' + code) || null; } catch (e) { return null; }
    }
    // The round as kept, or null while it is not a finished 18 for this phone's golfer.
    function roundRecord(code, data, meId) {
        if (!code || !data || !Array.isArray(data.players)) return null;
        if (String(data.gameFormat || '') === 'scramble') return null;   // a team score, not the golfer's own
        var id = meIn(code, meId); if (id == null) return null;
        var p = data.players.filter(function (q) { return q && String(q.id) === String(id); })[0];
        if (!p) return null;
        var cd = (data.courseData || []).filter(function (h) { return h && h.hole; }).slice().sort(function (a, b) { return Number(a.hole) - Number(b.hole); });
        if (cd.length !== 18) return null;
        var sc = data.scores || {};
        var holes = cd.map(function (h) { return { n: Number(h.hole), par: num(h.par), si: num(h.hcpIndex), gross: num(sc['p' + p.id + '_h' + h.hole]) || 0 }; });
        if (holes.some(function (h) { return !(h.gross > 0); })) return null;
        var own = p.tee && (num(p.tee.slope) != null || num(p.tee.courseRating) != null) ? p.tee : null;
        var t = own || data.teeRating || {};
        return { code: String(code), course: String(data.courseName || data.eventName || ''), name: String(p.name || ''), pid: String(p.id),
            tee: { name: String(t.teeName || t.name || ''), slope: num(t.slope), rating: num(t.courseRating), par: num(t.par) }, holes: holes };
    }
    // Called by the scorecard on every render. Writes only when something changed.
    // 020: a round kept out of My stats (gps-stats.js: hardpan_nostats_<code> = practice / removed).
    function skippedRound(code) { var s = ls(); if (!s || !code) return false; try { return !!s.getItem('hardpan_nostats_' + code); } catch (e) { return false; } }
    function removeRound(code) {
        var st = readStore(), n = st.rounds.length;
        st.rounds = st.rounds.filter(function (r) { return !r || String(r.code) !== String(code); });
        return st.rounds.length !== n ? writeStore(st) : false;
    }
    function clear() { var s = ls(); if (!s) return false; try { s.removeItem(KEY); return true; } catch (e) { return false; } }
    function noteRound(code, data, meId) {
        if (!featureOn()) return false;
        if (skippedRound(code)) return false;
        var rec = roundRecord(code, data, meId);
        if (!rec) return false;
        var st = readStore(), at = -1;
        st.rounds.forEach(function (r, i) { if (r && r.code === rec.code) at = i; });
        rec.at = at >= 0 && st.rounds[at].at ? st.rounds[at].at : Date.now();
        if (at >= 0 && JSON.stringify(st.rounds[at]) === JSON.stringify(rec)) return false;
        if (at >= 0) st.rounds[at] = rec; else st.rounds.push(rec);
        st.rounds.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
        if (st.rounds.length > MAX_KEPT) st.rounds = st.rounds.slice(-MAX_KEPT);
        return writeStore(st);
    }
    function current() { return compute(rounds()); }
    // The golfer's name on the most recent kept round (the chip in Round Setup matches it).
    function ownName() { var r = rounds(); return r.length ? String(r[r.length - 1].name || '') : ''; }

    // ---- THE GATE: the switch, then GPS Map (quiet - never a paywall) ------------------
    function cfg() { return W.HARDPAN_GPS_CONFIG || {}; }
    function loadScript(src, have, done) {
        if (have()) { done(); return; }
        var d = W.document;
        if (!d || typeof d.createElement !== 'function' || !(d.head || d.body)) { done(); return; }
        var s = d.createElement('script'); s.src = src;
        s.onload = function () { done(); }; s.onerror = function () { done(); };
        (d.head || d.body).appendChild(s);
    }
    // admin.html does not load the GPS config at boot (it loads it when a course needs it),
    // so it is loaded here only when the index is about to be shown.
    function ensureLoaded(done) {
        loadScript('gps-config.js', function () { return typeof W.HardPanFeature === 'function'; }, function () {
            if (!featureOn() || cfg().iap !== true || W.HardPanGps) { done(); return; }
            loadScript('gps-entitlement.js', function () { return !!W.HardPanEntitlement; }, done);
        });
    }
    function gate(cb) {
        ensureLoaded(function () {
            if (!featureOn()) { cb(false); return; }
            var V = W.HardPanGps;
            if (V && typeof V.requireGps === 'function') { V.requireGps({ quiet: true }, function () { cb(true); }, function () { cb(false); }); return; }
            var E = W.HardPanEntitlement, c = cfg();
            if (c.iap === true) { if (!E || !E.enabled()) { cb(false); return; } E.whenKnown(function (p) { cb(!!p); }, 4000); return; }
            cb(c.paywall !== true);
        });
    }

    // ---- THE WORDS (every UI string this feature shows; hp_index_test.js scans them) ----
    var HOW = 'Each finished 18-hole round you score as yourself on this phone gives a score differential: '
        + '(113 ÷ slope) × (adjusted score − course rating). The adjusted score caps every hole at net double bogey '
        + '(par + 2 + the strokes you get on that hole), or par + 5 until you have an index. Your index is the average of your '
        + 'best 8 of your last 20 differentials (with fewer rounds, fewer count), to one decimal, '
        + 'never above 54.0. A round with no course rating or slope for its tee is not counted. It is worked out on this phone, '
        + 'is not an official handicap and is not posted anywhere.';
    var WORDS = { label: LABEL, need: NEED, how: 'How it’s worked out', howText: HOW,
        based: function (n) { return 'based on ' + n + ' round' + (n === 1 ? '' : 's'); },
        sofar: function (n) { return n + ' of 3 rounds so far.'; },
        skipped: function (s) { return 'Not counted: ' + (s.course || 'a round') + ' — ' + s.reason + '.'; },
        chip: function (text, strokes) { return 'Use my ' + LABEL + ': ' + text + (strokes != null ? ' → ' + strokes : ''); } };

    // ---- ACCOUNT (admin.html #account-modal) ------------------------------------------
    function el(tag, cls, text) { var e = W.document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function accountCard(res) {
        var card = el('section', 'email-link-card hp-index-card');
        card.id = 'hp-index-card';
        card.appendChild(el('h2', null, LABEL));
        if (res.index != null) {
            var big = el('p', 'hp-index-value'); big.style.cssText = 'font-size:2rem;font-weight:800;margin:4px 0;color:var(--brand-green);';
            big.textContent = res.text; card.appendChild(big);
            card.appendChild(el('p', 'hp-index-based', WORDS.based(res.rounds)));
        } else {
            card.appendChild(el('p', 'hp-index-need', NEED));
            card.appendChild(el('p', 'hp-index-based', WORDS.sofar(res.counted)));
        }
        res.skipped.forEach(function (s) { var p = el('p', 'hp-index-skipped', WORDS.skipped(s)); p.style.cssText = 'font-size:0.8rem;color:var(--text-muted);'; card.appendChild(p); });
        var det = el('details', 'hp-index-how'), sum = el('summary', null, WORDS.how), p2 = el('p', null, HOW);
        p2.style.cssText = 'font-size:0.8rem;color:var(--text-muted);';
        det.appendChild(sum); det.appendChild(p2); card.appendChild(det);
        return card;
    }
    function showInAccount() {
        var d = W.document; if (!d || typeof d.getElementById !== 'function') return;
        var modal = d.getElementById('account-modal'); if (!modal) return;
        gate(function (ok) {
            var old = d.getElementById('hp-index-card');
            if (!ok) { if (old && old.parentNode) old.parentNode.removeChild(old); return; }
            var card = accountCard(current());
            if (old && old.innerHTML === card.innerHTML) return;   // the panel is watched: no needless writes
            if (old && old.parentNode) { old.parentNode.replaceChild(card, old); return; }
            var anchor = d.getElementById('lobby-standing'), host = modal.querySelector('.modal-content') || modal;
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling); else host.appendChild(card);
        });
    }

    // ---- ROUND SETUP CHIP (admin.html #player-list) -----------------------------------
    function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function domNum(d, id) { var e = d.getElementById(id); return e ? num(String(e.value == null ? '' : e.value).trim()) : null; }
    var chipGate = null;   // null = not asked yet; true / false once asked this page
    function syncChips() {
        var d = W.document; if (!d || typeof d.getElementById !== 'function') return;
        var list = d.getElementById('player-list'); if (!list || typeof list.querySelectorAll !== 'function') return;
        var res = rounds().length ? current() : null, me = norm(ownName());
        var want = !!(res && res.index != null && me);
        var drop = function () { Array.prototype.forEach.call(list.querySelectorAll('.hp-index-chip'), function (c) { if (c.parentNode) c.parentNode.removeChild(c); }); };
        if (!want) { drop(); return; }
        if (chipGate === null) { chipGate = 'asking'; gate(function (ok) { chipGate = ok; syncChips(); }); return; }
        if (chipGate !== true) { drop(); return; }
        var basis = d.getElementById('handicap-basis-select'), indexMode = !!(basis && basis.value === 'ghin-index');
        var strokes = indexMode ? null : courseHandicap(res.index, domNum(d, 'tee-slope'), domNum(d, 'tee-course-rating'), domNum(d, 'tee-par'));
        if (!indexMode && strokes == null) strokes = Math.round(res.index);
        var fill = indexMode ? res.text : (strokes < 0 ? '+' + Math.abs(strokes) : String(strokes));
        var text = WORDS.chip(res.text, indexMode ? null : fill);
        Array.prototype.forEach.call(list.querySelectorAll('.player-row'), function (row) {
            var name = row.querySelector('.p-name-input'), box = row.querySelector('.p-hcp-input'), chip = row.querySelector('.hp-index-chip');
            var mine = !!(name && box && norm(name.value) === me);
            if (!mine) { if (chip && chip.parentNode) chip.parentNode.removeChild(chip); return; }
            if (!chip) {
                chip = el('button', 'hp-index-chip'); chip.type = 'button';
                chip.style.cssText = 'grid-column:2 / -1;grid-row:3;justify-self:start;min-height:32px;margin:2px 0 4px;padding:4px 12px;border-radius:999px;border:1px solid var(--brand-green);background:var(--bg-card);color:var(--brand-green);font-weight:800;font-size:0.8rem;cursor:pointer;';
                chip.onclick = function () {
                    var b = row.querySelector('.p-hcp-input'); if (!b) return;
                    b.value = chip.getAttribute('data-fill') || '';
                    try { b.dispatchEvent(new W.Event('input', { bubbles: true })); } catch (e) {}
                };
                row.appendChild(chip);
            }
            if (chip.textContent !== text) chip.textContent = text;
            if (chip.getAttribute('data-fill') !== fill) chip.setAttribute('data-fill', fill);
        });
    }
    function wireSetup() {
        var d = W.document; if (!d || typeof d.addEventListener !== 'function') return;
        d.addEventListener('input', function (e) { var t = e && e.target; if (t && t.classList && (t.classList.contains('p-name-input'))) syncChips(); }, true);
        d.addEventListener('change', function (e) { var t = e && e.target; if (t && t.id === 'handicap-basis-select') setTimeout(syncChips, 0); }, true);
        var list = d.getElementById && d.getElementById('player-list');
        if (list && typeof W.MutationObserver === 'function') new W.MutationObserver(function () { syncChips(); }).observe(list, { childList: true });
        syncChips();
    }
    if (W.document && typeof W.document.addEventListener === 'function') {
        if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', wireSetup); else setTimeout(wireSetup, 0);
    }

    var api = { r1: r1, table: table, indexFrom: indexFrom, courseHandicap: courseHandicap, strokesOnHole: strokesOnHole, holeMax: holeMax,
        skipReason: skipReason, differential: differential, compute: compute, fmt: fmt, roundRecord: roundRecord,
        noteRound: noteRound, rounds: rounds, current: current, ownName: ownName, gate: gate, removeRound: removeRound, clear: clear,
        showInAccount: showInAccount, syncChips: syncChips, WORDS: WORDS, KEY: KEY, LABEL: LABEL };
    W.HardPanIndex = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
