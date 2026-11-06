// A PASTED LINK WITH A SPACE (Manny, Nov 6): ?game=%20ABC123 read "NO ROUND". Cleaned here, before any page reads ?game=.
(function () {
    try {
        var u = new URL(location.href), g = u.searchParams.get('game');
        if (g && g !== g.trim()) { u.searchParams.set('game', g.trim()); history.replaceState(null, '', u.href); }
    } catch (e) { /* not a page (the node tests) */ }
})();
// ============================================================================
// GolfApp — Safe Text (SHARED CORE)
//
// One escaping function, loaded by every page that renders a name.
//
// WHY THIS FILE EXISTS
//
// Golfer names, trip names and course names are user input, and eight pages
// interpolated them straight into template literals that become innerHTML. The
// security framing is the weaker half of the problem: an attacker needs the round
// code, and script execution buys them nothing they cannot already do with it.
//
// The stronger half is CORRECTNESS. A golfer legitimately called
//
//     Bob <the Hammer>          renders as nothing at all - the browser reads an
//                               unknown tag and swallows it
//     Mike & Dave's Trip        renders intact today, but only by luck
//
// so an ordinary group with an ordinary name sees a broken screen. That is the bug
// a TestFlight tester actually hits.
//
// ESCAPE AT THE OUTPUT BOUNDARY, NEVER IN STORAGE. Firebase keeps the name exactly
// as typed. Nothing here rewrites stored data, and nothing double-encodes history:
// escaping is applied once, at the moment a string becomes markup.
//
// ALL FIVE CHARACTERS. & < > " ' - the ampersand FIRST, or escaping the others
// would re-escape the ampersands they introduce and turn O'Brien into O&amp;#39;Brien
// on screen. The apostrophe matters because golfers are called O'Brien, and the
// double quote matters because names land inside attributes.
//
// THIS IS FOR HTML. It is not correct for JavaScript string context, and no caller
// should use it that way - a name that must reach a handler is passed by id
// through a data attribute instead of being interpolated into code.
// ============================================================================

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ---- THE NAME A GOLFER READS (2026-09-21, v190) --------------------------
// Lifted VERBATIM from leaderboard.html (it lived inline there since the
// Board was written) so the Game tab draws the same name the Board does:
// a first name unique in the roster stands alone ("Marty"); two golfers who
// share a first name carry their last initial with a dot ("Randy T.",
// "Randy C."); same first name AND same initial, the full stored name. The
// Game tab had its own formatter that cut every name to its first token,
// which turned Randy T / Randy C / Matt M / Matt B / Matt H into two Randys
// and three Matts (game_tab_names_test.js). Two entry points, one builder.
// DOES NOT ESCAPE - every caller wraps the result in escapeHtml at the
// innerHTML boundary, as leaderboard.html always did.
function getSmartDisplayName(player, allPlayers) {
    let parts = player.name.trim().split(/\s+/);
    let first = parts[0];
    if (parts.length === 1) return first; 

    let last = parts.slice(1).join(" ");
    let lastInitial = last.charAt(0).toUpperCase();

    let sameFirstName = allPlayers.filter(p => p.name.trim().split(/\s+/)[0].toLowerCase() === first.toLowerCase());
    if (sameFirstName.length === 1) return first; 

    let sameFirstAndInitial = sameFirstName.filter(p => {
        let pParts = p.name.trim().split(/\s+/);
        if (pParts.length === 1) return false;
        let pLastInitial = pParts.slice(1).join(" ").charAt(0).toUpperCase();
        return pLastInitial === lastInitial;
    });

    // A ONE-LETTER LAST NAME IS ALREADY AN INITIAL (polish #16, 2026-10-20):
    // "Test A" stays "Test A", never "Test A." - the dot only marks a cut.
    if (sameFirstAndInitial.length === 1) return last.length === 1 ? `${first} ${lastInitial}` : `${first} ${lastInitial}.`;
    return `${first} ${last}`;
}

// ---- SAME FIRST NAME, EVERY SCREEN (polish #2, 2026-10-20) ---------------
// Two Mikes in one round read "Mike v Mike" / "Mike +$5" on the hole sheet,
// the Nassau strip, LIVE MATCHES, Bets and Round Complete, because every one
// of those lines is cut from player.name's FIRST WORD - most of them inside
// the engines (match-engine t1Name, money-engine statusText, settlement-engine
// nameA), which this change does not touch.
//
// golferShortName: the name a short line shows - getSmartDisplayName against
// the round's roster ("Mike" alone; "Mike R." / "Mike S." when two Mikes;
// the full name when the initials collide too). Pure; does not escape.
//
// roundDataForDisplay: the SAME round, for a renderer to hand to an engine,
// with only the colliding golfers' names swapped for that label joined by
// no-break spaces ("Test\u00a0A"). Every engine label is
// name.split(' ')[0], and a no-break space is not ' ', so the engine's own
// label comes out "Test A" - without one line of engine code changing. The
// engines' arithmetic never reads a name (ids, handicaps, scores), so no
// figure can move. NO COLLISION -> THE SAME OBJECT BACK, so every round
// without two same first names is untouched byte for byte. A COPY, NEVER
// SAVED: callers pass it to presenters only; nothing writes it back.
function golferShortName(player, allPlayers) {
    if (!player || typeof player.name !== 'string' || !player.name.trim()) return String((player && player.name) || '').trim();
    const roster = (Array.isArray(allPlayers) ? allPlayers : []).filter(p => p && typeof p.name === 'string' && p.name.trim());
    if (!roster.includes(player)) roster.push(player);
    return getSmartDisplayName(player, roster);
}

// Short labels for a whole roster, keyed by id. Only names that change are in it.
function golferShortNameMap(players) {
    const list = Array.isArray(players) ? players : [];
    const out = {};
    list.forEach(p => {
        if (!p || typeof p.name !== 'string' || !p.name.trim()) return;
        const label = golferShortName(p, list);
        if (label !== p.name.trim().split(/\s+/)[0]) out[String(p.id)] = label;
    });
    return out;
}

// roster: the whole round (optional) - a group-scoped list still collides
// against every golfer in the round, not only the ones on screen.
function playersForDisplay(players, roster) {
    if (!Array.isArray(players)) return players;
    const map = golferShortNameMap(Array.isArray(roster) ? roster : players);
    if (!Object.keys(map).length) return players;
    return players.map(p => (p && map[String(p.id)] !== undefined)
        ? Object.assign({}, p, { name: map[String(p.id)].replace(/ /g, '\u00a0') }) : p);
}

function roundDataForDisplay(data) {
    if (!data || !Array.isArray(data.players)) return data;
    const ps = playersForDisplay(data.players);
    return ps === data.players ? data : Object.assign({}, data, { players: ps });
}

// ============================================================================
// ZERO-STAKE GAMES SHOW NO CURRENCY (2.0 (24), ADVISOR-2245, Manny YES 10:45 PM Nov 1).
//
// A game played for nothing - every stake $0 or blank - printed "$0" on every row:
// "F $0 / B $0 / O $0", "$0 · halved", "$0/match", a $0 column on the live card. Such a
// game now reads as the match it is: who is up, who won, what was halved - no dollar
// sign anywhere. DISPLAY ONLY, and it lives HERE rather than in side-match-lines.js
// (protected: words only) - every function below takes what side-match-lines.js already
// built and re-words it for a stake-free game; a game WITH a stake (any stake above 0
// anywhere in it) is handed back untouched, so it renders byte for byte as before.
// Nothing is summed, nothing priced, no engine is called for money.
// ============================================================================
function zsNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
// A side-match record (sideMatches[id]): every stake field $0 or blank.
function sideMatchStakeFree(sm) {
    if (!sm) return false;
    return ['stake', 'frontStake', 'backStake', 'overallStake', 'autoPressStake', 'holeStake'].every(k => zsNum(sm[k]) === 0);
}
// A priced receipt (settlement-engine.js buildSideMatchReceipts): every segment's stake 0.
function sideMatchReceiptStakeFree(receipt) {
    const segs = (receipt && receipt.segments) || [];
    return segs.length > 0 && segs.every(s => zsNum(s && s.stake) === 0);
}
// A live state (money-engine.js buildLiveMatchStates): every segment and press stake 0.
function liveMatchStateStakeFree(st) {
    const segs = (st && st.segments) || [];
    return segs.length > 0 && segs.every(g => zsNum(g.stake) === 0 && (g.presses || []).every(p => zsNum(p.stake) === 0));
}
// The terms of a stake-free Match / Nassau with no price: the press rule only, in the words
// each page already uses ("Auto @ 2 Down" for a Nassau, "Press: 2down" for a match).
function sideMatchStakeFreeTerms(sm) {
    const m = sm || {};
    if (m.format === 'nassau') {
        return m.pressRule === '2down' ? 'Auto @ 2 Down' : m.pressRule === '1down' ? 'Auto @ 1 Down'
            : m.pressRule === 'anytime' ? 'Press any hole' : '';
    }
    return (m.pressRule && m.pressRule !== 'none') ? 'Press: ' + m.pressRule : '';
}
// EVERY GAME ON THE ROUND IS PLAYED FOR NOTHING (ADVISOR-2245), and there is at least one: no
// main-format stake, no money pool, every side match stake-free, every round game at $0.
function roundStakeFree(data) {
    const d = data || {};
    if (typeof getRoundGames !== 'function' || typeof sideMatchStakeFree !== 'function') return false;
    if (d.moneyPool && d.moneyPool.enabled !== false) return false;
    if (d.birdieGameEnabled === true) return false;
    const games = getRoundGames(d);
    if (games.some(g => Number(g.stake) > 0)) return false;
    const sms = Object.keys(d.sideMatches || {}).map(k => d.sideMatches[k]);
    if (!sms.every(sm => sideMatchStakeFree(sm))) return false;
    return sms.length > 0 || games.some(g => g.role === 'additional');
}
function zsKey(baseId, pressNum) { return String(baseId === undefined || baseId === null ? '' : baseId) + '|' + Number(pressNum || 0); }
// side-match-lines.js sideMatchBetLines() output, re-worded for a stake-free receipt: no "$0"
// stake text, the winner's name on a won row, "Halved" on a halved one. Priced: the same array.
function hpZeroStakeBetLines(receipt, lines, opts) {
    if (!Array.isArray(lines) || !sideMatchReceiptStakeFree(receipt)) return lines;
    const complete = !!(opts && opts.complete);
    const byKey = {};
    receipt.segments.forEach(s => { if (s) byKey[zsKey(s.baseId, s.pressNum)] = s; });
    return lines.map(l => {
        const seg = byKey[zsKey(l.baseId, l.pressNum)] || {};
        const halved = complete && !seg.winner && /^all square/i.test(String(seg.result || ''));
        return Object.assign({}, l, { stakeText: '', stakeFree: true,
            moneyText: seg.winner ? String(seg.winner) : (halved ? 'Halved' : '') });
    });
}
// WHO TOOK WHICH GAME, BY RESULT - money cannot say it on a $0 game (every segment's money
// is 0, so the money tally calls every game halved). Halved = an "All square" result; else
// the side the engine's own winner / toSideA names.
function sideMatchResultTally(receipt, complete) {
    const t = { a: 0, b: 0, halved: 0, live: 0, total: 0 };
    ((receipt && receipt.segments) || []).forEach(seg => {
        if (!seg) return;
        t.total += 1;
        if (!seg.winner && !complete) { t.live += 1; return; }
        if (!seg.winner && /^all square/i.test(String(seg.result || ''))) { t.halved += 1; return; }
        if (seg.winner) { if (seg.winner === receipt.nameA) t.a += 1; else t.b += 1; return; }
        if (seg.toSideA) t.a += 1; else t.b += 1;
    });
    return t;
}
// The match line of a stake-free receipt ("Joe/Ray — took 2 of 5 games, 3 halved"), else the
// line side-match-lines.js wrote. Same " — " split the Receipt reads (answer — why).
function hpZeroStakeNetLine(receipt, line, opts) {
    if (!sideMatchReceiptStakeFree(receipt)) return line;
    const complete = !!(opts && opts.complete);
    const t = sideMatchResultTally(receipt, complete);
    const nameA = receipt.nameA || 'Side A', nameB = receipt.nameB || 'Side B';
    const games = n => n + ' game' + (n === 1 ? '' : 's');
    if (!complete) {
        const decided = t.a + t.b + t.halved;
        return decided === 0 ? 'Still playing — nothing decided yet' : 'Still playing — ' + games(decided) + ' decided, the rest live';
    }
    const halved = t.halved > 0 ? ', ' + t.halved + ' halved' : '';
    if (t.a > t.b) return nameA + ' — took ' + t.a + ' of ' + games(t.total) + (t.b > 0 ? ', ' + nameB + ' ' + t.b : '') + halved;
    if (t.b > t.a) return nameB + ' — took ' + t.b + ' of ' + games(t.total) + (t.a > 0 ? ', ' + nameA + ' ' + t.a : '') + halved;
    if (t.a === 0) return 'All square — every game halved';
    return 'All square — each took ' + games(t.a) + halved;
}
// THE LIVE MATCH CARD (side-match-lines.js buildLiveMatchCardHtml, protected) re-worded for
// its stake-free games, from the html it built. The card is one block per live state, in
// buildLiveMatchStates order, each opening with <div class="lm-top">; the states are read
// the same way the builder reads them. For a stake-free state: no "$0" in the row column, and
// a finished one's answer top right is its own final result (the last base row - a Nassau's
// Total, a match's Overall), not "All square / every game halved". Any mismatch in the block
// count hands the card back untouched. A priced state's block is never touched.
// 2.0 (25) ADVISOR-0725 (7:46): EDIT / REMOVE ON THE LIVE MATCHES CARD. In the HardPan app (the + Game
// sheet's HardPanBet, on this page or the round's page around it) each side game on the card gets the
// two buttons right under its header; the click goes to that sheet (gps-bet.js editGame / removeGame),
// or - a page on its own - to the round with the game open (?hpbet=1&hpedit=<id>[&hpremove=1]).
function hpBetApi() {
    try { if (typeof window !== 'undefined' && window.HardPanBet && window.HardPanBet.actionsHtml) return window.HardPanBet; } catch (e) {}
    try { if (typeof window !== 'undefined' && window.parent && window.parent !== window && window.parent.HardPanBet && window.parent.HardPanBet.actionsHtml) return window.parent.HardPanBet; } catch (e) {}
    return null;
}
function hpLiveCardActions(html, states, OPEN) {
    try {
        const P = hpBetApi(); if (!P || !P.on || !P.on()) return html;
        const parts = String(html).split(OPEN);
        if (parts.length !== states.length + 1) return html;
        states.forEach((st, i) => {
            if (!st || !st.isSideMatch || !st.wagerId) return;
            const a = P.actionsHtml(st.wagerId); if (!a) return;
            const k = parts[i + 1].indexOf('<div class="lm-wager-head');
            if (k < 0) return;
            parts[i + 1] = parts[i + 1].slice(0, k) + a + parts[i + 1].slice(k);
        });
        try { if (P.gaCss) P.gaCss(document); } catch (e) {}
        hpGameActionsListen();
        return parts.join(OPEN);
    } catch (e) { return html; }
}
// A page inside the round (the Leaderboard / Games frames) or on its own: the buttons' one listener.
function hpGameActionsListen() {
    try {
        if (typeof document === 'undefined' || document.__hpGaListen || (window.HardPanBet && window.HardPanBet.editGame)) return;
        document.__hpGaListen = true;
        document.addEventListener('click', function (e) {
            const b = e.target && e.target.closest ? e.target.closest('[data-hp-gedit],[data-hp-gremove]') : null;
            if (!b) return;
            e.preventDefault(); e.stopPropagation();
            const id = b.getAttribute('data-hp-gedit') || b.getAttribute('data-hp-gremove'), rm = b.hasAttribute('data-hp-gremove');
            const P = hpBetApi();
            if (P && window.parent !== window && P.editGame) { if (rm) P.removeGame(id, { returnTo: 'bets' }); else P.editGame(id, { returnTo: 'bets' }); return; }
            const q = new URLSearchParams(location.search), g = q.get('group'), page = location.pathname.split('/').pop() || 'index.html';
            location.href = 'index.html?game=' + encodeURIComponent(q.get('game') || '') + (g ? '&group=' + encodeURIComponent(g) : '')
                + '&hpbet=1&hpedit=' + encodeURIComponent(id) + (rm ? '&hpremove=1' : '') + '&hpret=' + encodeURIComponent(page + location.search);
        }, true);
    } catch (e) {}
}
function hpZeroStakeLiveCard(html, data, courseData, savedScores, visibleIds, opts) {
    try {
        if (!html || typeof buildLiveMatchStates !== 'function') return html;
        const maySee = (opts && opts.maySee) || function () { return true; };
        const d = (typeof roundDataForDisplay === 'function') ? roundDataForDisplay(data) : data;
        const states = (buildLiveMatchStates(d, courseData, savedScores, visibleIds) || [])
            .filter(st => !st.isSideMatch || maySee(st.wagerId));
        const OPEN = '<div class="lm-top">';
        // 2.0 (25) ADVISOR-0725 (7:46): Edit / Remove under each side game on this card (the app only).
        html = hpLiveCardActions(html, states, OPEN);
        if (!states.some(liveMatchStateStakeFree)) return html;
        const parts = String(html).split(OPEN);
        if (parts.length !== states.length + 1) return html;
        const finals = (typeof sideMatchLiveFinals === 'function') ? (sideMatchLiveFinals(d, courseData, savedScores, states) || {}) : {};
        const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        states.forEach((st, i) => {
            if (!liveMatchStateStakeFree(st)) return;
            let chunk = parts[i + 1].split('<span class="lm-row-money">$0</span>').join('<span class="lm-row-money"></span>');
            const fin = finals[(st.isSideMatch && st.wagerId) ? st.wagerId : '__main'];
            const last = (st.segments || [])[(st.segments || []).length - 1];
            if (fin && fin.complete && last) {
                const status = (fin.results || {})[zsKey(last.id, 0)] || last.statusText || '';
                chunk = chunk.replace(/<div class="lm-top-money">[^<]*<\/div><div class="lm-top-sub">[^<]*<\/div>/,
                    '<div class="lm-top-money">' + esc(status) + '</div>'
                    + (st.formatLabel === 'Nassau' ? '<div class="lm-top-sub">' + esc(last.label) + '</div>' : ''));
            }
            parts[i + 1] = chunk;
        });
        return parts.join(OPEN);
    } catch (e) { return html; }
}

// 2.0 (25) ADVISOR-0725 7:44: "STARTS HOLE 5", NOT "NOT STARTED". A side game added mid-round (Add a
// game's "Counts from: Hole 5") read "Not Started" on every row of LIVE MATCHES & PRESSES until then,
// which reads like a game nobody began. A segment of such a game that no one has played yet now says
// where it starts: "Starts hole 5" on its row (a Nassau's Back 9: "Starts hole 10"), and "Front 9
// starts hole 5" where the top right says it. A game that counts from the first hole is untouched
// ("Not Started" as before), and so is every number. Words only, on the card side-match-lines.js
// already drew (that file is untouched); the scorecard and the leaderboard both call this, so the two
// boards still agree. Each match's chunk is matched to its state in order, the way hpZeroStakeLiveCard
// does, and a card that does not line up is handed back as it was.
function hpStartsHoleLiveCard(html, data, courseData, savedScores, visibleIds, opts) {
    try {
        if (!html || String(html).indexOf('Not Started') === -1 || typeof buildLiveMatchStates !== 'function') return html;
        const maySee = (opts && opts.maySee) || function () { return true; };
        const d = (typeof roundDataForDisplay === 'function') ? roundDataForDisplay(data) : data;
        const states = (buildLiveMatchStates(d, courseData, savedScores, visibleIds) || [])
            .filter(st => !st.isSideMatch || maySee(st.wagerId));
        const OPEN = '<div class="lm-top">';
        const parts = String(html).split(OPEN);
        if (parts.length !== states.length + 1) return html;
        const sms = (d && d.sideMatches) || {};
        const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        states.forEach((st, i) => {
            const sm = (st.isSideMatch && st.wagerId) ? sms[st.wagerId] : null;
            const from = sm ? (Number(sm.startHole) || 1) : 1;
            if (!(from > 1)) return;
            let chunk = parts[i + 1];
            (st.segments || []).forEach(seg => {
                if (seg.started) return;
                const n = Math.max(Number(seg.startHole) || 1, from);
                const rowOld = '<span class="lm-seg-name">' + esc(String(seg.label || '').toUpperCase()) + '</span><span class="lm-seg-status lm-quiet">Not Started';
                chunk = chunk.replace(rowOld, rowOld.replace('Not Started', 'Starts hole ' + n));
                const pre = st.formatLabel === 'Nassau' ? (seg.label + ' ') : '';
                chunk = chunk.replace('<div class="lm-top-live">' + esc(pre + 'Not Started') + '</div>', '<div class="lm-top-live">' + esc(pre + 'starts hole ' + n) + '</div>');
            });
            parts[i + 1] = chunk;
        });
        return parts.join(OPEN);
    } catch (e) { return html; }
}

// ============================================================================
// 2.0 (25) "★ you" (Manny, Nov 2): the golfer THIS PHONE is - "This is me" only
// (golfapp_me_<code>, the explicit link; never a "Whose score?" pick, never a name
// match) - carries "★ you" wherever the round's golfers are listed on this phone:
// scorecard, leaderboard, live games tile, Games / Results, the in-app Receipt.
// No "This is me" = watching = no star anywhere. Exactly one golfer per phone.
//
// DISPLAY ONLY, AND NEVER SHARED. The star is CSS generated content
// (.hp-me::after). Generated content is not part of textContent or innerText, so
// nothing that READS the page carries it: the Share receipt picture and the recap
// (receipt-image.js / round-recap.js read innerText), the native PDF (reads the
// DOM's text), copied text, share text and Venmo / Cash App lines (built from the
// round data). @media print hides it for the web's print. Nothing is written to
// the round or to storage.
// ============================================================================
const HP_ME_MARK_CLASS = 'hp-me';
function hpMeMarkCode() {
    try { if (typeof currentMode !== 'undefined' && currentMode) return String(currentMode); } catch (e) { /* not this page */ }
    try { return new URLSearchParams(window.location.search).get('game') || null; } catch (e) { return null; }
}
function hpMeMarkPlayers(code) {
    try { if (typeof currentData !== 'undefined' && currentData && Array.isArray(currentData.players) && currentData.players.length) return currentData.players; } catch (e) { /* not this page */ }
    try { if (typeof currentBoardData !== 'undefined' && currentBoardData && Array.isArray(currentBoardData.players) && currentBoardData.players.length) return currentBoardData.players; } catch (e) { /* not the leaderboard */ }
    try {
        const o = JSON.parse(window.localStorage.getItem('golfapp_snap_v1_' + code) || 'null');
        if (o && o.data && Array.isArray(o.data.players)) return o.data.players;
    } catch (e) { /* no snapshot */ }
    return [];
}
// The names this phone's golfer is shown by: the full name and the board's short name.
function hpMeMarkNames() {
    const code = hpMeMarkCode(); if (!code) return [];
    let id = null;
    try { id = window.localStorage.getItem('golfapp_me_' + code); } catch (e) { id = null; }
    if (id == null || id === '') return [];
    const players = hpMeMarkPlayers(code);
    const me = players.filter(p => p && String(p.id) === String(id))[0];
    if (!me || !String(me.name || '').trim()) return [];
    const out = [String(me.name).trim().replace(/\s+/g, ' ')];
    try { const sh = golferShortName(me, players); if (sh && out.indexOf(sh) < 0) out.push(String(sh).trim()); } catch (e) { /* full name only */ }
    // A name that another golfer is ALSO shown as is not this golfer's alone: never star it.
    return out.filter(n => !players.some(p => p && String(p.id) !== String(id) && (String(p.name || '').trim().replace(/\s+/g, ' ') === n
        || (() => { try { return golferShortName(p, players) === n; } catch (e) { return false; } })())));
}
const HP_ME_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1, INPUT: 1, TITLE: 1, NOSCRIPT: 1, SVG: 1 };
function hpMeMarkTree(root, names) {
    if (!root || !names || !names.length || typeof document === 'undefined') return 0;
    let n = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const hits = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const v = String(t.nodeValue || '').replace(/ /g, ' ').trim();
        if (!v || names.indexOf(v) < 0) continue;
        const par = t.parentElement; if (!par) continue;
        if (HP_ME_SKIP[par.tagName] || par.closest('.' + HP_ME_MARK_CLASS + ',[contenteditable],[data-no-me],svg,canvas')) continue;
        hits.push(t);
    }
    hits.forEach(t => {
        const par = t.parentElement;
        if (par.childNodes.length === 1) { par.classList.add(HP_ME_MARK_CLASS); n++; return; }
        const sp = document.createElement('span'); sp.className = HP_ME_MARK_CLASS;
        par.insertBefore(sp, t); sp.appendChild(t); n++;
    });
    return n;
}
// Lone helper for code that builds a name into one string ("Skins: Manny 2 (1, 3)"):
// wraps an escaped name in the marker span when it is this phone's golfer.
function hpMeNameHtml(escapedName) {
    try { const names = hpMeMarkNames(); return names.indexOf(String(escapedName)) >= 0 ? '<span class="' + HP_ME_MARK_CLASS + '">' + escapedName + '</span>' : escapedName; } catch (e) { return escapedName; }
}
// A line that names several golfers in one string ("Skins: Manny 2 (1, 3) · Josh 1 (2)"):
// stars this phone's golfer's name where it stands as a whole name. Takes and returns ESCAPED html.
function hpMeMarkText(escapedText) {
    try {
        const names = hpMeMarkNames().slice().sort((a, b) => b.length - a.length);
        let out = String(escapedText);
        names.forEach(nm => {
            const e = escapeHtml(nm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp('(^|[\\s(·:,/])(' + e + ')(?=$|[\\s)·:,/])', 'g'), '$1<span class="' + HP_ME_MARK_CLASS + '">$2</span>');
        });
        return out;
    } catch (e) { return escapedText; }
}
function hpMeMarkStart() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || window.__hpMeMarkOn) return;
    window.__hpMeMarkOn = true;
    const css = '.hp-me::after{content:"\\00a0\\2605\\00a0you";font-size:.72em;font-weight:800;letter-spacing:.01em;opacity:.8;white-space:nowrap}'
        + '@media print{.hp-me::after{content:none!important}}';
    const add = () => {
        if (!document.getElementById('hp-me-style')) { const st = document.createElement('style'); st.id = 'hp-me-style'; st.textContent = css; (document.head || document.documentElement).appendChild(st); }
        let names = hpMeMarkNames(), key = names.join('|');
        let pending = new Set(), timer = null;
        const flush = () => {
            timer = null;
            const nn = hpMeMarkNames(), k2 = nn.join('|');
            if (k2 !== key) {   // "This is me" changed: clear every star, then mark the whole page again
                key = k2; names = nn;
                document.querySelectorAll('.' + HP_ME_MARK_CLASS).forEach(el => { if (el.tagName === 'SPAN' && el.attributes.length === 1) { el.replaceWith(...el.childNodes); } else el.classList.remove(HP_ME_MARK_CLASS); });
                pending = new Set([document.body]);
            }
            const roots = Array.from(pending); pending = new Set();
            if (names.length) roots.forEach(r => { if (r && r.isConnected) hpMeMarkTree(r, names); });
        };
        const queue = (r) => { pending.add(r); if (!timer) timer = setTimeout(flush, 60); };
        queue(document.body);
        try {
            new MutationObserver(recs => {
                recs.forEach(r => {
                    if (r.type === 'characterData') { if (r.target.parentElement) queue(r.target.parentElement); return; }
                    r.addedNodes.forEach(nd => { if (nd.nodeType === 1) queue(nd); else if (nd.nodeType === 3 && nd.parentElement) queue(nd.parentElement); });
                });
            }).observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch (e) { /* no observer: the first pass stands */ }
        // "This is me" set or cleared (Who am I, "This isn't me") re-renders the card, and every flush re-reads
        // the names first. No timer: a timer would keep a test's Node process alive.
        try { window.addEventListener('storage', () => queue(document.body)); window.addEventListener('pageshow', () => queue(document.body)); } catch (e) { /* none */ }
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver === 'function' && document.createTreeWalker && !(typeof module !== 'undefined' && module.exports)) {
    try { window.hpMeNameHtml = hpMeNameHtml; window.hpMeMarkText = hpMeMarkText; window.hpMeMarkNames = hpMeMarkNames; window.hpMeMarkTree = hpMeMarkTree; hpMeMarkStart(); } catch (e) { /* display extra only */ }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml, getSmartDisplayName, golferShortName, golferShortNameMap, playersForDisplay, roundDataForDisplay,
        sideMatchStakeFree, sideMatchReceiptStakeFree, roundStakeFree, liveMatchStateStakeFree, sideMatchStakeFreeTerms, hpZeroStakeBetLines, hpZeroStakeNetLine, hpZeroStakeLiveCard, hpStartsHoleLiveCard, hpLiveCardActions,
        hpMeMarkNames, hpMeMarkTree, hpMeNameHtml, hpMeMarkText };
}

// ---- 2.0 (25) ADVISOR-0725 (7:51 e): A MATCH THAT HAS NOT REACHED ITS FIRST HOLE ----------------------
// A Nassau / Match Play set to count from hole 5, on a round thru 4, has nothing to say yet: its
// segments are "All square", its money "$0 · halved", its match line "every game halved" - three
// claims about holes nobody has played. This says when it starts instead. The start hole: the match's
// own first hole in play order (sideMatchHoles - a shotgun or a back-nine start reads its real hole).
// "Played" = every golfer in the match has a score on that hole. Only a match with a start hole past the
// round's first hole (a game added mid-round); a match from hole 1 reads exactly as before. Display only.
function hpSideMatchStartsHole(sm, holes, savedScores) {
    try {
        if (!sm || !(Number(sm.startHole) > 1)) return 0;
        const ids = (sm.teamAIds || []).concat(sm.teamBIds || []).map(String);
        const list = Array.isArray(holes) ? holes : [];
        if (!ids.length || !list.length) return 0;
        const sc = savedScores || {};
        const played = list.some((h) => ids.every((id) => Number(sc['p' + id + '_h' + h.hole]) > 0));
        if (played) return 0;
        return Number(list[0] && list[0].hole) || Number(sm.startHole) || 0;
    } catch (e) { return 0; }
}
function hpSideMatchStartsText(hole) { return 'Starts hole ' + hole + ' · not played yet'; }

// ---- 2.0 (25) ADVISOR-0725 (7:51 f): THE PROVIDER'S MISSING APOSTROPHE -------------------------------------
// GolfAPI names Talking Stick's north course "North - O Odham" - the apostrophe is gone at the source
// (the app's own directory has "Talking Stick Golf Club (O'odham)"), so every round started from that
// listing stored and showed "(North - O Odham)". The GPS course line already repaired it (gps-view.js
// clPart); this is the same repair for every other place a course name is shown, and for the name a
// new round stores. A known list, not a guess: a space is not turned into an apostrophe anywhere else.
function hpCourseNameText(name) {
    if (name === undefined || name === null) return name;
    return String(name).replace(/\bO\s+Odham\b/gi, 'O’odham');
}

// 2.0.2 (Manny): a round's link was shared from this phone: the organizer's 💬 shows from now on (round-chat.js).
function hpMarkLinkShared(url, code) {
    try { var m = /[?&]game=([^&#]+)/.exec(String(url || '')), c = String(code || (m && m[1]) || '').toUpperCase(); if (c) localStorage.setItem('hardpan_link_shared_' + c, '1'); } catch (e) {}
}

if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { hpSideMatchStartsHole, hpSideMatchStartsText, hpCourseNameText });
}

