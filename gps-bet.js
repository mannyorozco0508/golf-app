// ============================================================================
// HARDPAN - ONE "+ BET" BUTTON AND THE LIVE MONEY CHIP (mailbox 017, part B)
//
// Behind features.simpleFlow (gps-config.js). OFF: nothing here draws anything, and
// Matches -> Side Bets / Challenge Somebody / New Action are the only ways to a bet.
//
// THE SHEET, three taps (the 017 mockup):
//   1  a game tile - Match (1v1 / 2v2), Nassau, Hi-Lo (ONLY when hilo-engine.js is
//      loaded - the 016 module; otherwise no tile), Skins, More games (the full
//      New Action page);
//   2  who's in - your group first, "Anyone in the field" for the rest; the tap order
//      makes the sides (the first two = your side in a 2v2), with a live
//      "Bob + Manny vs Skeens + Paul" line;
//   3  the stake chips, Net / Gross, "Counts from: Hole N (now)", "Worst case for
//      you: -$X", and Start bet.
//
// NO NEW MONEY. A match, Nassau or Hi-Lo is written by challenges.js
// sideMatchPayloadFromTerms - THE payload builder sidematches.html saveSideMatch()
// (New Action) and an accepted challenge already share - to the same path
// (events/<code>/sideMatches/<push key>). Skins is the same entry New Action's
// saveFieldAction writes to events/<code>/additionalGameInstances. Every bet is then
// priced by its existing engine. The same permission rules as New Action: a group
// link may only start a skins game inside its group, and a match must include one
// of its golfers; the bare link of a multi-group round (a spectator) starts nothing.
//
// THE CHIP: "You: +$12 · 3 bets" - computeCombinedNetTotals (settlement-engine.js,
// the number the Results page and Finish show), read only, for this phone's golfer.
// Tap = Bets.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    function on() {
        try { return typeof window.HardPanFeature === 'function' && window.HardPanFeature('simpleFlow') !== false && ((window.HARDPAN_GPS_CONFIG || {}).features || {}).simpleFlow === true; } catch (e) { return false; }
    }
    function hiloHere() { return typeof window.hiloShapeOk === 'function' && typeof window.hiloForSideMatch === 'function'; }

    // ---- THE ROUND (index.html's globals, read at call time) -------------------
    /* global currentData, currentMode, db, lockedGroup, hasGroupLock, resolvedMeId, durableWrite, playerGroupMap, sideMatchStartHole,
       sideMatchPayloadFromTerms, computeCombinedNetTotals, getRoundGames, uiToast, uiRefuse, uiFail, hpSpectating */
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function code() { try { return typeof currentMode !== 'undefined' ? currentMode : null; } catch (e) { return null; } }
    function locked() { try { return typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup ? Number(lockedGroup) : null; } catch (e) { return null; } }
    function meId() { try { return typeof resolvedMeId === 'function' ? resolvedMeId() : null; } catch (e) { return null; } }
    function players() { var d = data(); return (d && d.players) || []; }
    function groupMap() {
        var d = data() || {};
        try { return typeof playerGroupMap === 'function' ? playerGroupMap(d.players || [], d.groupSizeOverrides || {}) : {}; } catch (e) { return {}; }
    }
    function groupCount() { var m = groupMap(), seen = {}; Object.keys(m).forEach(function (k) { seen[m[k]] = 1; }); return Object.keys(seen).length; }
    function myGroup() {
        var g = locked(); if (g) return g;
        var me = meId(), m = groupMap();
        return me && m[me] != null ? Number(m[me]) : 1;
    }
    function first(p) { return String((p && p.name) || '').trim().split(/\s+/)[0]; }
    function byId(id) { return players().filter(function (p) { return String(p.id) === String(id); })[0] || null; }
    function holes() { var d = data() || {}; return (d.courseData || []).slice().sort(function (a, b) { return a.hole - b.hole; }); }
    function money(n) { var v = Math.round(Math.abs(n)); return (n > 0.005 ? '+' : (n < -0.005 ? '−' : '')) + '$' + v; }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---- THE GAMES ------------------------------------------------------------
    // kind: 'side' = a sideMatches record (sideMatchPayloadFromTerms); 'skins' = an
    // additionalGameInstances entry (New Action's saveFieldAction shape).
    var GAMES = {
        match:  { label: 'Match', sub: '1v1 / 2v2', kind: 'side', stakeWord: '$ a side', chips: [5, 10, 20] },
        nassau: { label: 'Nassau', sub: 'F9 / B9 / 18', kind: 'side', stakeWord: '$ each nine + 18', chips: [2, 5, 10] },
        hilo:   { label: 'Hi-Lo', sub: '2v2 · low + high ball', kind: 'side', stakeWord: '$ per point', chips: [1, 5, 10] },
        skins:  { label: 'Skins', sub: '$ per golfer', kind: 'skins', stakeWord: '$ each', chips: [5, 10, 20] }
    };
    function tiles() { return ['match', 'nassau'].concat(hiloHere() ? ['hilo'] : []).concat(['skins']); }

    // ---- WHAT A PICK MAKES ------------------------------------------------------
    // The tap order: Match / Nassau with two = 1v1 (first vs second), four = 2v2
    // (first two vs the last two). Hi-Lo: four. Skins: two or more, one pot.
    function shapeOf(game, picks) {
        var n = picks.length;
        if (game === 'skins') return n >= 2 ? { ok: true, all: picks.slice() } : { ok: false, why: 'Tap at least two golfers' };
        if (game === 'hilo') {
            if (n !== 4) return { ok: false, why: n < 4 ? 'Tap ' + (4 - n) + ' more (Hi-Lo is 2v2)' : 'Hi-Lo is 2v2 - four golfers' };
            return { ok: true, a: picks.slice(0, 2), b: picks.slice(2, 4) };
        }
        if (n === 2) return { ok: true, a: [picks[0]], b: [picks[1]] };
        if (n === 4) return { ok: true, a: picks.slice(0, 2), b: picks.slice(2, 4) };
        if (n < 2) return { ok: false, why: 'Tap ' + (2 - n) + ' more' };
        if (n === 3) return { ok: false, why: 'Tap one more for a 2v2' };
        return { ok: false, why: 'A match is 1v1 or 2v2' };
    }
    function vsLine(game, picks) {
        if (!picks.length) return '';
        var sh = shapeOf(game, picks);
        var nm = function (ids) { return ids.map(function (id) { return first(byId(id)); }).join(' + '); };
        if (game === 'skins') return picks.map(function (id) { return first(byId(id)); }).join(' · ');
        if (sh.ok) return '<b>' + esc(nm(sh.a)) + '</b> vs <b>' + esc(nm(sh.b)) + '</b>';
        var half = (picks.length >= 3 || game === 'hilo') ? 2 : 1;
        return '<b>' + esc(nm(picks.slice(0, half))) + '</b>' + (picks.length > half ? ' vs <b>' + esc(nm(picks.slice(half))) + '</b>' : ' vs …');
    }
    // Where the bet starts: the first hole nobody in it has posted (action-model.js, as New Action).
    function startHole(ids) {
        var parts = players().filter(function (p) { return ids.indexOf(String(p.id)) > -1; });
        var d = data() || {};
        try { return typeof sideMatchStartHole === 'function' ? sideMatchStartHole(parts.length ? parts : players(), holes(), d.scores || {}) : 1; } catch (e) { return 1; }
    }
    // WORST CASE, per golfer, before presses - words only, never money that moves.
    // Match: the side's stake, split between its golfers (settlement splits per side).
    // Nassau: front + back + 18, split. Hi-Lo: 2 points a hole x the holes left x the
    // stake, split between two. Skins: the buy-in.
    function worstCase(game, stake, sh, from) {
        var me = meId(), side = null;
        if (sh.ok && sh.a && me) side = sh.a.indexOf(me) > -1 ? sh.a : (sh.b.indexOf(me) > -1 ? sh.b : null);
        var per = (side || (sh.a || [1])).length || 1;
        var left = holes().filter(function (h) { return h.hole >= from; }).length;
        var amt;
        if (game === 'skins') amt = stake;
        else if (game === 'nassau') amt = stake * 3 / per;
        else if (game === 'hilo') amt = 2 * left * stake / per;
        else amt = stake / per;
        var mine = game === 'skins' ? (sh.all || []).indexOf(me) > -1 : !!side;
        return { amount: Math.round(amt), mine: mine, presses: game === 'match' || game === 'nassau' };
    }

    // ---- PERMISSIONS, the same as New Action ----------------------------------
    function refuseWhy(game, ids) {
        try { if (typeof hpSpectating === 'function' && hpSpectating()) return 'You are watching this round - a scorekeeper starts bets.'; } catch (e) {}
        var g = locked(), m = groupMap();
        if (!g) {
            // A bare link on a multi-group round is a spectator's unless it is the organizer's.
            return null;
        }
        if (game === 'skins') {
            if (!ids.every(function (id) { return String(m[id]) === String(g); })) return 'This is Group ' + g + '’s link, so a skins game here can only include Group ' + g + ' golfers.';
            return null;
        }
        if (!ids.some(function (id) { return String(m[id]) === String(g); })) return 'This is Group ' + g + '’s link, so a bet needs at least one Group ' + g + ' golfer in it.';
        return null;
    }
    function scopeOf(ids) {
        if (groupCount() < 2) return { scope: null, ownerGroup: null };
        var m = groupMap(), g0 = m[ids[0]];
        var same = ids.every(function (id) { return String(m[id]) === String(g0); });
        return same ? { scope: 'group', ownerGroup: Number(g0) } : { scope: 'cross', ownerGroup: null };
    }

    // ---- THE WRITE --------------------------------------------------------------
    // Returns { path, value } - the exact record New Action would write - or { refuse }.
    function buildBet(o) {
        var game = o.game, ids = (o.picks || []).map(String), stake = Number(o.stake) || 0;
        var sh = shapeOf(game, ids);
        if (!GAMES[game] || (game === 'hilo' && !hiloHere())) return { refuse: 'Pick a game.' };
        if (!sh.ok) return { refuse: sh.why };
        if (!(stake > 0)) return { refuse: 'Pick an amount.' };
        var why = refuseWhy(game, ids); if (why) return { refuse: why };
        var from = Number(o.startHole) || startHole(ids);
        if (!from) return { refuse: 'No holes are left to bet on.' };
        var sc = scopeOf(ids), now = Number(o.now) || Date.now(), c = code();
        if (game === 'skins') {
            var mode = o.scoring === 'net' ? 'net' : 'gross';
            var entry = { format: 'skins', enabled: true, startHole: from, createdAt: now };
            if (sc.scope) entry.scope = sc.scope;
            if (sc.scope === 'group') entry.ownerGroup = sc.ownerGroup;
            entry.skinsBuyIn = stake; entry.skinsPotFormat = mode; entry.skinsScoring = mode; entry.skinsCarryOver = false;
            if (ids.length < players().length) entry.participantIds = ids;
            return { path: 'events/' + c + '/additionalGameInstances', value: entry };
        }
        if (typeof sideMatchPayloadFromTerms !== 'function') return { refuse: 'Bets are still loading - try again in a moment.' };
        var terms = { format: game, scoring: o.scoring === 'gross' ? 'gross' : 'net', startHole: from, stake: stake, pressRule: 'none' };
        if (game === 'nassau') { terms.frontStake = stake; terms.backStake = stake; terms.overallStake = stake; terms.autoPressStake = null; }
        var payload = sideMatchPayloadFromTerms(terms, { teamAIds: sh.a, teamBIds: sh.b, startHole: from, now: now, scope: sc.scope, ownerGroup: sc.ownerGroup });
        return { path: 'events/' + c + '/sideMatches', value: payload };
    }
    function write(b) {
        var key = db.ref(b.path).push().key;
        var full = b.path + '/' + key;
        if (typeof durableWrite === 'function') return durableWrite(full, 'set', b.value, full);
        return db.ref(full).set(b.value);
    }

    // ---- THE MONEY CHIP ---------------------------------------------------------
    function moneyNow() {
        var d = data(); var me = meId();
        if (!d || !me || typeof computeCombinedNetTotals !== 'function') return null;
        var p = byId(me); if (!p) return null;
        var net = 0;
        try {
            var res = computeCombinedNetTotals(d, d.courseData || [], d.scores || {});
            var row = (res.netByName || {})[String(p.name).trim().toLowerCase()];
            net = row ? Number(row.net) || 0 : 0;
        } catch (e) { return null; }
        var n = 0;
        try {
            (typeof getRoundGames === 'function' ? getRoundGames(d) : []).forEach(function (g) {
                if (!(Number(g.stake) > 0)) return;
                var cfg = g.config || {}, part = cfg.participantIds;
                if (cfg.enabled === false) return;
                if (part && part.map(String).indexOf(me) === -1) return;
                n++;
            });
        } catch (e) {}
        Object.keys(d.sideMatches || {}).forEach(function (k) {
            var sm = d.sideMatches[k] || {};
            if ((sm.teamAIds || []).concat(sm.teamBIds || []).map(String).indexOf(me) > -1) n++;
        });
        return { net: net, bets: n, text: 'You: ' + money(net) + ' · ' + n + ' bet' + (n === 1 ? '' : 's') };
    }
    function betsHref() {
        var a = document.querySelector('#app-nav-bar a[href*="skins.html"]');
        var h = a ? a.getAttribute('href') : 'skins.html?game=' + encodeURIComponent(code() || '');
        return h;
    }
    function openBets() {
        if (window.HardPanRound && typeof window.HardPanRound.openBets === 'function' && window.HardPanRound.openBets()) return;
        window.location.href = betsHref();
    }

    // ---- THE SHEET --------------------------------------------------------------
    var st = null;   // { step, game, picks, field, stake, custom, scoring, from }
    var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif';
    var CSS = ''
        + '#hp-bet{position:fixed;inset:0;z-index:10200;display:none;font-family:' + FONT + ';}'
        + '#hp-bet.open{display:block;}'
        + '#hp-bet .hb-scrim{position:absolute;inset:0;background:rgba(5,20,12,.55);}'
        + '#hp-bet .hb-panel{position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow:auto;background:#fff;color:#0f1f17;border-radius:22px 22px 0 0;padding:10px 16px calc(env(safe-area-inset-bottom) + 18px);box-shadow:0 -8px 30px rgba(0,0,0,.25);-webkit-overflow-scrolling:touch;}'
        + '#hp-bet .hb-grab{width:44px;height:5px;border-radius:3px;background:#cfd8d3;margin:2px auto 10px;}'
        + '#hp-bet .hb-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;}'
        + '#hp-bet .hb-title{flex:1;font:800 22px/1.2 ' + FONT + ';color:#0f1f17;}'
        + '#hp-bet .hb-x,#hp-bet .hb-back{border:0;background:#eef2ef;color:#0f3d2e;border-radius:999px;min-width:40px;height:40px;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '#hp-bet .hb-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;}'
        + '#hp-bet .hb-tile{position:relative;text-align:left;border:1.5px solid #dfe6e2;background:#fff;border-radius:14px;padding:12px;min-height:68px;cursor:pointer;color:#0f1f17;}'
        + '#hp-bet .hb-tile b{display:block;font:800 16px/1.2 ' + FONT + ';}#hp-bet .hb-tile span{display:block;font:500 12px/1.3 ' + FONT + ';color:#5d6b64;margin-top:3px;}'
        + '#hp-bet .hb-tile.on{border:2.5px solid #0f4d3a;background:#f1f7f3;}#hp-bet .hb-tile.on:after{content:"\\2713";position:absolute;right:12px;top:10px;font:800 15px/1 ' + FONT + ';color:#0f4d3a;}'
        + '#hp-bet .hb-h{font:700 12px/1.3 ' + FONT + ';letter-spacing:.04em;color:#5d6b64;text-transform:uppercase;margin:16px 0 8px;}'
        + '#hp-bet .hb-chips{display:flex;flex-wrap:wrap;gap:8px;}'
        + '#hp-bet .hb-chip{border:0;background:#e8eeea;color:#0f1f17;border-radius:999px;min-height:40px;padding:0 14px;font:600 15px/1 ' + FONT + ';cursor:pointer;}'
        + '#hp-bet .hb-chip.on{background:#0f4d3a;color:#fff;}#hp-bet .hb-chip i{font-style:normal;opacity:.75;margin-right:5px;font-weight:700;}'
        + '#hp-bet .hb-field{border:0;background:none;color:#0f4d3a;font:700 14px/1 ' + FONT + ';padding:10px 0;cursor:pointer;}'
        + '#hp-bet .hb-vs{border:1.5px solid #dfe6e2;border-radius:12px;padding:12px;margin-top:12px;font:500 15px/1.3 ' + FONT + ';min-height:20px;}'
        + '#hp-bet .hb-why{font:500 13px/1.3 ' + FONT + ';color:#8a5a00;margin-top:8px;min-height:17px;}'
        + '#hp-bet .hb-go{display:block;width:100%;border:0;border-radius:16px;min-height:56px;margin-top:14px;font:800 19px/1 ' + FONT + ';cursor:pointer;background:#c8f075;color:#0f1f17;}'
        + '#hp-bet .hb-go[disabled]{opacity:.45;cursor:default;}'
        + '#hp-bet .hb-card{border:1.5px solid #dfe6e2;border-radius:14px;padding:4px 12px;margin-top:14px;}'
        + '#hp-bet .hb-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:50px;border-bottom:1px solid #edf1ee;font:500 15px/1.2 ' + FONT + ';}#hp-bet .hb-row:last-child{border-bottom:0;}'
        + '#hp-bet .hb-seg{display:flex;background:#eef2ef;border-radius:10px;padding:3px;}#hp-bet .hb-seg button{border:0;background:none;border-radius:8px;min-height:36px;padding:0 16px;font:700 14px/1 ' + FONT + ';color:#0f1f17;cursor:pointer;}#hp-bet .hb-seg button.on{background:#0f4d3a;color:#fff;}'
        + '#hp-bet select.hb-from{border:0;background:none;font:700 15px/1 ' + FONT + ';color:#0f1f17;text-align:right;}'
        + '#hp-bet .hb-worst{font:500 13px/1.4 ' + FONT + ';color:#5d6b64;margin-top:12px;}'
        + '#hp-bet input.hb-custom{width:90px;min-height:40px;border:1.5px solid #0f4d3a;border-radius:999px;padding:0 12px;font:600 15px/1 ' + FONT + ';}'
        // THE CARD'S BAR (simpleFlow, card side): the money chip and + Bet over the Round Menu.
        + '#hp-card-bet{position:fixed;z-index:9000;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 76px);display:none;align-items:center;justify-content:space-between;gap:8px;pointer-events:none;}'
        + 'body.hp-sf-card .scorecard-main::after{content:"";display:block;height:72px;}'
        + 'body.hp-sf-card #hp-card-bet{display:flex;}body.gps-side-gps #hp-card-bet{display:none !important;}'
        + '#hp-card-bet > *{pointer-events:auto;}'
        + '.hp-money-chip{border:0;border-radius:999px;background:rgba(11,15,12,.92);color:#f4f4ef;min-height:40px;padding:0 14px;font:700 14px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;}'
        + '.hp-money-chip b{color:#c8f075;font-weight:800;}.hp-money-chip b.neg{color:#ff9b8a;}'
        + '.hp-bet-btn{border:0;border-radius:16px;background:#ffd60a;color:#0b0f0c;min-height:48px;padding:0 18px;font:800 17px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;}';
    function ensureCss() {
        if (document.getElementById('hp-bet-css')) return;
        var s = document.createElement('style'); s.id = 'hp-bet-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    function root() {
        var r = document.getElementById('hp-bet');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-bet'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'New bet');
        r.innerHTML = '<div class="hb-scrim"></div><div class="hb-panel"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', onClick);
        r.addEventListener('change', onChange);
        r.addEventListener('input', onInput);
        return r;
    }
    function isOpen() { var r = document.getElementById('hp-bet'); return !!(r && r.classList.contains('open')); }
    function open(game) {
        if (!on()) return false;
        if (!data() || !code()) return false;
        st = { step: 1, game: GAMES[game] ? game : null, picks: [], field: false, stake: null, custom: false, scoring: 'net', from: null };
        if (st.game === 'hilo' && !hiloHere()) st.game = null;
        var r = root(); r.classList.add('open');
        draw();
        return true;
    }
    function close() { var r = document.getElementById('hp-bet'); if (r) r.classList.remove('open'); st = null; }

    function chipFor(p, idx) {
        var n = idx > -1 ? '<i>' + (idx + 1) + '</i>' : '';
        return '<button type="button" class="hb-chip' + (idx > -1 ? ' on' : '') + '" data-hb-pick="' + esc(p.id) + '">' + n + esc(first(p) || p.name) + '</button>';
    }
    function draw() {
        var r = root(), panel = r.querySelector('.hb-panel');
        if (!st) return;
        var html = '<div class="hb-grab"></div>';
        if (st.step === 1) {
            html += '<div class="hb-head"><div class="hb-title">New bet</div><button type="button" class="hb-x" data-hb="close" aria-label="Close">✕</button></div>';
            html += '<div class="hb-tiles">' + tiles().map(function (k) {
                var g = GAMES[k];
                return '<button type="button" class="hb-tile' + (st.game === k ? ' on' : '') + '" data-hb-game="' + k + '"><b>' + esc(g.label) + '</b><span>' + esc(g.sub) + '</span></button>';
            }).join('') + '<button type="button" class="hb-tile" data-hb="more"><b>More games ›</b><span>Dots, 9 Points, Stroke…</span></button></div>';
            if (st.game) {
                var mg = myGroup(), m = groupMap();
                var mine = players().filter(function (p) { return String(m[String(p.id)]) === String(mg); });
                var others = players().filter(function (p) { return String(m[String(p.id)]) !== String(mg); });
                html += '<div class="hb-h">Tap who’s in' + (st.game === 'skins' ? '' : ' (first two = your side)') + '</div>';
                html += '<div class="hb-chips">' + mine.map(function (p) { return chipFor(p, st.picks.indexOf(String(p.id))); }).join('') + '</div>';
                if (others.length) {
                    if (st.field || others.some(function (p) { return st.picks.indexOf(String(p.id)) > -1; })) {
                        html += '<div class="hb-h">Anyone in the field</div><div class="hb-chips">' + others.map(function (p) { return chipFor(p, st.picks.indexOf(String(p.id))); }).join('') + '</div>';
                    } else {
                        html += '<button type="button" class="hb-field" data-hb="field">+ Anyone in the field ›</button>';
                    }
                }
                var sh = shapeOf(st.game, st.picks);
                html += '<div class="hb-vs" aria-live="polite">' + (vsLine(st.game, st.picks) || '<span style="color:#8a958f">Tap the golfers in the order of the sides</span>') + '</div>';
                html += '<div class="hb-why">' + (st.picks.length && !sh.ok ? esc(sh.why) : '') + '</div>';
                html += '<button type="button" class="hb-go" data-hb="next"' + (sh.ok ? '' : ' disabled') + '>Next: amount ›</button>';
            }
        } else {
            var g = GAMES[st.game], ids = st.picks.slice(), shp = shapeOf(st.game, ids);
            if (st.from == null) st.from = startHole(ids);
            var hs = holes(), nowHole = startHole(ids);
            if (st.stake == null) st.stake = g.chips[1];
            html += '<div class="hb-head"><button type="button" class="hb-back" data-hb="back" aria-label="Back">‹</button><div class="hb-title">' + esc(g.label) + ' · ' + esc(g.stakeWord) + '</div><button type="button" class="hb-x" data-hb="close" aria-label="Close">✕</button></div>';
            html += '<div class="hb-vs" style="margin-top:0">' + vsLine(st.game, ids) + '</div>';
            html += '<div class="hb-chips" style="margin-top:14px">' + g.chips.map(function (v) {
                return '<button type="button" class="hb-chip' + (!st.custom && st.stake === v ? ' on' : '') + '" data-hb-stake="' + v + '">$' + v + '</button>';
            }).join('') + (st.custom
                ? '<input class="hb-custom" type="number" inputmode="decimal" min="1" step="1" aria-label="Custom amount" value="' + esc(st.stake || '') + '">'
                : '<button type="button" class="hb-chip" data-hb="custom">Custom</button>') + '</div>';
            html += '<div class="hb-card">'
                + '<div class="hb-row"><span>Scoring</span><span class="hb-seg"><button type="button" data-hb-scoring="net" class="' + (st.scoring === 'net' ? 'on' : '') + '">Net</button><button type="button" data-hb-scoring="gross" class="' + (st.scoring === 'gross' ? 'on' : '') + '">Gross</button></span></div>'
                + '<div class="hb-row"><span>Counts from</span><select class="hb-from" aria-label="Counts from">' + hs.filter(function (h) { return !nowHole || h.hole >= nowHole; }).map(function (h) {
                    return '<option value="' + h.hole + '"' + (h.hole === st.from ? ' selected' : '') + '>Hole ' + h.hole + (h.hole === nowHole ? ' (now)' : '') + '</option>';
                }).join('') + '</select></div></div>';
            var w = worstCase(st.game, Number(st.stake) || 0, shp, st.from || 1);
            html += '<div class="hb-worst">' + (w.mine ? 'Worst case for you: ' : 'Worst case each: ') + '<b>−$' + w.amount + '</b>'
                + (w.presses ? ' (no presses)' : '') + (st.game === 'hilo' ? ' · Ties are a wash' : '') + '</div>';
            var ok = !!nowHole && Number(st.stake) > 0;
            html += '<div class="hb-why">' + (!nowHole ? 'No holes are left to bet on.' : '') + '</div>';
            html += '<button type="button" class="hb-go" data-hb="start"' + (ok ? '' : ' disabled') + '>Start bet ✓</button>';
        }
        panel.innerHTML = html;
    }
    function onInput(e) {
        if (e.target && e.target.classList.contains('hb-custom') && st) {
            st.stake = Number(e.target.value) || 0;
            var go = root().querySelector('[data-hb="start"]'); if (go) go.disabled = !(st.stake > 0);
            var shp = shapeOf(st.game, st.picks), w = worstCase(st.game, st.stake, shp, st.from || 1);
            var wb = root().querySelector('.hb-worst b'); if (wb) wb.textContent = '−$' + w.amount;
        }
    }
    function onChange(e) {
        if (e.target && e.target.classList.contains('hb-from') && st) { st.from = Number(e.target.value) || st.from; draw(); }
    }
    function onClick(e) {
        var t = e.target;
        if (t.classList && t.classList.contains('hb-scrim')) { close(); return; }
        var b = t.closest ? t.closest('button') : null;
        if (!b || !st) return;
        var a = b.getAttribute('data-hb');
        if (b.hasAttribute('data-hb-game')) { var g = b.getAttribute('data-hb-game'); if (g !== st.game) { st.game = g; } draw(); return; }
        if (b.hasAttribute('data-hb-pick')) {
            var id = String(b.getAttribute('data-hb-pick')), i = st.picks.indexOf(id);
            if (i > -1) st.picks.splice(i, 1); else st.picks.push(id);
            st.from = null;
            draw(); return;
        }
        if (b.hasAttribute('data-hb-stake')) { st.stake = Number(b.getAttribute('data-hb-stake')); st.custom = false; draw(); return; }
        if (b.hasAttribute('data-hb-scoring')) { st.scoring = b.getAttribute('data-hb-scoring'); draw(); return; }
        if (a === 'close') { close(); return; }
        if (a === 'field') { st.field = true; draw(); return; }
        if (a === 'custom') { st.custom = true; draw(); var inp = root().querySelector('.hb-custom'); if (inp) inp.focus(); return; }
        if (a === 'back') { st.step = 1; draw(); return; }
        if (a === 'more') { close(); moreGames(); return; }
        if (a === 'next') { if (shapeOf(st.game, st.picks).ok) { st.step = 2; st.from = null; draw(); } return; }
        if (a === 'start') { start(); return; }
    }
    function say(kind, msg) {
        try {
            if (kind === 'refuse' && typeof uiRefuse === 'function') return uiRefuse('⚠️ ' + msg);
            if (kind === 'fail' && typeof uiFail === 'function') return uiFail('⚠️ ' + msg);
            if (typeof uiToast === 'function') return uiToast(msg);
        } catch (e) {}
    }
    function start() {
        var b = buildBet({ game: st.game, picks: st.picks, stake: st.stake, scoring: st.scoring, startHole: st.from });
        if (b.refuse) { var w = root().querySelector('.hb-why'); if (w) w.textContent = b.refuse; return; }
        var label = GAMES[st.game].label + ' · ' + shapeOf(st.game, st.picks.map(String)).ok + '';
        var line = vsLine(st.game, st.picks).replace(/<[^>]+>/g, '');
        var p;
        try { p = write(b); } catch (e) { say('fail', 'Could not save: ' + (e && e.message)); return; }
        close();
        say('toast', '✅ ' + GAMES[b.value.format === 'skins' ? 'skins' : b.value.format].label + ' started · ' + line);
        if (p && typeof p.then === 'function') p.then(function () { refresh(); }, function (err) { say('fail', 'Could not save: ' + (err && err.message)); });
        setTimeout(refresh, 0);
    }
    // MORE GAMES: the full New Action page, back to this round afterwards (hpback=1).
    function moreGames() {
        var g = locked();
        window.location.href = 'sidematches.html?game=' + encodeURIComponent(code() || '') + (g ? '&group=' + g : '') + '&hpback=1';
    }

    // ---- THE CARD SIDE: money chip + "+ Bet" -----------------------------------
    function cardBar() {
        var bar = document.getElementById('hp-card-bet');
        if (bar) return bar;
        ensureCss();
        bar = document.createElement('div');
        bar.id = 'hp-card-bet';
        bar.innerHTML = '<button type="button" class="hp-money-chip" data-hp-money="card" style="display:none" aria-label="Your money - open Bets"></button><span></span>'
            + '<button type="button" class="hp-bet-btn" aria-label="Add a bet">+ Bet</button>';
        bar.querySelector('.hp-bet-btn').addEventListener('click', function (e) { e.preventDefault(); open(); });
        bar.querySelector('.hp-money-chip').addEventListener('click', function (e) { e.preventDefault(); openBets(); });
        document.body.appendChild(bar);
        return bar;
    }
    function paintChip(el, m) {
        if (!el) return;
        if (!m) { el.style.display = 'none'; return; }
        el.style.display = '';
        var cls = m.net < -0.005 ? 'neg' : '';
        var html = 'You: <b class="' + cls + '">' + money(m.net) + '</b> · ' + m.bets + ' bet' + (m.bets === 1 ? '' : 's');
        if (el.__hp !== html) { el.innerHTML = html; el.__hp = html; }
        el.setAttribute('aria-label', m.text + ' - open Bets');
    }
    var last = null;
    function refresh() {
        if (!on()) { document.body.classList.remove('hp-sf-card'); return null; }
        var d = data();
        var live = !!(d && code() && (d.players || []).length);
        document.body.classList.toggle('hp-sf-card', live);
        if (!live) return null;
        var m = moneyNow();
        last = m;
        paintChip(cardBar().querySelector('.hp-money-chip'), m);
        Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay .gps-money'), function (el) { paintChip(el, m); });
        return m;
    }

    var api = {
        on: on, open: open, close: close, isOpen: isOpen, refresh: refresh, openBets: openBets,
        hiloHere: hiloHere, tiles: tiles,
        // Pure-ish pieces for the tests.
        shapeOf: shapeOf, buildBet: buildBet, worstCase: worstCase, moneyNow: moneyNow,
        money: function () { return last; },
        paintChip: paintChip
    };
    window.HardPanBet = api;
    if (window.GolfBack && typeof window.GolfBack.register === 'function') {
        try { window.GolfBack.register({ name: 'hp-bet', priority: 5, isOpen: isOpen, close: function () { if (st && st.step === 2) { st.step = 1; draw(); } else close(); } }); } catch (e) {}
    }
})();
