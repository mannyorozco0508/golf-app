// ============================================================================
// HARDPAN - THE "+ GAME" SHEET (job 100b; Manny OK'd the plan + the pictures, 12:35 PM Oct 29)
//
// ANY golfer (never a spectator) starts ANY game at ANY hole, from the card bar ("+ Game" next to
// Enter score) or the GPS map ("+ Game" above Mark) - the preview pictures in
// claude-code-reports/100/preview (A0-A3). One sheet:
//   the game grid with the golfers each game takes  ·  Who's in  ·  Starts: Hole N (now) / Next 9 /
//   Pick  ·  ONE line saying what counts  ·  the amount (+ presses)  ·  a big "Start Nassau · Me vs Jim".
//
// NO NEW MONEY. Every game is written as the record its engine already reads:
//   Match / Nassau / Stroke / Hi-Lo / Skins   gps-bet.js buildBet (challenges.js sideMatchPayloadFromTerms
//                                             - New Action's builder) -> sideMatches / additionalGameInstances
//   Dots / 9 Points / Stableford              New Action's saveFieldAction shape -> additionalGameInstances
//   Vegas / BBB / Wolf, KP / Birdies pots     additionalGameInstances with inSettle: true (100c's engines);
//                                             their tiles are live only once those engines are in (below)
//   Team match / Ryder                        N Match side matches, auto-paired (1v1 / 2v2)
// every write through index.html durableWrite (the offline queue) via gps-bet.js write().
// A MID-ROUND GAME SCORES FROM ITS START HOLE ONLY (Manny's 099 answer 2): Pick offers the holes
// still to play, never a played one. A Nassau whose holes are all in one nine is ONE bet over the
// holes left, and the sheet says so ("Nassau from 15 = one bet, 15-18") - Manny's 100-PLAN answer 2.
// Scramble / Points game / Weekly pool / Long Drive: "The organizer sets this up in Round Setup".
// Nothing is removed: + Bet, Add a game and the Matches page are all still there.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    function B() { return window.HardPanBet || null; }
    function on() { try { return !!(B() && B().on()); } catch (e) { return false; } }
    /* global currentData, ADDITIONAL_GAME_CATALOG, uiRefuse, uiToast */
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---- WHAT THE ENGINES CAN TAKE TODAY ------------------------------------------
    // Vegas / BBB count in Settle up only with 100c (window.HP_SETTLE_VEGAS_BBB); Wolf as a side game
    // only once the catalog has it; KP / Birdies pots only once a Dots game can be limited to some dots.
    function catalog() { try { return typeof ADDITIONAL_GAME_CATALOG !== 'undefined' ? ADDITIONAL_GAME_CATALOG : {}; } catch (e) { return {}; } }
    function ready(k) {
        if (k === 'vegas' || k === 'bbb') return window.HP_SETTLE_VEGAS_BBB === true || typeof window.computeVegasBbbSettle === 'function';
        if (k === 'wolf') return !!catalog().wolf;
        if (k === 'kp' || k === 'birdies') return !!(catalog().dots && catalog().dots.typeFilter === true);
        return true;
    }

    // ---- THE GAMES -------------------------------------------------------------------
    // need: 'pair' = 2 (1 v 1) or 4 (2 v 2); a number = exactly that many; '2+' = two or more.
    var G = {
        nassau:     { ico: '💵', label: 'Nassau', need: 'pair', sub: '2+ golfers', kind: 'side', chips: [2, 5, 10], stakeWord: '$ each nine + 18', presses: true },
        match:      { ico: '⚔️', label: 'Match', need: 'pair', sub: '2+ golfers', kind: 'side', chips: [5, 10, 20], stakeWord: '$ a side', presses: true },
        skins:      { ico: '💰', label: 'Skins', need: '2+', sub: '2+ golfers', kind: 'side', chips: [5, 10, 20], stakeWord: '$ each in' },
        wolf:       { ico: '🐺', label: 'Wolf', need: 4, sub: '4 golfers', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a point' },
        vegas:      { ico: '🎲', label: 'Vegas', need: 4, sub: '4 golfers · 2 teams', kind: 'inst', chips: [0.5, 1, 2], stakeWord: '$ a point' },
        bbb:        { ico: '🟢', label: 'BBB', need: '2+', sub: '2+ golfers', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a point' },
        stableford: { ico: '⭐', label: 'Stableford', need: '2+', sub: '2+ golfers', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a point' },
        hilo:       { ico: '↕️', label: 'Hi-Lo', need: 4, sub: '4 golfers', kind: 'side', chips: [1, 5, 10], stakeWord: '$ a point' },
        nines:      { ico: '🔢', label: '9 Points', need: 3, sub: '3 golfers', kind: 'inst', chips: [0.5, 1, 2], stakeWord: '$ a point' },
        dots:       { ico: '🔵', label: 'Dots', need: '2+', sub: '2+ golfers', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a dot' },
        stroke:     { ico: '🏌️', label: 'Stroke', need: 'pair', sub: '2+ golfers', kind: 'side', chips: [5, 10, 20], stakeWord: '$ overall' },
        // MORE
        team:       { ico: '👥', label: 'Team match', need: 'even', sub: 'Pairs up 1 v 1s', kind: 'pairs', chips: [5, 10, 20], stakeWord: '$ a match', presses: true, more: true },
        ryder:      { ico: '🏆', label: 'Ryder', need: 'ryder', sub: '2 v 2 matches', kind: 'pairs', chips: [5, 10, 20], stakeWord: '$ a match', presses: true, more: true },
        kp:         { ico: '⛳', label: 'KP pot', need: '2+', sub: 'KPs from the start hole', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a KP', more: true },
        birdies:    { ico: '🐦', label: 'Birdies', need: '2+', sub: 'Birdies + eagles', kind: 'inst', chips: [1, 2, 5], stakeWord: '$ a birdie', more: true },
        longdrive:  { ico: '🏌️', label: 'Long Drive', sub: 'Organizer', org: 'Long Drive is paid from the Weekly Game’s KP money.', more: true },
        scramble:   { ico: '🤝', label: 'Scramble', sub: 'Organizer', org: 'A scramble has one team score a hole.', more: true },
        points:     { ico: '📊', label: 'Points game', sub: 'Organizer', org: 'The Points game is league standings, not a side bet.', more: true },
        weekly:     { ico: '📅', label: 'Weekly pool', sub: 'Organizer', org: 'The Weekly pool is one pool for the round.', more: true }
    };
    var GRID = ['nassau', 'match', 'skins', 'wolf', 'vegas', 'bbb', 'stableford', 'hilo', 'nines', 'dots', 'stroke'];
    var MORE = ['team', 'ryder', 'kp', 'birdies', 'longdrive', 'scramble', 'points', 'weekly'];
    var ORG_LINE = 'The organizer sets this up in Round Setup.';

    // ---- THE ROUND (through gps-bet.js's own helpers) ------------------------------------
    function players() { return B() ? B().players() : []; }
    function first(id) { var b = B(), p = b && b.byId(id); return p ? b.first(p) : ''; }
    function meId() { return B() ? B().meId() : null; }
    function ordered() { return B() ? B().ordered() : []; }
    function holesText(list) { return B() ? B().holesText(list) : list.join(', '); }
    function idxOf(list, hole) { for (var i = 0; i < list.length; i++) if (Number(list[i].hole) === Number(hole)) return i; return -1; }
    function spectating() { return !!(B() && B().spectating()); }
    // The holes this game covers, in play order, from its start hole.
    function holesFrom(from) { var o = ordered(), i = idxOf(o, from); return (i < 0 ? o : o.slice(i)).map(function (h) { return Number(h.hole); }); }
    function holesBefore(from) { var o = ordered(), i = idxOf(o, from); return (i < 0 ? [] : o.slice(0, i)).map(function (h) { return Number(h.hole); }); }
    // "Now": the first hole nobody in it has posted (gps-bet.js startHole - New Action's rule).
    function nowHole(ids) { return B() ? B().startHole(ids && ids.length ? ids : players().map(function (p) { return String(p.id); })) : 1; }
    function nextNine(now) {
        var o = ordered(), i = idxOf(o, now);
        if (i < 0 || o.length <= 9 || i >= 9) return null;
        return Number(o[9].hole);
    }

    // ---- WHO IS IN, AND IS IT ENOUGH ---------------------------------------------------
    function needWhy(game, picks) {
        var g = G[game], n = picks.length;
        if (!g || g.org) return null;
        var nm = g.label;
        var unpicked = groupGolfers().filter(function (p) { return picks.indexOf(String(p.id)) === -1; });
        var tapOne = function (k) { return (k === 1 && unpicked.length === 1) ? ': tap ' + B().first(unpicked[0]) + '.' : '.'; };
        if (g.need === 'pair') {
            if (n === 2 || n === 4) return null;
            if (n < 2) return nm + ' needs 2 golfers (1 v 1) or 4 (2 v 2). Tap ' + (2 - n) + ' more.';
            if (n === 3) return '3 golfers can’t make two sides: tap one more for 2 v 2, or one off for 1 v 1.';
            return nm + ' is 1 v 1 or 2 v 2: tap ' + (n - 4) + ' off.';
        }
        if (g.need === '2+') return n >= 2 ? null : nm + ' needs at least 2 golfers. Tap ' + (2 - n) + ' more.';
        if (g.need === 'even') return (n >= 2 && n % 2 === 0) ? null : 'Team match pairs golfers 1 v 1: pick an even number (the first half is one team).';
        if (g.need === 'ryder') return (n === 4 || n === 8) ? null : 'Ryder plays 2 v 2 matches: pick 4 or 8 golfers (the first half is one team).';
        if (typeof g.need === 'number') {
            if (n === g.need) return null;
            // Manny's 099 list: a clear 9 Points message at 2 golfers.
            if (game === 'nines' && n === 2) return '9 Points is for exactly 3 golfers. You have 2: try Match or Skins.';
            if (n < g.need) return nm + ' needs ' + g.need + ' golfers. You picked ' + n + tapOne(g.need - n);
            return nm + ' takes exactly ' + g.need + ' golfers. You picked ' + n + ': tap ' + (n - g.need) + ' off.';
        }
        return null;
    }
    function groupGolfers() {
        var b = B(); if (!b) return [];
        var mg = b.myGroup(), m = b.groupMap();
        return players().filter(function (p) { return String(m[String(p.id)]) === String(mg); });
    }
    function names(ids) { var me = meId(); return ids.map(function (id) { return String(id) === String(me) ? 'Me' : first(id); }); }
    function sidesOf(game, picks) {
        var n = picks.length, half = n / 2;
        if (G[game].need === 'pair' || game === 'hilo' || game === 'vegas') return n === 2 ? [picks.slice(0, 1), picks.slice(1)] : [picks.slice(0, 2), picks.slice(2)];
        return [picks.slice(0, half), picks.slice(half)];
    }
    function whoText(game, picks) {
        var g = G[game];
        if (!picks.length) return '';
        if (g.kind === 'side' && game !== 'skins' || game === 'vegas' || g.kind === 'pairs') {
            var s = sidesOf(game, picks);
            return names(s[0]).join(' + ') + ' vs ' + names(s[1]).join(' + ');
        }
        return names(picks).join(', ');
    }

    // ---- THE ONE LINE: WHAT COUNTS -------------------------------------------------------
    function saysWhat(game, from, picks) {
        var g = G[game]; if (!g) return '';
        if (g.org || !ready(game)) return (g.org ? g.org + ' ' : '') + ORG_LINE;
        var hs = holesFrom(from), all = holesText(hs), lead = g.label + ' from ' + from;
        var pressOn = g.presses ? (st.press && st.press !== 'none' ? ' Presses on.' : ' No presses.') : '';
        if (game === 'nassau') {
            if (B().nassauBets(from) === 1) return 'Nassau from ' + from + ' = one bet, ' + all + '.' + pressOn;
            var f = hs.filter(function (h) { return h <= 9; }), bk = hs.filter(function (h) { return h > 9; });
            return lead + ': front = ' + holesText(f) + ', back = ' + holesText(bk) + ', total = ' + all + '.' + pressOn;
        }
        if (game === 'match') return lead + ': holes ' + all + ', one match.' + pressOn;
        if (game === 'stroke') return lead + ': lowest total over holes ' + all + ' wins.';
        if (game === 'skins') return lead + ': holes ' + all + ', low score takes the hole.';
        if (game === 'hilo') return lead + ': holes ' + all + ', low ball + high ball each hole. Hi-Lo takes exactly 4 golfers.';
        if (game === 'nines') return lead + ': holes ' + all + ', 9 points a hole (5-3-1). 9 Points takes exactly 3 golfers.';
        if (game === 'dots') return lead + ': dots on holes ' + all + ' only.';
        if (game === 'kp') return 'KP pot from ' + from + ': KPs on holes ' + all + ' only.';
        if (game === 'birdies') return 'Birdies from ' + from + ': birdies and eagles on holes ' + all + ' only.';
        if (game === 'stableford') return lead + ': points on holes ' + all + '.';
        if (game === 'bbb') return lead + ': Bingo, Bango, Bongo tapped on holes ' + all + '.';
        if (game === 'vegas') return lead + ': holes ' + all + ', the first two picked vs the last two. Vegas takes exactly 4 golfers.';
        if (game === 'wolf') return lead + ': holes ' + all + ', ' + (picks[0] ? (names([picks[0]])[0] === 'Me' ? 'you are' : names([picks[0]])[0] + ' is') + ' Wolf on ' + from + ', then in the order picked' : 'the first golfer picked is Wolf on ' + from) + '. Wolf takes exactly 4 golfers.';
        if (game === 'team') return lead + ': one 1 v 1 match per pair, holes ' + all + '.' + pressOn;
        if (game === 'ryder') return lead + ': 2 v 2 matches, holes ' + all + '.' + pressOn;
        return lead + '.';
    }
    function rangeLine(game, from) {
        var before = holesBefore(from), all = holesText(holesFrom(from));
        var s = before.length ? 'Counts holes ' + all + ' only. Holes ' + holesText(before) + ' are not in it.' : 'Counts every hole.';
        var g = G[game];
        if (g.kind === 'side' && B() && st.stake > 0) {
            var sh = B().shapeOf(game, st.picks);
            if (sh.ok) {
                var w = B().worstCase(game, st.stake, sh, from);
                s += (w.mine ? ' Worst case for you: ' : ' Worst case each: ') + '−$' + w.amount + (g.presses ? ' before presses.' : '.');
            }
        }
        return s;
    }

    // ---- THE RECORDS ----------------------------------------------------------------------
    // The stored start: the card's first hole when it is the first hole played (the whole round -
    // gps-bet.js buildBet's rule), else the hole.
    function stored(from) { var o = ordered(), d = data() || {}; var cd = (d.courseData || []).slice().sort(function (a, b) { return a.hole - b.hole; }); return (o.length && Number(from) === Number(o[0].hole) && cd.length) ? Number(cd[0].hole) : Number(from); }
    function groupRefuse(ids) {
        var b = B(); var g = (function () { try { return typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup ? Number(lockedGroup) : null; } catch (e) { return null; } })();   /* global hasGroupLock, lockedGroup */
        if (!g) return null;
        var m = b.groupMap();
        if (!ids.every(function (id) { return String(m[id]) === String(g); })) return 'This is Group ' + g + '’s link, so a game here can only include Group ' + g + ' golfers.';
        return null;
    }
    // Returns [{ path, value }] or { refuse }.
    function build(o) {
        var game = o.game, g = G[game], ids = (o.picks || []).map(String), stake = Number(o.stake) || 0, from = Number(o.from);
        var b = B();
        if (!b || !g) return { refuse: 'Pick a game.' };
        if (spectating()) return { refuse: 'You are watching this round - a scorekeeper starts games.' };
        if (g.org || !ready(game)) return { refuse: (g.org ? g.org + ' ' : '') + ORG_LINE };
        var why = needWhy(game, ids); if (why) return { refuse: why };
        if (!(stake > 0)) return { refuse: 'Pick an amount.' };
        if (!from || holesFrom(from).length === 0) return { refuse: 'No holes left to start a game on.' };
        var now = Number(o.now) || Date.now();
        if (g.kind === 'side') {
            var r = b.buildBet({ game: game, picks: ids, stake: stake, scoring: 'net', startHole: from, press: o.press || 'none', now: now });
            return r.refuse ? r : [r];
        }
        if (g.kind === 'pairs') {
            var s = sidesOf(game, ids), out = [], per = game === 'ryder' ? 2 : 1;
            for (var i = 0; i < s[0].length; i += per) {
                var rb = b.buildBet({ game: 'match', picks: s[0].slice(i, i + per).concat(s[1].slice(i, i + per)), stake: stake, scoring: 'net', startHole: from, press: o.press || 'none', now: now + i });
                if (rb.refuse) return rb;
                out.push(rb);
            }
            return out;
        }
        // ROUND GAME INSTANCES (additionalGameInstances), New Action's shape.
        var gr = groupRefuse(ids); if (gr) return { refuse: gr };
        var fmt = (game === 'kp' || game === 'birdies') ? 'dots' : game;
        var e = { format: fmt, enabled: true, startHole: stored(from), createdAt: now };
        var sc = b.scopeOf(ids);
        if (sc.scope) e.scope = sc.scope;
        if (sc.scope === 'group') e.ownerGroup = sc.ownerGroup;
        var narrower = ids.length < players().length || !!sc.scope;
        if (fmt === 'dots') {
            if (sc.scope === 'cross') return { refuse: 'Dots is played within one group, so it can’t be set up across groups.' };
            e.dotPointVal = stake; if (narrower) e.participantIds = ids;
            if (game === 'kp') { e.dotTypes = ['greenie']; e.inSettle = true; }
            if (game === 'birdies') { e.dotTypes = ['birdie', 'eagle']; e.inSettle = true; }
        } else if (fmt === 'nines') { e.participantIds = ids; e.scoring = 'net'; e.ninePointsRate = stake; }
        else if (fmt === 'stableford') { e.stablefordPointVal = stake; e.stablefordScoring = 'net'; if (narrower) e.participantIds = ids; }
        else if (fmt === 'bbb') { e.bbbPointVal = stake; e.participantIds = ids; e.inSettle = true; }
        else if (fmt === 'vegas') { e.vegasPointVal = stake; e.vegasBirdieFlip = false; e.vegasTeamA = ids.slice(0, 2); e.vegasTeamB = ids.slice(2, 4); e.participantIds = ids.slice(0, 4); e.inSettle = true; }
        else if (fmt === 'wolf') { e.wolfPointVal = stake; e.participantIds = ids.slice(0, 4); e.wolfLoneMult = 2; e.wolfBlindMult = 3; e.wolfTieRule = 'carry'; e.wolfLastPlaceRule = 'off'; e.inSettle = true; }
        return [{ path: 'events/' + b.code() + '/additionalGameInstances', value: e }];
    }

    // ---- THE SHEET ---------------------------------------------------------------------
    var st = null;
    var CSS_X = ''
        + '#hp-game{z-index:10205;}'
        + '#hp-game .hb-tiles.g3{grid-template-columns:repeat(3,1fr);gap:8px;}'
        + '#hp-game .g3 .hb-tile{min-height:58px;padding:9px 10px;}'
        + '#hp-game .g3 .hb-tile b{font-size:clamp(13px,3.9vw,15px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}#hp-game .g3 .hb-tile span{font-size:12px;}'
        + '#hp-game .g3 .hb-tile b i{font-style:normal;margin-right:4px;}'
        + '#hp-game .g3 .hb-tile.on:after{right:8px;top:8px;}'
        + '#hp-game .hb-tile.dim span{color:#8a958f;}'
        + '#hp-game .hb-foot{position:sticky;bottom:calc(-18px - env(safe-area-inset-bottom, 0px));background:#fff;margin:10px -16px calc(-18px - env(safe-area-inset-bottom, 0px));padding:2px 16px calc(env(safe-area-inset-bottom, 0px) + 14px);box-shadow:0 -10px 14px rgba(255,255,255,.95);}'
        + '#hp-game .hb-foot .hb-go{margin-top:8px;}'
        + '#hp-game .hb-say{border:1.5px solid #0f4d3a;background:#f1f7f3;border-radius:12px;padding:11px 12px;margin-top:14px;font:600 15px/1.35 -apple-system,system-ui,sans-serif;color:#0f1f17;}'
        + '#hp-game .hb-why.bad{color:#b3261e;font-weight:700;font-size:14px;}'
        + '#hp-game .hb-seg{flex-wrap:nowrap;}#hp-game .hb-seg button{padding:0 12px;}'
        + '#hp-game select.hb-from{border:1.5px solid #0f4d3a;border-radius:999px;min-height:40px;padding:0 12px;background:#fff;}'
        + '#gps-overlay .gps-game-pill{position:absolute;right:0;bottom:calc(100% + 12px);border:0;border-radius:16px;background:#ffd60a;color:#0b0f0c;min-height:48px;padding:0 18px;font:800 17px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);white-space:nowrap;}'
        + '#gps-overlay.gps-sun .gps-game-pill{background:#ffe600;color:#000;border:2px solid #000;}';
    function ensureCss() {
        if (document.getElementById('hp-game-css')) return;
        var b = B(); if (b && b.ensureCss) b.ensureCss();
        var base = document.getElementById('hp-bet-css');
        var txt = base ? base.textContent.split('}').filter(function (r) { return /#hp-bet[ .{]/.test(r) && !/#hp-weekly/.test(r); }).map(function (r) { return r.replace(/#hp-bet(?=[ .{])/g, '#hp-game') + '}'; }).join('') : '';
        var s = document.createElement('style'); s.id = 'hp-game-css'; s.textContent = txt + CSS_X; document.head.appendChild(s);
    }
    function root() {
        var r = document.getElementById('hp-game');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-game'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Start a game');
        r.innerHTML = '<div class="hb-scrim" data-hg="close"></div><div class="hb-panel gps-scroll-ok"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', onClick);
        r.addEventListener('change', onChange);
        return r;
    }
    function isOpen() { var r = document.getElementById('hp-game'); return !!(r && r.classList.contains('open')); }
    function say(msg) { try { if (typeof uiRefuse === 'function') return uiRefuse('⚠️ ' + msg); } catch (e) {} }

    // OPEN: { game, with: <golfer id>, returnTo }. Me (+ "with") are in; the game starts now.
    function open(o) {
        o = o || {};
        if (!on() || !data() || !B() || !B().code()) return false;
        if (spectating()) { say('You are watching this round - a scorekeeper starts games.'); return false; }
        var me = meId(), picks = [];
        if (me) picks.push(String(me));
        if (o.with && String(o.with) !== String(me) && B().byId(o.with)) picks.push(String(o.with));
        var game = G[o.game] && !G[o.game].more ? o.game : (G[o.game] ? o.game : 'nassau');
        st = { game: game, more: !!G[game].more, picks: picks, fromMode: 'now', pick: null, stake: G[game].chips ? G[game].chips[1] : null,
            press: G[game].presses ? '2down' : 'none', field: false, returnTo: o.returnTo || null };
        root().classList.add('open');
        draw();
        return true;
    }
    function close() { var r = document.getElementById('hp-game'); if (r) r.classList.remove('open'); st = null; }
    function fromHole() {
        var now = nowHole(st.picks);
        if (now == null) return null;
        if (st.fromMode === 'next9') return nextNine(now) || now;
        if (st.fromMode === 'pick' && st.pick && holesFrom(now).indexOf(Number(st.pick)) > -1) return Number(st.pick);
        return now;
    }
    function tile(k) {
        var g = G[k], live = ready(k) && !g.org;
        return '<button type="button" class="hb-tile' + (st.game === k ? ' on' : '') + (live ? '' : ' dim') + '" data-hg-game="' + k + '"><b><i>' + g.ico + '</i>' + esc(g.label) + '</b><span>' + esc(live ? g.sub : (g.org ? 'Organizer sets up' : 'Organizer sets up')) + '</span></button>';
    }
    function chip(p) {
        var id = String(p.id), me = String(meId() || '') === id, on1 = st.picks.indexOf(id) > -1;
        return '<button type="button" class="hb-chip' + (on1 ? ' on' : '') + '" data-hg-pick="' + esc(id) + '" aria-pressed="' + on1 + '">' + (me ? '<i>Me</i>' : '') + esc(B().first(p) || p.name) + '</button>';
    }
    function draw() {
        if (!st) return;
        var panel = root().querySelector('.hb-panel'), y = panel.scrollTop;
        var g = G[st.game], now = nowHole(st.picks), from = fromHole(), n9 = now != null ? nextNine(now) : null;
        var h = '<div class="hb-grab"></div><div class="hb-head"><div class="hb-title">＋ Game</div><button type="button" class="hb-x" data-hg="close" aria-label="Close">✕</button></div>';
        h += '<div class="hb-h" style="margin-top:0">' + (st.more ? 'More games' : 'Game · golfers it takes') + '</div>';
        h += '<div class="hb-tiles g3">' + (st.more
            ? MORE.map(tile).join('') + '<button type="button" class="hb-tile" data-hg="less"><b><i>‹</i>Back</b><span>Nassau, Match…</span></button>'
            : GRID.map(tile).join('') + '<button type="button" class="hb-tile" data-hg="more"><b><i>＋</i>More</b><span>Team, Ryder, KP…</span></button>') + '</div>';
        var mine = groupGolfers(), others = players().filter(function (p) { return mine.indexOf(p) === -1; });
        h += '<div class="hb-h">Who’s in' + (st.picks.length > 2 ? ' · ' + st.picks.length + ' picked' : '') + '</div><div class="hb-chips">' + mine.map(chip).join('') + '</div>';
        if (others.length) {
            if (st.field || others.some(function (p) { return st.picks.indexOf(String(p.id)) > -1; })) h += '<div class="hb-h">Anyone in the field</div><div class="hb-chips">' + others.map(chip).join('') + '</div>';
            else h += '<button type="button" class="hb-field" data-hg="field">+ Anyone in the field ›</button>';
        }
        h += '<div class="hb-h">Starts</div>';
        if (now == null) h += '<div class="hb-worst">Every hole is in - there are no holes left to start a game on.</div>';
        else {
            h += '<div class="hb-chips"><button type="button" class="hb-chip' + (st.fromMode === 'now' ? ' on' : '') + '" data-hg-from="now">Hole ' + now + ' (now)</button>'
                + (n9 ? '<button type="button" class="hb-chip' + (st.fromMode === 'next9' ? ' on' : '') + '" data-hg-from="next9">Next 9 · hole ' + n9 + '</button>' : '')
                + '<button type="button" class="hb-chip' + (st.fromMode === 'pick' ? ' on' : '') + '" data-hg-from="pick">Pick ▾</button></div>';
            if (st.fromMode === 'pick') h += '<div style="margin-top:8px"><select class="hb-from" aria-label="Starts on hole">' + holesFrom(now).map(function (x) { return '<option value="' + x + '"' + (x === from ? ' selected' : '') + '>Hole ' + x + (x === now ? ' (now)' : '') + '</option>'; }).join('') + '</select></div>';
        }
        var live = ready(st.game) && !g.org;
        if (from != null) h += '<div class="hb-say" aria-live="polite">' + esc(saysWhat(st.game, from, st.picks)) + '</div>';
        else if (!live) h += '<div class="hb-say">' + esc(saysWhat(st.game, 1, st.picks)) + '</div>';
        if (live && g.chips) {
            h += '<div class="hb-card"><div class="hb-row"><span>' + esc(g.stakeWord) + '</span><span class="hb-seg">' + g.chips.map(function (v) {
                return '<button type="button" data-hg-stake="' + v + '" class="' + (st.stake === v ? 'on' : '') + '">$' + v + '</button>';
            }).join('') + '</span></div>'
                + (g.presses ? '<div class="hb-row"><span>Presses</span><span class="hb-seg">' + [['none', 'Off'], ['2down', 'Auto @2'], ['1down', '@1'], ['anytime', 'Any']].map(function (p) {
                    return '<button type="button" data-hg-press="' + p[0] + '" class="' + (st.press === p[0] ? 'on' : '') + '">' + p[1] + '</button>';
                }).join('') + '</span></div>' : '') + '</div>';
            if (from != null) h += '<div class="hb-worst">' + esc(rangeLine(st.game, from)) + '</div>';
        }
        var why = live ? (now == null ? 'No holes left to start a game on.' : needWhy(st.game, st.picks)) : null;
        var label = !live ? 'Organizer sets this up'
            : (why ? 'Start ' + g.label + (typeof g.need === 'number' && st.picks.length < g.need ? ' · needs ' + g.need + ' golfers' : '')
                : 'Start ' + g.label + ' · ' + whoText(st.game, st.picks));
        h += '<div class="hb-foot"><div class="hb-why bad" role="status">' + esc(why || st.err || '') + '</div>'
            + '<button type="button" class="hb-go" data-hg="start"' + (live && !why ? '' : ' disabled') + '>' + esc(label) + '</button></div>';
        panel.innerHTML = h;
        panel.scrollTop = y;
    }
    function onChange(e) {
        if (st && e.target && e.target.classList.contains('hb-from')) { st.pick = Number(e.target.value) || null; st.err = ''; draw(); }
    }
    function onClick(e) {
        var t = e.target, b = t && t.closest ? t.closest('[data-hg],[data-hg-game],[data-hg-pick],[data-hg-from],[data-hg-stake],[data-hg-press]') : null;
        if (!b || !st) return;
        st.err = '';
        var a = b.getAttribute('data-hg');
        if (a === 'close') { var rt = st.returnTo; close(); if (rt && /\.html/.test(rt)) B().afterSave(rt); return; }
        if (a === 'more') { st.more = true; draw(); return; }
        if (a === 'less') { st.more = false; if (G[st.game].more) st.game = 'nassau'; draw(); return; }
        if (a === 'field') { st.field = true; draw(); return; }
        if (a === 'start') { start(); return; }
        if (b.hasAttribute('data-hg-game')) {
            var k = b.getAttribute('data-hg-game');
            if (k !== st.game) { st.game = k; var g = G[k]; st.stake = g.chips ? g.chips[1] : null; st.press = g.presses ? (st.press && st.press !== 'none' ? st.press : '2down') : 'none'; }
            draw(); return;
        }
        if (b.hasAttribute('data-hg-pick')) { var id = b.getAttribute('data-hg-pick'), i = st.picks.indexOf(id); if (i > -1) st.picks.splice(i, 1); else st.picks.push(id); draw(); return; }
        if (b.hasAttribute('data-hg-from')) { st.fromMode = b.getAttribute('data-hg-from'); if (st.fromMode === 'pick' && !st.pick) st.pick = nowHole(st.picks); draw(); return; }
        if (b.hasAttribute('data-hg-stake')) { st.stake = Number(b.getAttribute('data-hg-stake')); draw(); return; }
        if (b.hasAttribute('data-hg-press')) { var p = b.getAttribute('data-hg-press'); st.press = (B().PRESS_RULES || []).indexOf(p) > -1 ? p : 'none'; draw(); return; }
    }
    function start() {
        var b = B(), keep = st;
        var recs = build({ game: st.game, picks: st.picks, stake: st.stake, from: fromHole(), press: st.press });
        if (recs.refuse) { st.err = recs.refuse; draw(); return; }
        // 071b: a stand-in card asks for the pars first (gps-bet.js askPars), then this game.
        if (b.standInCard && b.standInCard() && b.askPars) {
            b.askPars(b.strokesAmong ? b.strokesAmong(st.picks) : false, function () { if (st === keep) write(recs); }, function () {});
            return;
        }
        write(recs);
    }
    function write(recs) {
        var b = B(), g = G[st.game], label = g.label, who = whoText(st.game, st.picks), from = fromHole(), rt = st.returnTo, res = [];
        try { recs.forEach(function (r) { res.push(b.write(r, null)); }); }
        catch (e) { st.err = 'Could not save: ' + (e && e.message); draw(); return; }
        close();
        var text = 'Game added: ' + label + ' · ' + who + ' · from ' + from + (navigator.onLine === false ? ' (sends when you have signal)' : '');
        if (rt && /\.html/.test(rt)) { b.afterSave(rt + (rt.indexOf('?') > -1 ? '&' : '?') + 'hptoast=' + encodeURIComponent(text)); return; }
        try { if (typeof uiToast === 'function') uiToast(text); } catch (e) {}
        res.forEach(function (r) { if (r.promise && r.promise.then) r.promise.then(function () { try { b.refresh(); } catch (e) {} }, function (err) { say('Could not save: ' + (err && err.message)); }); });
        setTimeout(function () { try { b.refresh(); } catch (e) {} }, 0);
    }

    // ---- THE GPS PILL: "+ Game" above Mark (layout D) -------------------------------------------
    function mountGps(el) {
        var host = el || document.getElementById('gps-overlay'); if (!host) return;
        var bot = host.querySelector('.gps-ld-bottom'); if (!bot) return;
        ensureCss();
        var pill = bot.querySelector('.gps-game-pill');
        if (!pill) {
            pill = document.createElement('button'); pill.type = 'button'; pill.className = 'gps-game-pill';
            pill.setAttribute('aria-label', 'Start a game'); pill.textContent = '＋ Game';
            pill.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open({}); });
            bot.appendChild(pill);
        }
        var show = on() && !!data() && (data().players || []).length > 0 && !!(B() && B().code()) && !spectating();
        var want = show ? '' : 'none';
        if (pill.style.display !== want) pill.style.display = want;
        watchPlays(host);
        placeGps(host);
    }

    // CLEAR OF THE PLAYS-LIKE PILL AND THE RAIL (gps022, Sun layout D): the pill sits above Mark; when the
    // Plays-like pill (or a rail button) is in that spot, it steps up above it, 10 px clear. Called by
    // gps-view.js ldPlace and whenever the Plays-like pill shows, hides or changes.
    function placeGps(el) {
        var host = el || document.getElementById('gps-overlay'); if (!host) return;
        var bot = host.querySelector('.gps-ld-bottom'), pill = bot && bot.querySelector('.gps-game-pill');
        if (!pill || pill.style.display === 'none') return;
        pill.style.bottom = '';
        var vis = function (e) { if (!e || e.offsetParent === null || e.style.display === 'none') return null; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
        var others = [host.querySelector('.gps-ld-plays')].concat(Array.prototype.slice.call(host.querySelectorAll('.gps-ld-rail > *')));
        for (var n = 0; n < 6; n++) {
            var p = pill.getBoundingClientRect(), br = bot.getBoundingClientRect(), hit = null;
            others.forEach(function (e) { var r = vis(e); if (r && Math.min(p.right, r.right) - Math.max(p.left, r.left) > 0 && Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top) > -10) { if (!hit || r.top < hit.top) hit = r; } });
            if (!hit) return;
            pill.style.bottom = Math.round(br.bottom - hit.top + 10) + 'px';
        }
    }
    var watched = null;
    function watchPlays(host) {
        var pl = host && host.querySelector('.gps-ld-plays');
        if (!pl || pl === watched || typeof MutationObserver === 'undefined') return;
        watched = pl;
        var queued = false;
        new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; placeGps(host); }); })
            .observe(pl, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true, characterData: true });
    }

    // FROM ANOTHER PAGE (the Leaderboard's "Start a game with Jim"): index.html?hpgame=1&with=<id>&hpg=<game>.
    var urlDone = false;
    function fromUrl() {
        if (urlDone || !on() || !data()) return;
        var q; try { q = new URLSearchParams(window.location.search); } catch (e) { urlDone = true; return; }
        urlDone = true;
        if (q.get('hpgame') !== '1') return;
        var w = q.get('with'), gm = q.get('hpg'), ret = q.get('hpret');
        if (ret && !/^[a-z0-9_-]+\.html(\?|$)/i.test(ret)) ret = null;
        try { ['hpgame', 'with', 'hpg', 'hpret'].forEach(function (k) { q.delete(k); }); history.replaceState(history.state, '', window.location.pathname + '?' + q.toString()); } catch (e) {}
        setTimeout(function () { open({ game: gm, with: w, returnTo: ret }); }, 0);
    }

    var api = { open: open, close: close, isOpen: isOpen, redraw: function () { if (isOpen()) draw(); }, mountGps: mountGps, placeGps: placeGps, fromUrl: fromUrl,
        // Pure-ish pieces for the tests.
        build: build, needWhy: needWhy, saysWhat: saysWhat, rangeLine: rangeLine, ready: ready, GAMES: G, GRID: GRID, MORE: MORE,
        state: function () { return st ? JSON.parse(JSON.stringify(st)) : null; } };
    window.HardPanGame = api;
    if (window.GolfBack && typeof window.GolfBack.register === 'function') {
        try { window.GolfBack.register({ name: 'hp-game', priority: 1, isOpen: isOpen, close: close }); } catch (e) {}
    }
})();
