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
// the number the Results page and Finish show), read only, for this phone's golfer;
// the count is this golfer's side bets.
// Tap = Bets.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // ON: the switch is on AND this phone has not turned the new flow off ("hardpan_simple_flow" =
    // "off" in localStorage - the old screens on one phone, to compare; the old-flow tests use it).
    function on() {
        try {
            if (!(typeof window.HardPanFeature === 'function' && ((window.HARDPAN_GPS_CONFIG || {}).features || {}).simpleFlow === true)) return false;
            try { if (localStorage.getItem('hardpan_simple_flow') === 'off') return false; } catch (e) {}
            return true;
        } catch (e) { return false; }
    }
    function hiloHere() { return typeof window.hiloShapeOk === 'function' && typeof window.hiloForSideMatch === 'function'; }

    // ---- THE ROUND (index.html's globals, read at call time) -------------------
    /* global validateMoneyPool, moneyPoolRulesLocked, canReachSetup, requireOnlineForMoney */
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
    // A golfer's short name - the first name, or "Test A." when two golfers in the round share it
    // (URGENT-015 walk: "Test vs Test" on a round of Test Alpha, Test Bravo ...).
    function first(p) {
        var parts = String((p && p.name) || '').trim().split(/\s+/), f = parts[0] || '';
        if (parts.length < 2) return f;
        var same = players().filter(function (q) { return String((q && q.name) || '').trim().split(/\s+/)[0].toLowerCase() === f.toLowerCase(); }).length;
        return same > 1 ? f + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : f;
    }
    function byId(id) { return players().filter(function (p) { return String(p.id) === String(id); })[0] || null; }
    function holes() { var d = data() || {}; return (d.courseData || []).slice().sort(function (a, b) { return a.hole - b.hole; }); }
    function money(n) { var v = Math.round(Math.abs(n)); return (n > 0.005 ? '+' : (n < -0.005 ? '−' : '')) + '$' + v; }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---- THE GAMES ------------------------------------------------------------
    // kind: 'side' = a sideMatches record (sideMatchPayloadFromTerms); 'skins' = an
    // additionalGameInstances entry (New Action's saveFieldAction shape).
    var GAMES = {
        match:  { label: 'Match', sub: '1 v 1', sub2: 'Best ball', kind: 'side', stakeWord: '$ a side', chips: [5, 10, 20], presses: true },
        nassau: { label: 'Nassau', sub: 'F9 / B9 / 18', kind: 'side', stakeWord: '$ each nine + 18', chips: [2, 5, 10], presses: true },
        hilo:   { label: 'Hi-Lo', sub: 'Low + high ball', kind: 'side', stakeWord: '$ per point', chips: [1, 5, 10] },
        stroke: { label: 'Stroke play', sub: 'Lowest total', kind: 'side', stakeWord: '$ overall', chips: [5, 10, 20] },
        skins:  { label: 'Skins', sub: 'Pick who’s in · $ each', kind: 'skins', stakeWord: '$ each', chips: [5, 10, 20] }
    };
    // URGENT-014: 1 v 1 / 2 v 2 first, then the games for that mode. Skins (any number) under More.
    function tiles(mode) {
        if (mode === '1v1') return ['match', 'nassau', 'stroke'];
        if (mode === '2v2') return ['match', 'nassau'].concat(hiloHere() ? ['hilo'] : []).concat(['stroke']);
        return ['match', 'nassau'].concat(hiloHere() ? ['hilo'] : []).concat(['skins']);
    }

    // ---- WHAT A PICK MAKES ------------------------------------------------------
    // The tap order: 1 v 1 = two golfers (first vs second); 2 v 2 = four (the first two one
    // side). Hi-Lo: four. Skins: two or more, one pot. No mode given: two = 1v1, four = 2v2.
    function shapeOf(game, picks, mode) {
        var n = picks.length;
        if (game === 'skins') return n >= 2 ? { ok: true, all: picks.slice() } : { ok: false, why: 'Tap at least two golfers' };
        if (game === 'hilo') mode = '2v2';
        if (mode === '1v1') {
            if (n === 2) return { ok: true, a: [picks[0]], b: [picks[1]] };
            return { ok: false, why: n < 2 ? 'Tap ' + (2 - n) + ' more (1 v 1)' : '1 v 1 is two golfers - tap one off' };
        }
        if (mode === '2v2') {
            if (n === 4) return { ok: true, a: picks.slice(0, 2), b: picks.slice(2, 4) };
            return { ok: false, why: n < 4 ? 'Tap ' + (4 - n) + ' more (2 v 2)' : '2 v 2 is four golfers - tap one off' };
        }
        if (n === 2) return { ok: true, a: [picks[0]], b: [picks[1]] };
        if (n === 4) return { ok: true, a: picks.slice(0, 2), b: picks.slice(2, 4) };
        if (n < 2) return { ok: false, why: 'Tap ' + (2 - n) + ' more' };
        if (n === 3) return { ok: false, why: 'Tap one more for a 2v2' };
        return { ok: false, why: 'A match is 1v1 or 2v2' };
    }
    function vsLine(game, picks, mode) {
        if (!picks.length) return '';
        var sh = shapeOf(game, picks, mode);
        var nm = function (ids) { return ids.map(function (id) { return first(byId(id)); }).join(' + '); };
        if (game === 'skins') return picks.map(function (id) { return first(byId(id)); }).join(' · ');
        if (sh.ok) return '<b>' + esc(nm(sh.a)) + '</b> vs <b>' + esc(nm(sh.b)) + '</b>';
        var half = (mode === '2v2' || game === 'hilo' || picks.length >= 3) ? 2 : 1;
        return '<b>' + esc(nm(picks.slice(0, half))) + '</b>' + (picks.length > half ? ' vs <b>' + esc(nm(picks.slice(half))) + '</b>' : ' vs …');
    }
    // THE HOLES IN PLAY ORDER (018 follow-up): play-order.js, as the carry-order and gameHoles
    // fixes - a round off the 10th is 10..18 then 1..9 (this group's own tee on a two-tee start).
    /* global playOrder, teeStartHole, groupStartHole */
    function ordered() {
        var d = data() || {}, hs = holes();
        if (!hs.length || typeof playOrder !== 'function' || typeof teeStartHole !== 'function') return hs;
        var tee;
        try { tee = (locked() && typeof groupStartHole === 'function') ? groupStartHole(d, hs, locked()) : teeStartHole(d, hs); } catch (e) { return hs; }
        return playOrder(hs, tee);
    }
    function at(list, hole) { for (var i = 0; i < list.length; i++) if (Number(list[i].hole) === Number(hole)) return i; return -1; }
    // Where the bet starts NOW: the hole after the last one anybody in it has posted, in play
    // order (action-model.js sideMatchStartHole's rule - New Action's - walked in play order);
    // null once every hole is in.
    function startHole(ids) {
        var o = ordered(); if (!o.length) return 1;
        var parts = players().filter(function (p) { return ids.indexOf(String(p.id)) > -1; });
        if (!parts.length) parts = players();
        var sc = (data() || {}).scores || {}, last = -1;
        o.forEach(function (h, i) { if (parts.some(function (p) { var v = sc['p' + p.id + '_h' + h.hole]; return v && v > 0; })) last = i; });
        if (last === -1) return o[0].hole;
        return last + 1 < o.length ? o[last + 1].hole : null;
    }
    // Holes as the golfer reads them: runs in play order - "10-18", "10-18, 1-9", "4".
    function holesText(list) {
        var runs = [], cur = null;
        list.forEach(function (h) { h = Number(h); if (cur && h === cur.b + 1) cur.b = h; else { cur = { a: h, b: h }; runs.push(cur); } });
        return runs.map(function (r) { return r.a === r.b ? String(r.a) : r.a + '-' + r.b; }).join(', ');
    }
    // WORST CASE, per golfer, before presses - words only, never money that moves.
    // Match: the side's stake, split between its golfers (settlement splits per side).
    // Nassau: front + back + 18, split. Hi-Lo: 2 points a hole x the holes left x the
    // stake, split between two. Skins: the buy-in.
    function worstCase(game, stake, sh, from) {
        var me = meId(), side = null;
        if (sh.ok && sh.a && me) side = sh.a.indexOf(me) > -1 ? sh.a : (sh.b.indexOf(me) > -1 ? sh.b : null);
        var per = (side || (sh.a || [1])).length || 1;
        var o = ordered(), fi = at(o, from), left = fi < 0 ? o.length : o.length - fi;
        var amt;
        if (game === 'skins') amt = stake;
        else if (game === 'nassau') amt = stake * 3 / per;
        else if (game === 'hilo') amt = 2 * left * stake / per;
        else amt = stake / per;
        var mine = game === 'skins' ? (sh.all || []).indexOf(me) > -1 : !!side;
        return { amount: Math.round(amt), mine: mine, presses: !!(GAMES[game] && GAMES[game].presses) };
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
        var sh = shapeOf(game, ids, o.mode);
        if (!GAMES[game] || (game === 'hilo' && !hiloHere())) return { refuse: 'Pick a game.' };
        if (!sh.ok) return { refuse: sh.why };
        if (!(stake > 0)) return { refuse: 'Pick an amount.' };
        var why = refuseWhy(game, ids); if (why) return { refuse: why };
        // 018: any hole, the played ones included (the engines settle a range from the scores in).
        var ord = ordered();
        var from = Number(o.startHole) || startHole(ids) || ((ord[0] || {}).hole);
        if (!from) return { refuse: 'This round has no holes yet.' };
        // FROM THE FIRST HOLE PLAYED = THE WHOLE ROUND. On a round off the 10th that is hole 10,
        // stored as the card's first hole - the record every whole-round bet has (startHole 1),
        // which the engines read as all 18. (A start on 10 stored as 10 would be holes 10-18 by
        // number in sideMatchHoles - see the 018 report.)
        if (ord.length && Number(from) === Number(ord[0].hole)) from = Number(holes()[0].hole);
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
        // PRESSES (Match / Nassau only): Off = 'none', or New Action's own "Auto @ 2 Down".
        var press = (GAMES[game].presses && o.press === '2down') ? '2down' : 'none';
        var terms = { format: game, scoring: o.scoring === 'gross' ? 'gross' : 'net', startHole: from, stake: stake, pressRule: press };
        if (game === 'nassau') { terms.frontStake = stake; terms.backStake = stake; terms.overallStake = stake; terms.autoPressStake = null; }
        // STROKE PLAY: the stake is the overall bet; New Action's own defaults for the rest
        // (tied hole void, strokes overall, carried across the turn).
        if (game === 'stroke') { terms = { format: 'stroke', scoring: terms.scoring, startHole: from, holeStake: 0, overallStake: stake, tieRule: 'void', overallMode: 'stroke', segment: 'full' }; }
        var payload = sideMatchPayloadFromTerms(terms, { teamAIds: sh.a, teamBIds: sh.b, startHole: from, now: now, scope: sc.scope, ownerGroup: sc.ownerGroup });
        return { path: 'events/' + c + '/sideMatches', value: payload };
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
        // "· N bets" = this golfer's side bets (Manny, 017): not the round's own games.
        var n = 0;
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
        + '#hp-bet .hb-go.hb-cancel{background:#fff;border:1.5px solid #0f4d3a;color:#0f4d3a;margin-top:10px;}'
        + '#hp-bet .hb-go.hb-danger{background:#b3261e;color:#fff;}#hp-bet .hb-go.hb-remove{color:#b3261e;border-color:#b3261e;}'
        + '#hp-bet .hb-modes{display:flex;background:#eef2ef;border-radius:14px;padding:4px;margin:0 0 14px;}'
        + '#hp-bet .hb-modes button{flex:1;border:0;background:none;border-radius:11px;min-height:52px;font:800 20px/1 ' + FONT + ';color:#0f1f17;cursor:pointer;}#hp-bet .hb-modes button.on{background:#0f4d3a;color:#fff;}'
        + '#hp-bet .hb-vsrow{display:flex;gap:8px;align-items:stretch;}#hp-bet .hb-vsrow .hb-vs{flex:1;}'
        + '#hp-bet .hb-swap{margin-top:12px;border:1.5px solid #0f4d3a;background:#fff;color:#0f4d3a;border-radius:12px;padding:0 12px;font:800 14px/1 ' + FONT + ';cursor:pointer;white-space:nowrap;}'
        + '#hp-bet .hb-played{font:600 13px/1.4 ' + FONT + ';color:#6b4e00;background:#fff7e0;border:1px solid #f0d58a;border-radius:10px;padding:8px 10px;margin-bottom:8px;}'
        + '#hp-bet .hb-result{font:500 14px/1.4 ' + FONT + ';color:#0f1f17;margin:0 0 8px;}'
        + '#hp-bet .hb-card{border:1.5px solid #dfe6e2;border-radius:14px;padding:4px 12px;margin-top:14px;}'
        + '#hp-bet .hb-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:50px;border-bottom:1px solid #edf1ee;font:500 15px/1.2 ' + FONT + ';}#hp-bet .hb-row:last-child{border-bottom:0;}'
        + '#hp-bet .hb-seg{display:flex;background:#eef2ef;border-radius:10px;padding:3px;}#hp-bet .hb-seg button{border:0;background:none;border-radius:8px;min-height:36px;padding:0 16px;font:700 14px/1 ' + FONT + ';color:#0f1f17;cursor:pointer;}#hp-bet .hb-seg button.on{background:#0f4d3a;color:#fff;}'
        + '#hp-bet select.hb-from{border:0;background:none;font:700 15px/1 ' + FONT + ';color:#0f1f17;text-align:right;}'
        + '#hp-bet .hb-worst{font:500 13px/1.4 ' + FONT + ';color:#5d6b64;margin-top:12px;}'
        + '#hp-bet input.hb-custom{width:90px;min-height:40px;border:1.5px solid #0f4d3a;border-radius:999px;padding:0 12px;font:600 15px/1 ' + FONT + ';}'
        // THE CARD'S BAR (simpleFlow, card side): the money chip and + Bet over the Round Menu.
        // THE ONE BOTTOM BAR (simpleFlow) on the card and over Bets: ☰ Menu | 📍 GPS | ▤ Card | + Bet,
        // the money chip just above it at the right. It replaces the Round Menu pill (gps-round.js).
        + '#hp-card-bet{position:fixed;z-index:58;left:0;right:0;bottom:0;padding:8px 10px calc(env(safe-area-inset-bottom) + 8px);display:none;align-items:stretch;gap:8px;background:rgba(244,247,245,.97);border-top:1px solid #dfe6e2;box-shadow:0 -4px 16px rgba(0,0,0,.08);}'
        + 'body.hp-sf-card .scorecard-main::after{content:"";display:block;height:84px;}'
        + 'body.hp-sf-card #hp-card-bet{display:flex;}body.gps-side-gps #hp-card-bet{display:none;}'
        + 'body.hp-bets-open #hp-card-bet{display:flex !important;z-index:10120;}'
        + '#hp-card-bet .hp-bar-btn{flex:1 1 0;min-width:0;min-height:50px;border:0;border-radius:14px;background:#0f1a14;color:#f4f4ef;font:800 15px/1.1 ' + FONT + ';cursor:pointer;white-space:nowrap;}'
        + '#hp-card-bet .hp-bar-icon{flex:0 0 48px;font-size:20px;}'
        + '#hp-card-bet .hp-bar-score{flex:2 1 0;background:#c8f075;color:#0f1f17;font-size:16px;}'
        + '#hp-card-bet .hp-bet-btn{flex:0 0 auto;min-height:50px;padding:0 14px;}'
        // Over Bets the bar has five: Enter score gives up the room so GPS and Card read whole.
        + 'body.hp-bets-open #hp-card-bet .hp-bar-score{flex:1.3 1 0;font-size:14px;white-space:normal;}'
        + 'body.hp-bets-open #hp-card-bet .hp-bar-btn{padding:0 4px;font-size:14px;}'
        + 'body.hp-bets-open #hp-card-bet .hp-bar-icon{flex:0 0 44px;font-size:20px;}'
        + '#hp-card-bet .hp-money-chip{position:absolute;right:10px;bottom:calc(100% + 8px);}'
        + '.hp-money-chip{border:0;border-radius:999px;background:rgba(11,15,12,.92);color:#f4f4ef;min-height:40px;padding:0 14px;font:700 14px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;}'
        + '.hp-money-chip b{color:#c8f075;font-weight:800;}.hp-money-chip b.neg{color:#ff9b8a;}'
        + '.hp-bet-btn{border:0;border-radius:16px;background:#ffd60a;color:#0b0f0c;min-height:48px;padding:0 18px;font:800 17px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;}';
    function ensureCss() {
        if (document.getElementById('hp-bet-css')) return;
        // The Weekly Game sheet (#hp-weekly) wears the bet sheet's own styles.
        var s = document.createElement('style'); s.id = 'hp-bet-css'; s.textContent = CSS + CSS.split('}').filter(function (r) { return /#hp-bet[ .{]/.test(r); }).map(function (r) { return r.replace(/#hp-bet(?=[ .{])/g, '#hp-weekly') + '}'; }).join('') + '#hp-weekly{z-index:10210;}'; document.head.appendChild(s);
    }
    function root() {
        var r = document.getElementById('hp-bet');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-bet'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'New bet');
        r.innerHTML = '<div class="hb-scrim"></div><div class="hb-panel gps-scroll-ok"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', onClick);
        r.addEventListener('change', onChange);
        r.addEventListener('input', onInput);
        return r;
    }
    function isOpen() { var r = document.getElementById('hp-bet'); return !!(r && r.classList.contains('open')); }
    // OPEN - from every entry point (URGENT-014): open(game?, { mode, returnTo, editId }).
    //   returnTo: 'bets' (the Bets sheet stays under it), 'finish' (Settle up comes back),
    //             a page URL (the Bets / Results / Matches page it was opened from), or
    //             nothing - then a GPS round goes back to the GPS (current hole), else the card.
    //   editId:   a side match to change or remove, pre-filled.
    function defaultMode() {
        var mg = myGroup(), m = groupMap();
        return players().filter(function (p) { return String(m[String(p.id)]) === String(mg); }).length >= 4 ? '2v2' : '1v1';
    }
    function open(game, opts) {
        if (!on()) return false;
        if (!data() || !code()) return false;
        var o = (game && typeof game === 'object') ? game : (opts || {});
        if (game && typeof game === 'object') game = o.game;
        st = { step: 1, mode: o.mode === '1v1' || o.mode === '2v2' ? o.mode : defaultMode(), game: GAMES[game] ? game : null, picks: [], field: false,
            stake: null, custom: false, scoring: 'net', from: null, press: 'none', more: game === 'skins', returnTo: o.returnTo || null, editId: null };
        if (st.game === 'hilo') { if (!hiloHere()) st.game = null; else st.mode = '2v2'; }
        if (o.editId && !prefill(o.editId)) return false;
        var r = root(); r.classList.add('open');
        draw();
        return true;
    }
    // EDIT: the side match as it is stored, read back into the sheet's own choices.
    // Where a bet lives: a side match, or (skins from the sheet) a round game instance.
    function betAt(id) {
        var d = data() || {};
        if ((d.sideMatches || {})[id]) return { slot: 'sideMatches', rec: d.sideMatches[id] };
        var gi = (d.additionalGameInstances || {})[id];
        if (gi && gi.format === 'skins') return { slot: 'additionalGameInstances', rec: gi };
        return null;
    }
    function prefill(id) {
        var at0 = betAt(id); if (!at0) return false;
        if (at0.slot === 'additionalGameInstances') {
            // SKINS, a round game: who's in (everybody when it names nobody), the buy-in, net/gross, from.
            var gi = at0.rec;
            st.editId = id; st.game = 'skins'; st.more = true; st.field = true;
            st.picks = (gi.participantIds || players().map(function (p) { return p.id; })).map(String);
            st.scoring = gi.skinsScoring === 'net' ? 'net' : 'gross';
            st.from = Number(gi.startHole) || null; st.stake = Number(gi.skinsBuyIn) || null;
            st.custom = GAMES.skins.chips.indexOf(st.stake) === -1; st.step = 2;
            return true;
        }
        var sm = at0.rec;
        if (!GAMES[sm.format] || GAMES[sm.format].kind !== 'side') return false;
        var a = (sm.teamAIds || []).map(String), b = (sm.teamBIds || []).map(String);
        st.editId = id; st.game = sm.format; st.mode = a.length === 2 ? '2v2' : '1v1';
        st.picks = a.concat(b); st.field = true; st.scoring = sm.scoring === 'gross' ? 'gross' : 'net';
        st.from = Number(sm.startHole) || null; st.press = sm.pressRule === '2down' ? '2down' : 'none';
        var stake = sm.format === 'stroke' ? Number(sm.overallStake) : (sm.format === 'nassau' ? Number(sm.frontStake || sm.stake) : Number(sm.stake));
        st.stake = stake || null; st.custom = GAMES[sm.format].chips.indexOf(st.stake) === -1;
        st.step = 2;
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
            html += '<div class="hb-head"><div class="hb-title">' + (st.editId ? 'Change this bet' : 'New bet') + '</div><button type="button" class="hb-x" data-hb="close" aria-label="Close">\u2715</button></div>';
            // URGENT-014: 1 v 1 / 2 v 2 FIRST - big, at the top.
            html += '<div class="hb-modes" role="tablist" aria-label="1 v 1 or 2 v 2">'
                + '<button type="button" role="tab" data-hb-mode="1v1" class="' + (st.mode === '1v1' ? 'on' : '') + '" aria-selected="' + (st.mode === '1v1') + '">1 v 1</button>'
                + '<button type="button" role="tab" data-hb-mode="2v2" class="' + (st.mode === '2v2' ? 'on' : '') + '" aria-selected="' + (st.mode === '2v2') + '">2 v 2</button></div>';
            if (!st.more) {
                html += '<div class="hb-tiles">' + tiles(st.mode).map(function (k) {
                    var g = GAMES[k], sub = (k === 'match' && st.mode === '2v2') ? g.sub2 : (k === 'match' ? '1 v 1' : g.sub);
                    return '<button type="button" class="hb-tile' + (st.game === k ? ' on' : '') + '" data-hb-game="' + k + '"><b>' + esc(g.label) + '</b><span>' + esc(sub) + '</span></button>';
                }).join('') + '<button type="button" class="hb-tile' + (st.game === 'skins' ? ' on' : '') + '" data-hb="more"><b>More \u203a</b><span>Skins, Dots, 9 Points\u2026</span></button></div>';
            } else {
                html += '<div class="hb-tiles"><button type="button" class="hb-tile' + (st.game === 'skins' ? ' on' : '') + '" data-hb-game="skins"><b>Skins</b><span>Any number \u00b7 pick who\u2019s in</span></button>'
                    + '<button type="button" class="hb-tile" data-hb="other"><b>Other games \u203a</b><span>Dots, 9 Points, Birdies\u2026</span></button>'
                    + '<button type="button" class="hb-tile" data-hb="less"><b>\u2039 Back</b><span>Match, Nassau\u2026</span></button></div>';
            }
            if (st.game) {
                var mg = myGroup(), m = groupMap();
                var mine = players().filter(function (p) { return String(m[String(p.id)]) === String(mg); });
                var others = players().filter(function (p) { return String(m[String(p.id)]) !== String(mg); });
                var want = st.game === 'skins' ? 'Tap who\u2019s in' : (st.mode === '1v1' || (st.game !== 'hilo' && st.mode !== '2v2') ? 'Tap 2 golfers' : 'Tap 4 golfers (the first two = one side)');
                html += '<div class="hb-h">' + want + '</div>';
                html += '<div class="hb-chips">' + mine.map(function (p) { return chipFor(p, st.picks.indexOf(String(p.id))); }).join('') + '</div>';
                if (others.length) {
                    if (st.field || others.some(function (p) { return st.picks.indexOf(String(p.id)) > -1; })) {
                        html += '<div class="hb-h">Anyone in the field</div><div class="hb-chips">' + others.map(function (p) { return chipFor(p, st.picks.indexOf(String(p.id))); }).join('') + '</div>';
                    } else {
                        html += '<button type="button" class="hb-field" data-hb="field">+ Anyone in the field \u203a</button>';
                    }
                }
                // URGENT-017: a golfer who is not in the round yet - the Add golfer sheet over this one
                // (gps-add-golfer.js); the chips redraw with them in it.
                if (window.HardPanAddGolfer) html += '<button type="button" class="hb-field" data-hp-addgolfer="1">+ Add golfer</button>';
                var sh = shapeOf(st.game, st.picks, st.mode);
                html += '<div class="hb-vsrow"><div class="hb-vs" aria-live="polite">' + (vsLine(st.game, st.picks, st.mode) || '<span style="color:#8a958f">Tap the golfers in the order of the sides</span>') + '</div>'
                    + (st.game !== 'skins' && st.picks.length >= 2 ? '<button type="button" class="hb-swap" data-hb="swap" aria-label="Swap sides">\u21C4 Swap</button>' : '') + '</div>';
                html += '<div class="hb-why">' + (st.picks.length && !sh.ok ? esc(sh.why) : '') + '</div>';
                html += '<button type="button" class="hb-go" data-hb="next"' + (sh.ok ? '' : ' disabled') + '>Next: amount \u203a</button>';
            }
        } else {
            var g = GAMES[st.game], ids = st.picks.slice(), shp = shapeOf(st.game, ids, st.mode);
            var hs = ordered(), nowHole = startHole(ids);   // play order: the list reads 10..18, 1..9 off the 10th
            // 018: ANY hole, the played ones too; the default is still now (the first hole once all are played).
            if (st.from == null) st.from = nowHole || (hs[0] && hs[0].hole) || 1;
            if (st.stake == null) st.stake = g.chips[1];
            if (st.step === 3) { html += confirmHtml(g, ids); panel.innerHTML = html; return; }
            if (st.step === 4) { html += removeHtml(g, ids); panel.innerHTML = html; return; }
            html += '<div class="hb-head"><button type="button" class="hb-back" data-hb="back" aria-label="Back">‹</button><div class="hb-title">' + esc(g.label) + ' · ' + esc(g.stakeWord) + '</div><button type="button" class="hb-x" data-hb="close" aria-label="Close">✕</button></div>';
            html += '<div class="hb-vs" style="margin-top:0">' + vsLine(st.game, ids, st.mode) + '</div>';
            html += '<div class="hb-chips" style="margin-top:14px">' + g.chips.map(function (v) {
                return '<button type="button" class="hb-chip' + (!st.custom && st.stake === v ? ' on' : '') + '" data-hb-stake="' + v + '">$' + v + '</button>';
            }).join('') + (st.custom
                ? '<input class="hb-custom" type="number" inputmode="decimal" min="1" step="1" aria-label="Custom amount" value="' + esc(st.stake || '') + '">'
                : '<button type="button" class="hb-chip" data-hb="custom">Custom</button>') + '</div>';
            html += '<div class="hb-card">'
                + '<div class="hb-row"><span>Scoring</span><span class="hb-seg"><button type="button" data-hb-scoring="net" class="' + (st.scoring === 'net' ? 'on' : '') + '">Net</button><button type="button" data-hb-scoring="gross" class="' + (st.scoring === 'gross' ? 'on' : '') + '">Gross</button></span></div>'
                + '<div class="hb-row"><span>Counts from</span><select class="hb-from" aria-label="Counts from">' + hs.map(function (h) {
                    return '<option value="' + h.hole + '"' + (h.hole === st.from ? ' selected' : '') + '>Hole ' + h.hole + (h.hole === nowHole ? ' (now)' : '') + '</option>';
                }).join('') + '</select></div>'
                // PRESSES, one row (Match / Nassau only), default Off.
                + (g.presses ? '<div class="hb-row"><span>Presses</span><span class="hb-seg"><button type="button" data-hb-press="none" class="' + (st.press !== '2down' ? 'on' : '') + '">Off</button><button type="button" data-hb-press="2down" class="' + (st.press === '2down' ? 'on' : '') + '">Auto @ 2 down</button></span></div>' : '')
                + '</div>';
            html += '<div class="hb-worst" aria-live="polite">' + outlookHtml() + '</div>';
            html += '<div class="hb-why"></div>';
            html += '<button type="button" class="hb-go" data-hb="start"' + (Number(st.stake) > 0 ? '' : ' disabled') + '>' + (st.editId ? 'Save changes \u2713' : 'Start bet \u2713') + '</button>';
            if (st.editId) html += '<button type="button" class="hb-go hb-cancel hb-remove" data-hb="remove">Remove this bet</button>';
        }
        panel.innerHTML = html;
    }
    // ---- 018: BETS ON HOLES ALREADY PLAYED --------------------------------------
    // The holes of [from ..] that are already played (before "now" - the first hole nobody in
    // the bet has posted; every hole once all are in): { a, b, full } or null.
    function playedRange(ids, from) {
        var o = ordered(); if (!o.length) return null;
        var now = startHole(ids);
        var endI = now == null ? o.length - 1 : at(o, now) - 1, fromI = at(o, from);
        if (fromI < 0 || endI < fromI) return null;
        var list = o.slice(fromI, endI + 1).map(function (h) { return Number(h.hole); });
        return { a: list[0], b: list[list.length - 1], list: list, text: holesText(list), single: list.length === 1, full: now == null };
    }
    // THE RESULT SO FAR, read only: the round with this bet added, through the SAME
    // computeCombinedNetTotals every bet settles by, minus the round without it - per golfer,
    // exact (before whole-dollar rounding). Nothing is written.
    function preview(o) {
        var d = data(); if (!d || typeof computeCombinedNetTotals !== 'function') return null;
        var b = buildBet(o); if (b.refuse) return null;
        try {
            var cd = (d.courseData || []).slice().sort(function (x, y) { return x.hole - y.hole; });
            var slot = /sideMatches$/.test(b.path) ? 'sideMatches' : 'additionalGameInstances';
            // EDITING: the round without the bet as it stands, then with it as changed.
            if (o.skip) { d = JSON.parse(JSON.stringify(d)); if (d.sideMatches) delete d.sideMatches[o.skip]; if (d.additionalGameInstances) delete d.additionalGameInstances[o.skip]; }
            var d2 = JSON.parse(JSON.stringify(d));
            d2[slot] = d2[slot] || {}; d2[slot].__preview018 = b.value;
            var before = computeCombinedNetTotals(d, cd, d.scores || {}).exact || {};
            var after = computeCombinedNetTotals(d2, cd, d2.scores || {}).exact || {};
            var out = {};
            players().forEach(function (p) {
                var k = String(p.name).trim().toLowerCase();
                var v = ((after[k] || {}).net || 0) - ((before[k] || {}).net || 0);
                if (Math.abs(v) > 0.004) out[String(p.id)] = v;
            });
            // THE WORDS, from the screens that already say them: the Bets strip's status line
            // (bet-strip.js buildSideActionRows - "Bob/Manny 2&1", "Hi-Lo: ... (Low 5-3, High 4-3)")
            // and, for a Nassau, each segment's result off the receipt (buildSideMatchReceipts).
            var words = '';
            if (slot === 'sideMatches') {
                try {
                    var row = (typeof buildSideActionRows === 'function' ? buildSideActionRows(d2, cd, d2.scores || {}, d2.players || [], meId()) : []).filter(function (r) { return r && r.key === '__preview018'; })[0];
                    words = row ? String(row.status || '').replace(/^Hi-Lo:\s*/, '') : '';
                    if (b.value.format === 'nassau' && typeof buildSideMatchReceipts === 'function') {
                        var rc = buildSideMatchReceipts(d2, cd, d2.scores || {}).filter(function (r) { return r && r.matchId === '__preview018'; })[0];
                        if (rc && rc.segments && rc.segments.length) words = rc.segments.map(function (sg) { return sg.label + ' ' + (sg.result || 'All square'); }).join(' \u00b7 ');
                    }
                } catch (e) { words = ''; }
            }
            Object.defineProperty(out, '__words', { value: words, enumerable: false });
            return out;
        } catch (e) { return null; }
    }
    function moneyWord(v) { var r = Math.round(v * 100) / 100; return (r > 0 ? '+' : (r < 0 ? '−' : '')) + '$' + (Math.abs(r) % 1 ? Math.abs(r).toFixed(2) : Math.abs(r)); }
    function previewText(game, ids, pv) {
        if (!pv) return '';
        var sh = shapeOf(game, ids);
        var nm = function (list) { return list.map(function (id) { return first(byId(id)); }).join(' + '); };
        if (sh.ok && sh.a) {
            var words = pv.__words ? esc(pv.__words) + ' \u2192 ' : '';
            var va = pv[sh.a[0]] || 0;
            if (Math.abs(va) < 0.005) return (words || 'All square \u2192 ') + '$0';
            var win = va > 0 ? sh.a : sh.b, lose = va > 0 ? sh.b : sh.a, amt = Math.abs(va);
            return words + esc(nm(win)) + ' ' + moneyWord(amt) + (win.length > 1 ? ' each' : '')
                + ' \u00b7 ' + esc(nm(lose)) + ' ' + moneyWord(-Math.abs(pv[lose[0]] || amt)) + (lose.length > 1 ? ' each' : '');
        }
        var rows = Object.keys(pv).map(function (id) { return { id: id, v: pv[id] }; }).sort(function (x, y) { return y.v - x.v; });
        if (!rows.length) return 'Nobody has won anything yet → $0';
        return rows.map(function (r) { return esc(first(byId(r.id))) + ' ' + moneyWord(r.v); }).join(' · ');
    }
    // The line under the terms: the worst case (holes still to play), or - with holes already
    // played - which ones, and the result so far; a bet over holes all played shows its result.
    function outlookHtml() {
        var ids = st.picks.slice(), shp = shapeOf(st.game, ids, st.mode), from = st.from || 1, stake = Number(st.stake) || 0;
        var pr = playedRange(ids, from);
        var html = '';
        if (pr) {
            html += '<div class="hb-played">' + (pr.single ? 'Hole ' : 'Holes ') + pr.text + ' already played: this bet settles from the scores already in.</div>';
            var pv = stake > 0 ? preview({ game: st.game, mode: st.mode, press: st.press, picks: ids, stake: stake, scoring: st.scoring, startHole: from, skip: st.editId }) : null;
            var t = previewText(st.game, ids, pv);
            if (t) html += '<div class="hb-result">' + (pr.full ? 'Result: ' : 'So far: ') + '<b>' + t + '</b></div>';
            if (pr.full) return html;
        }
        var w = worstCase(st.game, stake, shp, from);
        return html + (w.mine ? 'Worst case for you: ' : 'Worst case each: ') + '<b>−$' + w.amount + '</b>'
            + (w.presses ? ' (no presses)' : '') + (st.game === 'hilo' ? ' · Ties are a wash' : '');
    }
    // ONE CONFIRM, in the sheet (never a native dialog), only for a start before now.
    function confirmHtml(g, ids) {
        var pr = playedRange(ids, st.from || 1);
        var pv = preview({ game: st.game, mode: st.mode, press: st.press, picks: ids, stake: st.stake, scoring: st.scoring, startHole: st.from, skip: st.editId });
        var t = previewText(st.game, ids, pv);
        return '<div class="hb-head"><div class="hb-title">Add this bet for holes already played?</div></div>'
            + '<div class="hb-vs" style="margin-top:0">' + esc(g.label) + ' · $' + esc(st.stake) + ' · ' + vsLine(st.game, ids, st.mode) + '</div>'
            + '<div class="hb-worst">Everyone in it should agree.' + (pr ? ' Counts from hole ' + pr.a + (pr.full ? ' - every hole is in.' : '.') : '') + '</div>'
            + (t ? '<div class="hb-result">' + (pr && pr.full ? 'Result: ' : 'So far: ') + '<b>' + t + '</b></div>' : '')
            + '<button type="button" class="hb-go" data-hb="confirm-add">Add bet</button>'
            + '<button type="button" class="hb-go hb-cancel" data-hb="confirm-cancel">Cancel</button>';
    }
    function onInput(e) {
        if (e.target && e.target.classList.contains('hb-custom') && st) {
            st.stake = Number(e.target.value) || 0;
            var go = root().querySelector('[data-hb="start"]'); if (go) go.disabled = !(st.stake > 0);
            var wo = root().querySelector('.hb-worst'); if (wo) wo.innerHTML = outlookHtml();
        }
    }
    function onChange(e) {
        if (e.target && e.target.classList.contains('hb-from') && st) { st.from = Number(e.target.value) || st.from; draw(); }
    }
    function onClick(e) {
        var t = e.target;
        if (t.classList && t.classList.contains('hb-scrim')) { var rt1 = st && st.returnTo; close(); if (rt1 && /\.html/.test(rt1)) goBack(rt1); return; }
        var b = t.closest ? t.closest('button') : null;
        if (!b || !st) return;
        var a = b.getAttribute('data-hb');
        if (b.hasAttribute('data-hb-mode')) {
            var md = b.getAttribute('data-hb-mode');
            if (md !== st.mode) { st.mode = md; st.picks = []; st.more = false; if (st.game && tiles(md).indexOf(st.game) === -1) st.game = null; }
            draw(); return;
        }
        if (b.hasAttribute('data-hb-game')) { var g = b.getAttribute('data-hb-game'); if (g !== st.game) { st.game = g; if (g === 'hilo') st.mode = '2v2'; } draw(); return; }
        if (b.hasAttribute('data-hb-press')) { st.press = b.getAttribute('data-hb-press') === '2down' ? '2down' : 'none'; draw(); return; }
        if (b.hasAttribute('data-hb-pick')) {
            var id = String(b.getAttribute('data-hb-pick')), i = st.picks.indexOf(id);
            if (i > -1) st.picks.splice(i, 1); else st.picks.push(id);
            st.from = null;
            draw(); return;
        }
        if (b.hasAttribute('data-hb-stake')) { st.stake = Number(b.getAttribute('data-hb-stake')); st.custom = false; draw(); return; }
        if (b.hasAttribute('data-hb-scoring')) { st.scoring = b.getAttribute('data-hb-scoring'); draw(); return; }
        if (a === 'close') { var rt0 = st.returnTo; close(); if (rt0 && /\.html/.test(rt0)) goBack(rt0); return; }
        if (a === 'field') { st.field = true; draw(); return; }
        if (a === 'custom') { st.custom = true; draw(); var inp = root().querySelector('.hb-custom'); if (inp) inp.focus(); return; }
        if (a === 'back') { st.step = 1; draw(); return; }
        if (a === 'more') { st.more = true; draw(); return; }
        if (a === 'less') { st.more = false; if (st.game === 'skins') { st.game = null; st.picks = []; } draw(); return; }
        if (a === 'other') { var rt = st.returnTo; close(); moreGames(rt); return; }
        if (a === 'swap') {
            var n = st.picks.length;
            st.picks = (n >= 4 || (st.mode === '2v2' && n > 2)) ? st.picks.slice(2).concat(st.picks.slice(0, 2)) : st.picks.slice().reverse();
            st.from = null; draw(); return;
        }
        if (a === 'remove') { st.step = 4; draw(); return; }
        if (a === 'remove-yes') { removeBet(); return; }
        if (a === 'remove-no') { st.step = 2; draw(); return; }
        if (a === 'next') { if (shapeOf(st.game, st.picks, st.mode).ok) { st.step = 2; if (!st.editId) st.from = null; draw(); } return; }
        if (a === 'start') { if (playedRange(st.picks.slice(), st.from || 1)) { st.step = 3; draw(); } else start(); return; }
        if (a === 'confirm-add') { start(); return; }
        if (a === 'confirm-cancel') { st.step = 2; draw(); return; }
    }
    function say(kind, msg) {
        try {
            if (kind === 'refuse' && typeof uiRefuse === 'function') return uiRefuse('⚠️ ' + msg);
            if (kind === 'fail' && typeof uiFail === 'function') return uiFail('⚠️ ' + msg);
            if (typeof uiToast === 'function') return uiToast(msg);
        } catch (e) {}
    }
    function betLine(rec) {
        var nm = function (ids) { return (ids || []).map(function (id) { return first(byId(id)); }).join(' + '); };
        var g = GAMES[rec.format] || {}, amt = rec.format === 'skins' ? rec.skinsBuyIn : (rec.format === 'stroke' ? rec.overallStake : (rec.stake || rec.frontStake));
        var who = rec.format === 'skins' ? ((rec.participantIds || players().map(function (p) { return String(p.id); })).map(function (id) { return first(byId(id)); }).join(', '))
            : nm(rec.teamAIds) + ' vs ' + nm(rec.teamBIds);
        return who + ' · $' + (Number(amt) || 0) + ' ' + (g.label || rec.format);
    }
    // THE WRITE: a new bet at a new key (New Action's path), or - editing - the same record
    // rebuilt by the same builder at its own key, keeping what was hung on it since (presses,
    // the Aloha) and when it was made. New Action has no edit of its own: there a change was a
    // remove and a new bet; this keeps the bet's identity instead.
    var KEEP = ['presses', 'holePresses', 'overallPresses', 'aloha', 'createdAt'];
    function write(b, editId) {
        var key = editId || db.ref(b.path).push().key;
        var full = b.path + '/' + key, value = b.value;
        if (editId) {
            var old = (betAt(editId) || {}).rec || {};
            // Skins keeps what the sheet does not ask: its carry-over and enabled state.
            if (b.value.format === 'skins') { if (old.skinsCarryOver !== undefined) b.value.skinsCarryOver = old.skinsCarryOver; }
            value = JSON.parse(JSON.stringify(value));
            KEEP.forEach(function (k) { if (old[k] !== undefined) value[k] = old[k]; });
        }
        var p = (typeof durableWrite === 'function') ? durableWrite(full, 'set', value, full) : db.ref(full).set(value);
        return { key: key, promise: p, value: value };
    }
    function withToast(url, text) { return url + (url.indexOf('?') > -1 ? '&' : '?') + 'hptoast=' + encodeURIComponent(text); }
    function goBack(url) { try { window.location.href = url; } catch (e) {} }
    // BACK WHERE THE GOLFER WAS (URGENT-014): a page it came from; Bets (the sheet is still
    // under this one); Settle up; otherwise a GPS round's map - the hole it is on, the map as it
    // was (no reload) - or the scorecard.
    function afterSave(rt) {
        if (rt && /\.html/.test(rt)) { goBack(rt); return; }
        var R = window.HardPanRound;
        if (rt === 'bets') return;
        if (rt === 'finish') { if (R && R.openFinish) R.openFinish(); return; }
        var g = window.HardPanGps;
        if (R && g && g.isMounted && g.isMounted() && g.canMap && g.canMap()) { if (g.side() !== 'gps') R.toGps(); }
        else if (R && R.toCard) R.toCard();
    }
    function toastBet(text, key) {
        var el = null;
        try { if (typeof uiToast === 'function') el = uiToast(text); } catch (e) {}
        if (el && key && el.addEventListener) {
            el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.setAttribute('role', 'button');
            el.addEventListener('click', function () { open(null, { editId: key }); });
        }
        return el;
    }
    function start() {
        var b = buildBet({ game: st.game, mode: st.mode, press: st.press, picks: st.picks, stake: st.stake, scoring: st.scoring, startHole: st.from });
        if (b.refuse) { var w = root().querySelector('.hb-why'); if (w) w.textContent = b.refuse; return; }
        var editId = st.editId, rt = st.returnTo, res;
        try { res = write(b, editId); } catch (e) { say('fail', 'Could not save: ' + (e && e.message)); return; }
        close();
        var text = (editId ? 'Bet changed: ' : 'Bet added: ') + betLine(res.value);
        var stay = rt && /\.html/.test(rt);
        if (!stay) toastBet(text, res.key);
        // Back on its page, the same words (?hptoast=, read once there).
        if (stay) rt = withToast(rt, text);
        var p = res.promise;
        if (p && typeof p.then === 'function') p.then(function () { refresh(); if (stay) afterSave(rt); }, function (err) { say('fail', 'Could not save: ' + (err && err.message)); });
        else if (stay) afterSave(rt);
        setTimeout(refresh, 0);
        if (!stay) afterSave(rt);
    }
    // REMOVE: in the sheet, "Everyone in the bet agreed?" - then the record goes, the way the
    // Matches page removes one (its own path, the same group rule: the organizer, or a group
    // with a golfer in it).
    function removeHtml(g, ids) {
        return '<div class="hb-head"><div class="hb-title">Remove this bet?</div></div>'
            + '<div class="hb-vs" style="margin-top:0">' + esc(g.label) + ' · ' + vsLine(st.game, ids, st.mode) + '</div>'
            + '<div class="hb-worst">Everyone in the bet agreed?</div><div class="hb-why"></div>'
            + '<button type="button" class="hb-go hb-danger" data-hb="remove-yes">Yes - remove it</button>'
            + '<button type="button" class="hb-go hb-cancel" data-hb="remove-no">Cancel</button>';
    }
    function removeBet() {
        var id = st.editId, at0 = betAt(id), sm = at0 && at0.rec;
        if (!sm) { close(); return; }
        var g = locked(), m = groupMap(), skins = at0.slot === 'additionalGameInstances';
        var ids = (skins ? (sm.participantIds || players().map(function (p) { return p.id; })) : (sm.teamAIds || []).concat(sm.teamBIds || [])).map(String);
        // The same rules as creating one: a group link removes a skins game only inside its
        // group, a match only with one of its golfers in it.
        var okHere = !g || (skins ? ids.every(function (x) { return String(m[x]) === String(g); }) : ids.some(function (x) { return String(m[x]) === String(g); }));
        if (!okHere) { var w = root().querySelector('.hb-why'); if (w) w.textContent = 'This is Group ' + g + '\u2019s link - ' + (skins ? 'only a Group ' + g + ' skins game' : 'only a bet with a Group ' + g + ' golfer in it') + ' can be removed here.'; return; }
        // Removed at its own path - the round game the way Round Setup drops one (it is simply
        // no longer in the map), the side match the way the Matches page does.
        var path = 'events/' + code() + '/' + at0.slot + '/' + id, rt = st.returnTo, line = betLine(sm);
        try { if (typeof durableWrite === 'function') durableWrite(path, 'remove', null, path); else db.ref(path).remove(); } catch (e) { say('fail', 'Could not remove: ' + (e && e.message)); return; }
        close();
        if (!(rt && /\.html/.test(rt))) say('toast', 'Bet removed: ' + line);
        setTimeout(refresh, 0);
        if (rt && /\.html/.test(rt)) goBack(withToast(rt, 'Bet removed: ' + line));
    }
    // OTHER GAMES: the full New Action page (Dots, 9 Points ...), back to this round afterwards.
    function moreGames(rt) {
        var g = locked();
        window.location.href = 'sidematches.html?game=' + encodeURIComponent(code() || '') + (g ? '&group=' + g : '') + '&hpback=1&hpfull=1';
    }

    // ---- WEEKLY GAME SETTINGS, IN PLACE (URGENT-018) --------------------------------
    // Round settings › Weekly Game, and "KP pool / Weekly game" in Add a game: a small sheet
    // over the round - buy-in, KP $ + holes, net finish, skins (take the rest / a fixed $ /
    // none, net or gross, carry) - instead of Round Setup's whole wizard (Step 4 Money).
    // THE SAME RECORD ROUND SETUP WRITES: events/<code>/moneyPool in captureMoneyPool()'s
    // shape ({ enabled, buyIn, kp: { amount, holes }, net: { amount, places } or { payoutMode:
    // 'custom', amounts }, skins: { mode, scoring, carryOver[, amount] }), every other key on
    // the saved pool riding along (mergePreservedPoolFields' rule), and the SAME gate as its
    // Save: pool-engine.js validateMoneyPool on this round's golfers and holes - refused with
    // its reason. Turning it off writes moneyPool: null (what an unticked box saves). Organizer
    // only (canReachSetup), online only (requireOnlineForMoney), as the Players sheet.
    // No engine is touched.
    var wk = null;
    var NET_PRESETS = [[100], [60, 40], [50, 30, 20], [40, 30, 20, 10]];
    function wkRoot() {
        var r = document.getElementById('hp-weekly');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-weekly'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Weekly Game');
        r.innerHTML = '<div class="hb-scrim" data-wk="close"></div><div class="hb-panel gps-scroll-ok"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', wkClick);
        r.addEventListener('input', wkInput);
        r.addEventListener('change', wkInput);
        return r;
    }
    function wkOpen() { var r = document.getElementById('hp-weekly'); return !!(r && r.classList.contains('open')); }
    function wkHoles() { var d = data() || {}; return (d.courseData || []).filter(function (h) { return h && h.hole; }).map(function (h) { return { n: parseInt(h.hole, 10), par: Number(h.par) }; }).sort(function (a, b) { return a.n - b.n; }); }
    function organizerHere() { try { return typeof canReachSetup === 'function' && !!canReachSetup(); } catch (e) { return false; } }
    function openWeekly(opts) {
        var o = opts || {};
        if (!on() || !data() || !code()) return false;
        var mp = data().moneyPool, has = !!(mp && mp.enabled !== false);
        var base = has ? JSON.parse(JSON.stringify(mp)) : { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: null, skins: { mode: 'remainder', scoring: 'net', carryOver: true } };
        var net = base.net || null, custom = !!(net && net.payoutMode === 'custom');
        wk = { on: has || o.turnOn === true, pool: base, buyIn: String(base.buyIn != null ? base.buyIn : ''),
            kpAmt: String(base.kp && base.kp.amount ? base.kp.amount : ''), kpHoles: (base.kp && Array.isArray(base.kp.holes) ? base.kp.holes : []).map(Number),
            netCustom: custom, netAmt: String(net && !custom && net.amount ? net.amount : ''), netPlaces: net && !custom && Array.isArray(net.places) ? net.places.map(Number) : [60, 40],
            netAmounts: custom ? net.amounts.slice() : ['', ''],
            skMode: (base.skins && base.skins.mode) || 'remainder', skAmt: String(base.skins && base.skins.amount ? base.skins.amount : ''),
            skScoring: (base.skins && base.skins.scoring) || 'net', skCarry: !(base.skins && base.skins.carryOver === false),
            err: '', saving: false, returnTo: o.returnTo || null, onDone: o.onDone || null };
        wkDraw();
        wkRoot().classList.add('open');
        return true;
    }
    function wkClose() { var r = document.getElementById('hp-weekly'); if (r) r.classList.remove('open'); wk = null; }
    function wkPool() {
        var num = function (v) { return parseFloat(v) || 0; };
        var pool = { enabled: true, buyIn: num(wk.buyIn) };
        if (num(wk.kpAmt) > 0) pool.kp = { amount: num(wk.kpAmt), holes: wk.kpHoles.slice().sort(function (a, b) { return a - b; }) };
        if (wk.netCustom) { var am = wk.netAmounts.map(function (v) { var n = parseFloat(v); return isNaN(n) ? '' : n; }); if (am.some(function (v) { return v !== ''; })) pool.net = { payoutMode: 'custom', amounts: am }; }
        else if (num(wk.netAmt) > 0) pool.net = { amount: num(wk.netAmt), places: wk.netPlaces.slice() };
        pool.skins = { mode: wk.skMode, scoring: wk.skScoring, carryOver: wk.skCarry };
        if (wk.skMode === 'fixed') pool.skins.amount = num(wk.skAmt);
        // Every key Round Setup's form does not own rides along (participantIds, ...).
        Object.keys(wk.pool || {}).forEach(function (k) { if (['enabled', 'buyIn', 'kp', 'net', 'skins'].indexOf(k) === -1 && pool[k] === undefined) pool[k] = wk.pool[k]; });
        return pool;
    }
    function wkCheck(pool) {
        if (typeof validateMoneyPool !== 'function') return { valid: false, errors: ['This page cannot check the pot - use Round settings › Full setup.'] };
        var d = data() || {};
        return validateMoneyPool(Object.assign({}, d, { moneyPool: pool }), d.courseData || []);
    }
    function wkDraw() {
        if (!wk) return;
        var panel = wkRoot().querySelector('.hb-panel'), y = panel.scrollTop;
        var seg = function (k, v, label) { return '<button type="button" data-wk-set="' + k + '" data-v="' + v + '" class="' + (String(wk[k]) === String(v) ? 'on' : '') + '">' + label + '</button>'; };
        var h = '<div class="hb-grab"></div><div class="hb-head"><div class="hb-title">Weekly Game</div><button type="button" class="hb-x" data-wk="close" aria-label="Close">✕</button></div>';
        h += '<div class="hb-card"><div class="hb-row"><span>Weekly Game</span><span class="hb-seg">' + seg('on', true, 'On') + seg('on', false, 'Off') + '</span></div></div>';
        if (wk.on) {
            var pool = wkPool(), v = wkCheck(pool), holes = wkHoles();
            h += '<div class="hb-card">'
                + '<div class="hb-row"><span>Buy-in</span><span>$ <input class="hb-custom" data-wk-in="buyIn" inputmode="decimal" value="' + esc(wk.buyIn) + '" aria-label="Buy-in"></span></div>'
                + '<div class="hb-row"><span>Pot</span><b id="wk-pot">$' + esc(String(Math.round(v.totalPool || 0))) + '</b></div></div>';
            h += '<div class="hb-h">KP (closest to the pin)</div><div class="hb-card"><div class="hb-row"><span>KP money</span><span>$ <input class="hb-custom" data-wk-in="kpAmt" inputmode="decimal" value="' + esc(wk.kpAmt) + '" aria-label="KP money"></span></div></div>';
            if (holes.length) h += '<div class="hb-chips" style="margin-top:8px;">' + holes.map(function (x) { return '<button type="button" class="hb-chip' + (wk.kpHoles.indexOf(x.n) > -1 ? ' on' : '') + '" data-wk-kp="' + x.n + '" aria-pressed="' + (wk.kpHoles.indexOf(x.n) > -1) + '">' + x.n + (x.par === 3 ? ' · P3' : '') + '</button>'; }).join('') + '</div>';
            h += '<div class="hb-h">Net finish</div><div class="hb-card">';
            if (wk.netCustom) {
                h += wk.netAmounts.map(function (a, i) { return '<div class="hb-row"><span>' + ['1st', '2nd', '3rd', '4th'][i] + '</span><span>$ <input class="hb-custom" data-wk-netc="' + i + '" inputmode="decimal" value="' + esc(a) + '"></span></div>'; }).join('');
            } else {
                h += '<div class="hb-row"><span>Net money</span><span>$ <input class="hb-custom" data-wk-in="netAmt" inputmode="decimal" value="' + esc(wk.netAmt) + '" aria-label="Net money"></span></div>'
                    + '<div class="hb-row"><span>Paid</span><span class="hb-seg">' + NET_PRESETS.map(function (p) { return '<button type="button" data-wk-places="' + p.join(',') + '" class="' + (p.join(',') === wk.netPlaces.join(',') ? 'on' : '') + '">' + (p.length === 1 ? 'Winner' : p.join('/')) + '</button>'; }).join('') + '</span></div>';
            }
            h += '</div>';
            h += '<div class="hb-h">Skins</div><div class="hb-card">'
                + '<div class="hb-row"><span>Money</span><span class="hb-seg">' + seg('skMode', 'remainder', 'The rest') + seg('skMode', 'fixed', 'Fixed $') + seg('skMode', 'none', 'None') + '</span></div>'
                + (wk.skMode === 'fixed' ? '<div class="hb-row"><span>Skins money</span><span>$ <input class="hb-custom" data-wk-in="skAmt" inputmode="decimal" value="' + esc(wk.skAmt) + '"></span></div>' : '')
                + (wk.skMode !== 'none' ? '<div class="hb-row"><span>Scoring</span><span class="hb-seg">' + seg('skScoring', 'net', 'Net') + seg('skScoring', 'gross', 'Gross') + '</span></div>'
                    + '<div class="hb-row"><span>Ties carry over</span><span class="hb-seg">' + seg('skCarry', true, 'Yes') + seg('skCarry', false, 'No') + '</span></div>' : '')
                + '</div>';
            var line = v.valid ? ('$' + Math.round(v.totalPool) + ' pot' + (wk.skMode === 'remainder' ? ' · $' + Math.round(v.remainder) + ' to skins' : '')) : (v.errors || [])[0];
            h += '<div class="hb-why" id="wk-why">' + esc(wk.err || line || '') + '</div>';
            if (typeof moneyPoolRulesLocked === 'function' && moneyPoolRulesLocked(data() || {})) h += '<div class="hb-worst">Scores are in: a change here changes who is paid, for everyone.</div>';
        }
        h += '<button type="button" class="hb-go" data-wk="save"' + (wk.saving ? ' disabled' : '') + '>' + (wk.saving ? 'Saving…' : 'Save') + '</button>'
            + '<button type="button" class="hb-go hb-cancel" data-wk="close">Cancel</button>';
        panel.innerHTML = h;
        panel.scrollTop = y;
    }
    function wkInput(ev) {
        var t = ev.target; if (!wk || !t) return;
        var k = t.getAttribute('data-wk-in'), c = t.getAttribute('data-wk-netc');
        if (k) wk[k] = t.value;
        else if (c != null) wk.netAmounts[Number(c)] = t.value;
        else return;
        wk.err = '';
        var v = wkCheck(wkPool()), why = document.getElementById('wk-why'), pot = document.getElementById('wk-pot');
        if (pot) pot.textContent = '$' + Math.round(v.totalPool || 0);
        if (why) why.textContent = v.valid ? ('$' + Math.round(v.totalPool) + ' pot' + (wk.skMode === 'remainder' ? ' · $' + Math.round(v.remainder) + ' to skins' : '')) : (v.errors || [])[0] || '';
    }
    function wkClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null, b;
        if (!t || !wk) return;
        if ((b = t.closest('[data-wk-set]'))) { var k = b.getAttribute('data-wk-set'), v = b.getAttribute('data-v'); wk[k] = v === 'true' ? true : v === 'false' ? false : v; wk.err = ''; wkDraw(); return; }
        if ((b = t.closest('[data-wk-kp]'))) { var n = Number(b.getAttribute('data-wk-kp')), i = wk.kpHoles.indexOf(n); if (i > -1) wk.kpHoles.splice(i, 1); else wk.kpHoles.push(n); wkDraw(); return; }
        if ((b = t.closest('[data-wk-places]'))) { wk.netPlaces = b.getAttribute('data-wk-places').split(',').map(Number); wkDraw(); return; }
        b = t.closest('[data-wk]'); if (!b) return;
        var a = b.getAttribute('data-wk');
        if (a === 'close') { var rt = wk.returnTo; wkClose(); if (rt) afterSave(rt); return; }
        if (a === 'save') wkSave();
    }
    function wkSave() {
        if (!wk || wk.saving) return;
        if (!organizerHere()) { wk.err = 'Only the round’s organizer can change the Weekly Game.'; wkDraw(); return; }
        var pool = wk.on ? wkPool() : null;
        if (pool) { var v = wkCheck(pool); if (!v.valid) { wk.err = 'NOT SAVED — ' + (v.errors || ['check the pot'])[0]; wkDraw(); return; } }
        if (typeof requireOnlineForMoney === 'function' && !requireOnlineForMoney('NOT SAVED', 'Reconnect before changing the Weekly Game.')) return;
        wk.saving = true; wkDraw();
        var w = wk, cb = w.onDone, rt = w.returnTo;
        db.ref('events/' + code()).update({ moneyPool: pool }).then(function () {
            wkClose();
            say('toast', pool ? 'Weekly Game saved: $' + pool.buyIn + ' in' : 'Weekly Game off');
            setTimeout(refresh, 0);
            if (typeof cb === 'function') { try { cb(pool); } catch (e) {} }
            if (rt) afterSave(rt);
        }, function (err) { if (wk !== w) return; w.saving = false; w.err = 'NOT SAVED — ' + ((err && err.message) || 'try again'); wkDraw(); });
    }

    // ---- THE CARD SIDE: money chip + "+ Bet" -----------------------------------
    function cardBar() {
        var bar = document.getElementById('hp-card-bet');
        if (bar) return bar;
        ensureCss();
        bar = document.createElement('div');
        bar.id = 'hp-card-bet';
        bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Round');
        bar.innerHTML = '<button type="button" class="hp-money-chip" data-hp-money="card" style="display:none" aria-label="Your money - open Bets"></button>'
            + '<button type="button" class="hp-bar-btn hp-bar-icon" data-hp-bar="menu" style="display:none" aria-label="Round Menu">☰</button>'
            + '<button type="button" class="hp-bar-btn" data-hp-bar="card" style="display:none" aria-label="Scorecard">Card</button>'
            + '<button type="button" class="hp-bar-btn" data-hp-bar="gps" style="display:none" aria-label="Back to the map">📍 GPS</button>'
            + '<button type="button" class="hp-bar-btn hp-bar-score" data-hp-bar="score" style="display:none" aria-label="Enter score">Enter score</button>'
            + '<button type="button" class="hp-bet-btn" aria-label="Add a bet">+ Bet</button>';
        bar.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button') : null;
            if (!b) return;
            e.preventDefault();
            if (b.classList.contains('hp-bet-btn')) { open(null, { returnTo: document.body.classList.contains('hp-bets-open') ? 'bets' : null }); return; }
            if (b.classList.contains('hp-money-chip')) { openBets(); return; }
            var R = window.HardPanRound, k = b.getAttribute('data-hp-bar');
            if (R && typeof R.go === 'function') R.go(k);
        });
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
    // FROM ANOTHER PAGE (URGENT-014): index.html?hpbet=1[&hpedit=<id>]&hpret=<page> - the Bets tab,
    // Results or the Matches page sent the golfer here for the ONE sheet; Start / Cancel go back.
    var urlDone = false;
    function fromUrl() {
        if (urlDone) return;
        var q; try { q = new URLSearchParams(window.location.search); } catch (e) { urlDone = true; return; }
        urlDone = true;
        if (q.get('hpbet') !== '1') return;
        var ret = q.get('hpret');
        if (ret && !/^[a-z0-9_-]+\.html(\?|$)/i.test(ret)) ret = null;
        var edit = q.get('hpedit');
        try { ['hpbet', 'hpret', 'hpedit'].forEach(function (k) { q.delete(k); }); history.replaceState(history.state, '', window.location.pathname + '?' + q.toString()); } catch (e) {}
        setTimeout(function () { if (!open(null, { returnTo: ret, editId: edit }) && ret) goBack(ret); }, 0);
    }
    var last = null;
    function refresh() {
        if (!on()) { document.body.classList.toggle('hp-sf-card', false); return null; }   // toggle: no write when unchanged (gps-round.js observes <body>)
        var d = data();
        var live = !!(d && code() && (d.players || []).length);
        document.body.classList.toggle('hp-sf-card', live);
        if (!live) return null;
        fromUrl();
        var m = moneyNow();
        last = m;
        var bar = cardBar();
        paintChip(bar.querySelector('.hp-money-chip'), m);
        var R = window.HardPanRound;
        if (R && typeof R.barFor === 'function') {
            var want = R.barFor();   // { menu, gps, card }
            ['menu', 'gps', 'card', 'score'].forEach(function (k) { var e = bar.querySelector('[data-hp-bar="' + k + '"]'); if (e) e.style.display = want[k] ? '' : 'none'; });
        }
        Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay .gps-money'), function (el) { paintChip(el, m); });
        // Part D: the Bets / Leaderboard frames get this round at once too (gps-round.js feed).
        if (R && typeof R.feed === 'function') { try { R.feed(); } catch (e) {} }
        return m;
    }

    var api = {
        on: on, open: open, close: close, isOpen: isOpen, refresh: refresh, openBets: openBets,
        redraw: function () { if (isOpen()) draw(); },
        openWeekly: openWeekly, closeWeekly: wkClose, weeklyOpen: wkOpen,
        hiloHere: hiloHere, tiles: tiles, preview: preview, playedRange: playedRange,
        // Pure-ish pieces for the tests.
        shapeOf: shapeOf, buildBet: buildBet, worstCase: worstCase, moneyNow: moneyNow,
        money: function () { return last; },
        paintChip: paintChip
    };
    window.HardPanBet = api;
    if (window.GolfBack && typeof window.GolfBack.register === 'function') {
        try { window.GolfBack.register({ name: 'hp-weekly', priority: 2, isOpen: wkOpen, close: wkClose }); } catch (e) {}
        try { window.GolfBack.register({ name: 'hp-bet', priority: 1, isOpen: isOpen, close: function () { if (st && st.step > 1) { st.step -= 1; draw(); } else close(); } }); } catch (e) {}
    }
})();
