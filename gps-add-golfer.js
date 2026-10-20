// ============================================================================
// HARDPAN - ADD A GOLFER, IN PLACE (URGENT-017, features.simpleFlow)
//
// Manny, 10:16 PM: GPS round -> Card -> "+ Add a player" flipped through the whole original
// setup (Games Step 1 ... Players Step 3). "This needs to be seamless."
//
// ONE small sheet over whatever is showing (the map, the card, the + Bet sheet):
//   Name, HCP (+2 is a plus handicap - the "+" key, since the number pad has none), the tee
//   (the same rows as Course & Tees, the round's tee picked), "Add another"; MY GOLFERS
//   chips (this phone's recent rounds and the account's My Groups) one tap each; "Paste
//   several" (Round Setup's own paste parser, roster-paste.js parsePlayerPasteText).
//   [Add] writes and closes - the same hole, the same screen, no reload.
//
// THE SAVE IS THE ROUND PAGE'S OWN. index.html's Players sheet already adds golfers mid-round
// (psAddRow -> buildPlayersUpdate): the whole players node + groupSizeOverrides in ONE update,
// guarded by a re-read of the roster (refused when another phone changed it), new ids past
// every roster id and score key, the handicap through psHandicapFieldsFor. This sheet hands
// that builder the same draft { added: [{ group, name, hcp, flight }] } and writes what it
// returns. The one thing it adds: a golfer on ANOTHER tee than the round's gets that tee
// (p.tee, the shape player-tees.js reads) and, on a GHIN round, their Index converted from
// THEIR tee (handicap.js convertHandicapIndex) - the rule Round Setup applies. No engine,
// no settlement, no rules touched.
//
// Organizer only (canReachSetup - the Players sheet's own gate). OFF (simpleFlow off): never
// drawn; every "+ Add a player" is today's link.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    /* global currentData, currentMode, hasGroupLock, lockedGroup, canReachSetup, buildPlayersUpdate, rosterSignature, nextRosterId,
       computeGroupBoundaries, requireOnlineForMoney, db, uiToast, handicapBasisOf, convertHandicapIndex, parsePlayerPasteText */
    var W = window, D = document;
    function on() { var b = W.HardPanBet; return !!(b && typeof b.on === 'function' && b.on()); }
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function code() { try { return typeof currentMode !== 'undefined' ? currentMode : null; } catch (e) { return null; } }
    function dbr() { try { return typeof db !== 'undefined' ? db : null; } catch (e) { return null; } }
    function organizer() { try { return typeof canReachSetup === 'function' && !!canReachSetup(); } catch (e) { return false; } }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function ls(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
    function nk(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function say(t) { try { if (typeof uiToast === 'function') uiToast(t); } catch (e) {} }

    var S = { open: false, list: [], name: '', hcp: '', tee: '', group: 1, err: '', saving: false, paste: false, pasteText: '', tees: null, chips: null, onDone: null };

    // ---- THE TEES: the course record's own rows (as Course & Tees draws them) ------------
    var TEE_COLORS = { black: '#111', blue: '#2f6fdb', white: '#fff', red: '#d7262e', gold: '#d4a017', yellow: '#f2d22e', green: '#2e8b3d', silver: '#b8bec6', copper: '#b87333', purple: '#7b3fb5', orange: '#f08a24', grey: '#9aa0a6', gray: '#9aa0a6', tan: '#d2b48c', maroon: '#800000', burgundy: '#800020', teal: '#2a9d8f', pink: '#f28cb1', bronze: '#a97142', platinum: '#e5e4e2', combo: '#9aa0a6' };
    function teeColor(name) {
        var n = String(name || '').toLowerCase(), hit = null;
        Object.keys(TEE_COLORS).forEach(function (c) { if (!hit && new RegExp('\\b' + c + '\\b').test(n)) hit = TEE_COLORS[c]; });
        if (!hit && /\bback\b|\btips?\b|\bchampionship\b/.test(n)) hit = TEE_COLORS.black;
        return hit || '#c4c9c4';
    }
    function arr(v) { return Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; }) : []; }
    function yardsOf(t) {
        var y = Number(t && (t.totalYards != null ? t.totalYards : t.total_yards));
        if (!(y > 0)) y = arr(t && t.holes).reduce(function (s, h) { return s + (Number(h && (h.yardage != null ? h.yardage : h.yards)) || 0); }, 0);
        return y > 0 ? Math.round(y) : 0;
    }
    function teeRowsOf(rec) {
        var out = [], seen = {};
        ['male', 'female'].forEach(function (g) {
            arr(rec && rec.tees && rec.tees[g]).forEach(function (t, i) {
                if (!t || !t.name) return;
                var y = yardsOf(t), id = String(t.name).trim().toLowerCase() + '|' + y;
                if (seen[id]) return;
                seen[id] = 1;
                out.push({ key: g + ':' + i, name: String(t.name).replace(/\s+tees?$/i, ''), full: String(t.name), gender: g, yards: y,
                    rating: Number(t.rating != null ? t.rating : t.courseRating), slope: Number(t.slope), par: Number(t.parTotal != null ? t.parTotal : t.par) || null });
            });
        });
        return out;
    }
    function roundTee() { var d = data() || {}; return d.teeRating || null; }
    function roundTeeKey(rows) {
        var t = roundTee(); if (!t) return rows.length ? rows[0].key : '';
        var hit = rows.filter(function (r) { return t.teeKey && r.key === t.teeKey; })[0]
            || rows.filter(function (r) { return nk(r.full) === nk(t.teeName) || nk(r.name) === nk(t.teeName); })[0];
        return hit ? hit.key : '';
    }
    function loadTees() {
        if (S.tees) return;
        S.tees = [];
        var d = data() || {}, key = d.activeCourseKey, r = dbr();
        if (!key || !r) return;
        var done = false;
        setTimeout(function () { done = true; }, 8000);
        r.ref('global_courses/' + key + '/tees').once('value').then(function (s) {
            if (done) return;
            S.tees = teeRowsOf({ tees: s && s.val ? s.val() : null });
            if (S.mode === 'edit' && S.edit && !S.teePicked) { var ep = playerById(S.edit); S.tee = S.teeWas = playerTeeKey(ep); }
            else if (!S.tee) S.tee = roundTeeKey(S.tees);
            if (S.open) render();
        }, function () {});
    }

    // ---- MY GOLFERS: this phone's recent rounds, then the account's My Groups ------------
    function inRound() { return ((data() || {}).players || []).map(function (p) { return nk(p.name); }); }
    function recentGolfers() {
        var out = [], seen = {}, snaps = [];
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (!/^golfapp_snap_v1_/.test(k) || k === 'golfapp_snap_v1_' + code()) continue;
                try { var o = JSON.parse(ls(k)); if (o && o.data && Array.isArray(o.data.players)) snaps.push(o); } catch (e) {}
            }
        } catch (e) {}
        snaps.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        snaps.forEach(function (o) {
            o.data.players.forEach(function (p) {
                var n = String((p && p.name) || '').trim();
                if (!n || seen[nk(n)] || /^me$/i.test(n)) return;
                seen[nk(n)] = 1;
                out.push({ name: n, hcp: String(p.handicapIndex != null && String(p.handicapIndex).trim() !== '' ? p.handicapIndex : (p.hcp || '')) });
            });
        });
        return out;
    }
    function loadChips() {
        if (S.chips) return;
        S.chips = recentGolfers();
        var a = W.authBootState || {}, uid = a.uid, r = dbr();
        if (!uid || !r || a.isAnonymous === true) return;
        r.ref('organizers/' + uid + '/groups').once('value').then(function (s) {
            var g = s && s.val ? s.val() : null, have = {};
            S.chips.forEach(function (c) { have[nk(c.name)] = 1; });
            Object.keys(g || {}).forEach(function (id) {
                arr(g[id] && g[id].members).forEach(function (m) {
                    var n = String((m && m.name) || '').trim();
                    if (!n || have[nk(n)]) return;
                    have[nk(n)] = 1;
                    S.chips.push({ name: n, hcp: String((m && m.hcp) || '') });
                });
            });
            if (S.open) render();
        }, function () {});
    }

    // ---- WHICH GROUP: your own (the link's group, else the group "This is me" sits in) ----
    function bounds() { var d = data() || {}; try { return computeGroupBoundaries((d.players || []).length, d.groupSizeOverrides || {}); } catch (e) { return [{ group: 1, startIdx: 0, size: (d.players || []).length }]; } }
    function myGroup() {
        try { if (typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup) return Number(lockedGroup); } catch (e) {}
        var d = data() || {}, me = ls('golfapp_me_' + code()) || ls('hardpan_gps_golfer_' + code());
        var i = me != null ? (d.players || []).map(function (p) { return String(p.id); }).indexOf(String(me)) : -1;
        var b = i >= 0 ? bounds().filter(function (x) { return i >= x.startIdx && i < x.startIdx + x.size; })[0] : null;
        return b ? b.group : 1;
    }

    // ---- THE SHEET ---------------------------------------------------------------------
    var CSS = '#hp-addg{position:fixed;inset:0;z-index:10300;display:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color-scheme:light}'
        + '#hp-addg.open{display:block}#hp-addg *{box-sizing:border-box}'
        + '#hp-addg .ag-scrim{position:absolute;inset:0;background:rgba(5,20,12,.5)}'
        + '#hp-addg .ag-panel{position:absolute;left:0;right:0;bottom:0;max-height:92vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#f4f6f3;color:#0f1f17;border-radius:22px 22px 0 0;padding:10px 16px calc(env(safe-area-inset-bottom) + 16px);box-shadow:0 -8px 30px rgba(0,0,0,.25)}'
        + '#hp-addg .ag-grab{width:40px;height:5px;border-radius:3px;background:#c9d1cb;margin:0 auto 8px}'
        + '#hp-addg .ag-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}'
        + '#hp-addg h2{font-size:22px;font-weight:800;margin:0}'
        + '#hp-addg .ag-x{border:0;background:#e6ebe7;border-radius:999px;min-width:44px;min-height:44px;font-size:20px;color:#0f1f17;cursor:pointer}'
        + '#hp-addg .ag-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#667;margin:14px 2px 8px}'
        + '#hp-addg .ag-in{display:flex;gap:8px;align-items:center}'
        + '#hp-addg input,#hp-addg textarea{font:inherit;font-size:17px;color:#0f1f17;background:#fff;border:1px solid #dfe5df;border-radius:14px;padding:0 14px;height:52px;min-width:0}'
        + '#hp-addg textarea{width:100%;height:auto;min-height:110px;padding:12px 14px;resize:vertical}'
        + '#hp-addg #ag-name{flex:1}#hp-addg #ag-hcp{width:84px;text-align:center}'
        + '#hp-addg .ag-plus{min-width:52px;height:52px;border:1px solid #dfe5df;border-radius:14px;background:#fff;font:800 20px/1 inherit;color:#0f4c3a;cursor:pointer}'
        + '#hp-addg .ag-plus.on{background:#0f4c3a;color:#fff;border-color:#0f4c3a}'
        + '#hp-addg .ag-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:12px 14px;margin-bottom:8px;font:inherit;color:inherit;cursor:pointer}'
        + '#hp-addg .ag-row.on{border:2px solid #0f4c3a}#hp-addg .ag-row .n{font-size:16px;font-weight:800;display:block}#hp-addg .ag-row .s{font-size:13px;color:#667}'
        + '#hp-addg .ag-dot{width:22px;height:22px;border-radius:50%;flex:none;display:inline-block}'
        + '#hp-addg .ag-chips{display:flex;flex-wrap:wrap;gap:8px}'
        + '#hp-addg .ag-chip{border:0;border-radius:999px;padding:9px 14px;min-height:40px;background:#e6ebe7;color:#0f1f17;font:600 15px/1 inherit;cursor:pointer}'
        + '#hp-addg .ag-chip.on{background:#0f4c3a;color:#fff}'
        + '#hp-addg .ag-link{border:0;background:none;color:#0f4c3a;font:800 15px inherit;padding:10px 0;min-height:44px;cursor:pointer}'
        + '#hp-addg .ag-adding{background:#fff;border:1px solid #dfe5df;border-radius:14px;padding:10px 14px;font-size:15px;line-height:1.6}'
        + '#hp-addg .ag-adding button{border:0;background:none;color:#b42318;font-weight:800;font-size:15px;min-width:36px;min-height:32px;cursor:pointer}'
        + '#hp-addg .ag-cta{display:block;width:100%;min-height:56px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font:800 18px inherit;margin-top:14px;cursor:pointer}'
        + '#hp-addg .ag-cta[disabled]{opacity:.5}'
        + '#hp-addg .ag-err{color:#b42318;font-weight:700;font-size:14px;margin:8px 2px 0}'
        + '#hp-addg .ag-note{font-size:13px;color:#667;line-height:1.4}';
    function root() {
        var e = D.getElementById('hp-addg');
        if (e) return e;
        var st = D.createElement('style'); st.id = 'hp-addg-css'; st.textContent = CSS; D.head.appendChild(st);
        e = D.createElement('div'); e.id = 'hp-addg'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-modal', 'true'); e.setAttribute('aria-label', 'Add golfer');
        D.body.appendChild(e);
        e.addEventListener('click', onClick);
        e.addEventListener('input', onInput);
        return e;
    }
    function teeRowsHtml() {
        if (!S.tees || !S.tees.length) return '';
        return '<div class="ag-h">TEE</div>' + S.tees.map(function (r) {
            var on = S.tee === r.key, col = teeColor(r.name);
            return '<button type="button" class="ag-row' + (on ? ' on' : '') + '" data-ag-tee="' + esc(r.key) + '" aria-pressed="' + on + '">'
                + '<span style="display:flex;align-items:center;gap:12px;"><span class="ag-dot" style="background:' + col + ';' + (col === '#fff' ? 'border:1.5px solid #9aa0a6;' : '') + '"></span>'
                + '<span><span class="n">' + esc(r.name) + '</span><span class="ag-note">' + (r.gender === 'female' ? 'Women' : 'Men') + '</span></span></span>'
                + '<span class="s" style="text-align:right;line-height:1.35;">' + (r.yards ? r.yards.toLocaleString('en-US') + ' yds<br>' : '') + (isFinite(r.rating) ? esc(r.rating.toFixed(1)) + ' / ' + esc(r.slope) : '') + '</span></button>';
        }).join('');
    }
    function chipsHtml() {
        var here = inRound(), adding = S.list.map(function (r) { return nk(r.name); });
        var c = (S.chips || []).filter(function (x) { return here.indexOf(nk(x.name)) < 0 && adding.indexOf(nk(x.name)) < 0; }).slice(0, 12);
        if (!c.length) return '';
        return '<div class="ag-h">MY GOLFERS</div><div class="ag-chips">' + c.map(function (x) {
            return '<button type="button" class="ag-chip" data-ag-chip="' + esc(x.name) + '" data-ag-chcp="' + esc(x.hcp) + '">+ ' + esc(x.name) + (x.hcp !== '' ? ' ' + esc(x.hcp) : '') + '</button>';
        }).join('') + '</div>';
    }
    function teeName(key) { var r = (S.tees || []).filter(function (x) { return x.key === key; })[0]; return r ? r.name : ''; }
    function render() {
        if (S.mode === 'edit') { renderEdit(); return; }
        if (S.mode === 'list') { renderList(); return; }
        var e = root(), y = e.querySelector('.ag-panel') ? e.querySelector('.ag-panel').scrollTop : 0;
        var gs = bounds(), plus = /^\+/.test(S.hcp), rt = roundTeeKey(S.tees || []);
        var h = '<div class="ag-scrim" data-ag="close"></div><div class="ag-panel"><div class="ag-grab"></div>'
            + '<div class="ag-top">' + (S.from === 'list' ? '<button type="button" class="ag-x" data-ag="tolist" aria-label="Back">‹</button>' : '') + '<h2 style="flex:1;">Add golfer</h2><button type="button" class="ag-x" data-ag="close" aria-label="Close">✕</button></div>';
        if (S.why) h += '<div class="ag-note" style="margin:2px 2px 6px;font-weight:700;color:#0f4c3a;">' + esc(S.why) + '</div>';
        if (S.list.length) h += '<div class="ag-h">ADDING</div><div class="ag-adding" id="ag-adding">' + S.list.map(function (r, i) {
            return '<div>' + esc(r.name) + (r.hcp !== '' ? ' · ' + esc(r.hcp) : '') + (r.tee && r.tee !== rt && teeName(r.tee) ? ' · ' + esc(teeName(r.tee)) : '') + ' <button type="button" data-ag-drop="' + i + '" aria-label="Remove ' + esc(r.name) + '">✕</button></div>';
        }).join('') + '</div>';
        h += '<div class="ag-h">NAME · HCP</div><div class="ag-in"><input id="ag-name" type="text" placeholder="Name" autocomplete="off" autocapitalize="words" value="' + esc(S.name) + '">'
            + '<button type="button" class="ag-plus' + (plus ? ' on' : '') + '" data-ag="plus" aria-label="Plus handicap" aria-pressed="' + plus + '">+</button>'
            + '<input id="ag-hcp" type="text" inputmode="decimal" placeholder="HCP" autocomplete="off" value="' + esc(S.hcp.replace(/^\+/, '')) + '"></div>'
            + '<div class="ag-note" style="margin:6px 2px 0;">A plus handicap: tap <b>+</b> (or type +2).</div>';
        if (gs.length > 1) h += '<div class="ag-h">GROUP</div><div class="ag-chips">' + gs.map(function (b) { return '<button type="button" class="ag-chip' + (S.group === b.group ? ' on' : '') + '" data-ag-group="' + b.group + '">Group ' + b.group + '</button>'; }).join('') + '</div>';
        h += teeRowsHtml();
        h += '<button type="button" class="ag-link" data-ag="another">+ Add another</button>';
        h += chipsHtml();
        h += S.paste
            ? '<div class="ag-h">PASTE SEVERAL</div><textarea id="ag-paste" placeholder="One golfer per line: Bob 5.0">' + esc(S.pasteText) + '</textarea><button type="button" class="ag-link" data-ag="pastedone">Add these ›</button>'
            : '<div><button type="button" class="ag-link" data-ag="paste">Paste several ›</button></div>';
        var n = S.list.length + (S.name.trim() ? 1 : 0);
        h += (S.err ? '<div class="ag-err" role="alert">' + esc(S.err) + '</div>' : '')
            + '<button type="button" class="ag-cta" data-ag="save"' + (S.saving || !n ? ' disabled' : '') + '>' + (S.saving ? 'Adding…' : n > 1 ? 'Add ' + n + ' golfers' : 'Add') + '</button></div>';
        e.innerHTML = h;
        var p = e.querySelector('.ag-panel'); if (p) p.scrollTop = y;
    }
    // ---- EDIT ONE GOLFER (URGENT-018): name, HCP, tee, group, Out - in place ------------
    function playerById(id) { return ((data() || {}).players || []).filter(function (p) { return String(p.id) === String(id); })[0] || null; }
    function groupOfId(id) {
        var ps = (data() || {}).players || [], i = ps.map(function (p) { return String(p.id); }).indexOf(String(id));
        var b = i >= 0 ? bounds().filter(function (x) { return i >= x.startIdx && i < x.startIdx + x.size; })[0] : null;
        return b ? b.group : 1;
    }
    function shownHcp(p) { try { return typeof psShownHandicap === 'function' ? psShownHandicap(p, data()) : String((p && p.hcp) || ''); } catch (e) { return String((p && p.hcp) || ''); } }   /* global psShownHandicap */
    function playerTeeKey(p) {
        var rows = S.tees || [], t = p && p.tee;
        if (!t) return roundTeeKey(rows);
        var hit = rows.filter(function (r) { return t.teeKey && r.key === t.teeKey; })[0] || rows.filter(function (r) { return nk(r.full) === nk(t.teeName) || nk(r.name) === nk(t.teeName); })[0];
        return hit ? hit.key : roundTeeKey(rows);
    }
    function editDraft() {
        var p = playerById(S.edit), ps = (data() || {}).players || [];
        var idx = ps.indexOf(p);
        return { edits: [{ idx: idx, name: S.name.trim(), hcp: S.hcp.trim(), flight: p && p.flight === 'B' ? 'B' : 'A', out: !!S.out, group: S.group }], added: [] };
    }
    function editMoney() {
        try { if (typeof buildPlayersUpdate !== 'function' || !playerById(S.edit)) return ''; var u = buildPlayersUpdate(data(), editDraft()); return u && typeof u.money === 'string' ? u.money : (u && u.money && u.money.line) || ''; } catch (e) { return ''; }
    }
    function renderEdit() {
        var e = root(), y = e.querySelector('.ag-panel') ? e.querySelector('.ag-panel').scrollTop : 0;
        var p = playerById(S.edit), gs = bounds(), plus = /^\+/.test(S.hcp);
        if (!p) { S.mode = 'list'; renderList(); return; }
        var h = '<div class="ag-scrim" data-ag="close"></div><div class="ag-panel"><div class="ag-grab"></div>'
            + '<div class="ag-top">' + (S.from === 'list' ? '<button type="button" class="ag-x" data-ag="tolist" aria-label="Back">\u2039</button>' : '') + '<h2 style="flex:1;">Edit golfer</h2><button type="button" class="ag-x" data-ag="close" aria-label="Close">\u2715</button></div>';
        h += '<div class="ag-h">NAME \u00b7 HCP</div><div class="ag-in"><input id="ag-name" type="text" placeholder="Name" autocomplete="off" autocapitalize="words" value="' + esc(S.name) + '">'
            + '<button type="button" class="ag-plus' + (plus ? ' on' : '') + '" data-ag="plus" aria-label="Plus handicap" aria-pressed="' + plus + '">+</button>'
            + '<input id="ag-hcp" type="text" inputmode="decimal" placeholder="HCP" autocomplete="off" value="' + esc(S.hcp.replace(/^\+/, '')) + '"></div>'
            + '<div class="ag-note" style="margin:6px 2px 0;">A plus handicap: tap <b>+</b> (or type +2).</div>';
        if (gs.length > 1) h += '<div class="ag-h">GROUP</div><div class="ag-chips">' + gs.map(function (b) { return '<button type="button" class="ag-chip' + (S.group === b.group ? ' on' : '') + '" data-ag-group="' + b.group + '">Group ' + b.group + '</button>'; }).join('') + '</div>';
        h += teeRowsHtml();
        h += '<div class="ag-h">IN THE ROUND</div><div class="ag-chips">'
            + '<button type="button" class="ag-chip' + (!S.out ? ' on' : '') + '" data-ag="in">Playing</button>'
            + '<button type="button" class="ag-chip' + (S.out ? ' on' : '') + '" data-ag="out">Out of the round</button></div>'
            + (S.out ? '<div class="ag-note" style="margin:6px 2px 0;">Out: their scores stay on the record; they are out of the pot and every payout for the whole field.</div>' : '');
        var m = editMoney();
        if (m) h += '<div class="ag-note" id="ag-money" style="margin:10px 2px 0;font-weight:700;color:#0f4c3a;">' + esc(m) + '</div>';
        h += (S.err ? '<div class="ag-err" role="alert">' + esc(S.err) + '</div>' : '')
            + '<button type="button" class="ag-cta" data-ag="saveedit"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Saving\u2026' : 'Save') + '</button></div>';
        e.innerHTML = h;
        var pn = e.querySelector('.ag-panel'); if (pn) pn.scrollTop = y;
    }
    // ---- THE GOLFERS LIST (Round settings > Golfers): each golfer -> Edit; + Add golfer ------
    function hcpLabel(p) { try { return typeof golferHandicapLabel === 'function' ? golferHandicapLabel(p) : 'HCP ' + (p.hcp || 0); } catch (e) { return 'HCP ' + (p.hcp || 0); } }   /* global golferHandicapLabel */
    function renderList() {
        var e = root(), y = e.querySelector('.ag-panel') ? e.querySelector('.ag-panel').scrollTop : 0;
        var ps = (data() || {}).players || [], gs = bounds();
        var h = '<div class="ag-scrim" data-ag="close"></div><div class="ag-panel"><div class="ag-grab"></div>'
            + '<div class="ag-top"><h2>Golfers</h2><button type="button" class="ag-x" data-ag="close" aria-label="Close">\u2715</button></div>';
        gs.forEach(function (b) {
            if (gs.length > 1) h += '<div class="ag-h">GROUP ' + b.group + '</div>';
            else h += '<div class="ag-h">' + ps.length + ' GOLFER' + (ps.length === 1 ? '' : 'S') + '</div>';
            for (var i = b.startIdx; i < b.startIdx + b.size; i++) {
                var p = ps[i]; if (!p) continue;
                var tk = p.tee ? playerTeeKey(p) : '', own = tk && tk !== roundTeeKey(S.tees || []) ? teeName(tk) || (p.tee && p.tee.teeName) : '';
                h += '<button type="button" class="ag-row" data-ag-edit="' + esc(p.id) + '"' + (p.out === true ? ' style="opacity:.6;"' : '') + '><span><span class="n"' + (p.out === true ? ' style="text-decoration:line-through;"' : '') + '>' + esc(p.name) + '</span>'
                    + '<span class="s">' + esc(hcpLabel(p)) + (own ? ' \u00b7 ' + esc(own) : '') + (p.out === true ? ' \u00b7 Out' : '') + '</span></span><span class="s">Edit \u203a</span></button>';
            }
        });
        h += (S.err ? '<div class="ag-err" role="alert">' + esc(S.err) + '</div>' : '')
            + '<button type="button" class="ag-cta" data-ag="toadd">+ Add golfer</button></div>';
        e.innerHTML = h;
        var pn = e.querySelector('.ag-panel'); if (pn) pn.scrollTop = y;
    }
    function startEdit(id, from) {
        var p = playerById(id);
        if (!p) return false;
        S.mode = 'edit'; S.edit = String(p.id); S.from = from || null; S.err = ''; S.saving = false;
        S.name = String(p.name || ''); S.hcp = shownHcp(p); S.out = p.out === true; S.group = groupOfId(p.id);
        S.tee = playerTeeKey(p); S.teeWas = S.tee; S.teePicked = false;
        render();
        return true;
    }
    function saveEdit() {
        if (S.saving) return;
        if (!organizer()) { S.err = 'Only the round\u2019s organizer can change golfers.'; render(); return; }
        if (typeof buildPlayersUpdate !== 'function' || typeof rosterSignature !== 'function' || !dbr() || !code()) { S.err = 'This page cannot change golfers.'; render(); return; }
        if (typeof requireOnlineForMoney === 'function' && !requireOnlineForMoney('NOT SAVED', 'Reconnect before changing the players.')) return;
        var id = S.edit, before = rosterSignature((data() || {}).players), draft = editDraft(), rt = roundTeeKey(S.tees || []);
        var teeChanged = !!(S.tee && S.teeWas && S.tee !== S.teeWas), newTee = teeChanged ? (S.tee === rt ? null : teeObj(S.tee)) : undefined;
        var typed = S.hcp.trim();
        S.saving = true; S.err = ''; render();
        dbr().ref('events/' + code()).once('value').then(function (snap) {
            var fresh = (snap && snap.val()) || {};
            if (rosterSignature(fresh.players) !== before) throw new Error('The roster changed on another phone \u2014 close this and try again.');
            var merged = Object.assign({}, data(), fresh);
            var idx = (merged.players || []).map(function (p) { return String(p.id); }).indexOf(String(id));
            if (idx < 0) throw new Error('That golfer is no longer in the round.');
            draft.edits[0].idx = idx;
            var u = buildPlayersUpdate(merged, draft);
            if (u.refused) throw new Error(u.refused);
            var updates = u.updates || {};
            // THE GOLFER'S OWN TEE: recorded (player-tees.js reads p.tee); on a GHIN round the Index
            // is converted from THAT tee (or the round's, back on it) - the Add sheet's rule.
            if (teeChanged) {
                var basis = typeof handicapBasisOf === 'function' ? handicapBasisOf(merged) : 'ghin-index';
                var p0 = merged.players[idx];
                var idxText = typed !== shownHcp(p0) ? typed : String(p0.handicapIndex != null && String(p0.handicapIndex).trim() !== '' ? p0.handicapIndex : '');
                var conv = basis === 'ghin-index' && idxText !== '' && typeof convertHandicapIndex === 'function' ? convertHandicapIndex(idxText, newTee || merged.teeRating || null) : null;
                if (u.whole && updates.players) {
                    var wp = updates.players.filter(function (q) { return String(q.id) === String(id); })[0];
                    if (wp) {
                        if (newTee) wp.tee = newTee; else delete wp.tee;
                        if (conv && conv.ok) { wp.hcp = conv.playingText; wp.handicapIndex = conv.indexText; wp.courseHandicap = conv.course; delete wp.handicapUnconverted; }
                    }
                } else {
                    updates['players/' + idx + '/tee'] = newTee || null;
                    if (conv && conv.ok) {
                        updates['players/' + idx + '/hcp'] = conv.playingText; updates['players/' + idx + '/handicapIndex'] = conv.indexText;
                        updates['players/' + idx + '/courseHandicap'] = conv.course; updates['players/' + idx + '/handicapUnconverted'] = null;
                    }
                }
            } else if (!u.changed) return { nothing: true };
            return dbr().ref('events/' + code()).update(updates).then(function () { return { warnings: u.warnings || [] }; });
        }).then(function (res) {
            S.saving = false;
            var from = S.from;
            if (res && res.warnings && res.warnings.length) say(res.warnings.join(' \u00b7 '));
            else if (!(res && res.nothing)) say('Saved');
            if (from === 'list') { S.mode = 'list'; S.edit = null; setTimeout(render, 0); }
            else close();
            setTimeout(function () { try { if (W.HardPanBet && W.HardPanBet.redraw) W.HardPanBet.redraw(); } catch (e) {} }, 0);
        }, function (err) {
            S.saving = false;
            S.err = 'NOT SAVED \u2014 ' + ((err && err.message) || 'try again');
            render();
        });
    }
    function take() {
        var n = S.name.trim();
        if (!n) return false;
        S.list.push({ name: n, hcp: S.hcp.trim(), tee: S.tee });
        S.name = ''; S.hcp = ''; S.tee = roundTeeKey(S.tees || []);
        return true;
    }
    function focusName() { setTimeout(function () { var f = D.getElementById('ag-name'); if (f) f.focus(); }, 30); }
    function loadPaste(done) {
        if (typeof parsePlayerPasteText === 'function') { done(); return; }
        var s = D.createElement('script'); s.src = 'roster-paste.js'; s.onload = done; s.onerror = done; D.head.appendChild(s);
    }
    function onInput(ev) {
        var t = ev.target;
        if (t.id === 'ag-name') S.name = t.value;
        else if (t.id === 'ag-hcp') { var v = String(t.value || '').trim(); S.hcp = /^\+/.test(v) ? v : (/^\+/.test(S.hcp) && v ? '+' + v : v); if (/^\+/.test(v)) { t.value = v.slice(1); render(); var h = D.getElementById('ag-hcp'); if (h) { h.focus(); h.setSelectionRange(h.value.length, h.value.length); } } }
        else if (t.id === 'ag-paste') S.pasteText = t.value;
        if (S.mode === 'edit') { var mo = D.getElementById('ag-money'), mt = editMoney(); if (mo) mo.textContent = mt; return; }
        var cta = D.querySelector('#hp-addg [data-ag="save"]');
        if (cta && !S.saving) { var n = S.list.length + (S.name.trim() ? 1 : 0); cta.disabled = !n; cta.textContent = n > 1 ? 'Add ' + n + ' golfers' : 'Add'; }
    }
    function onClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null, b;
        if (!t) return;
        if ((b = t.closest('[data-ag-tee]'))) { S.tee = b.getAttribute('data-ag-tee'); S.teePicked = true; render(); return; }
        if ((b = t.closest('[data-ag-group]'))) { S.group = Number(b.getAttribute('data-ag-group')); render(); return; }
        if ((b = t.closest('[data-ag-chip]'))) { S.list.push({ name: b.getAttribute('data-ag-chip'), hcp: b.getAttribute('data-ag-chcp') || '', tee: roundTeeKey(S.tees || []) }); S.err = ''; render(); return; }
        if ((b = t.closest('[data-ag-drop]'))) { S.list.splice(Number(b.getAttribute('data-ag-drop')), 1); render(); return; }
        if ((b = t.closest('[data-ag-edit]'))) { startEdit(b.getAttribute('data-ag-edit'), 'list'); return; }
        b = t.closest('[data-ag]');
        if (!b) return;
        var a = b.getAttribute('data-ag');
        if (a === 'close') { close(); return; }
        if (a === 'tolist') { S.mode = 'list'; S.err = ''; S.list = []; S.name = ''; S.hcp = ''; render(); return; }
        if (a === 'toadd') { S.mode = 'add'; S.from = 'list'; S.err = ''; S.list = []; S.name = ''; S.hcp = ''; S.group = myGroup(); S.tee = roundTeeKey(S.tees || []); render(); focusName(); return; }
        if (a === 'in' || a === 'out') { S.out = a === 'out'; render(); return; }
        if (a === 'saveedit') { saveEdit(); return; }
        if (a === 'plus') { var raw = S.hcp.replace(/^\+/, ''); S.hcp = /^\+/.test(S.hcp) ? raw : '+' + raw; render(); return; }
        if (a === 'another') { if (!take()) { S.err = 'Type a name first.'; render(); focusName(); return; } S.err = ''; render(); focusName(); return; }
        if (a === 'paste') { S.paste = true; render(); loadPaste(function () {}); setTimeout(function () { var p = D.getElementById('ag-paste'); if (p) p.focus(); }, 30); return; }
        if (a === 'pastedone') {
            loadPaste(function () {
                var got = [];
                try {
                    var r = typeof parsePlayerPasteText === 'function' ? parsePlayerPasteText(S.pasteText, (S.tees || []).map(function (x) { return x.full; })) : null;
                    got = (r && r.validPlayers) || [];
                } catch (e) { got = []; }
                if (!got.length) { S.err = 'No golfers found in that paste - one per line, like "Bob 5.0".'; render(); return; }
                var rt = roundTeeKey(S.tees || []);
                got.forEach(function (p) {
                    var tk = rt;
                    if (p.tee) { var hit = (S.tees || []).filter(function (x) { return nk(x.full) === nk(p.tee) || nk(x.name) === nk(p.tee); })[0]; if (hit) tk = hit.key; }
                    S.list.push({ name: String(p.name || '').trim(), hcp: String(p.hcp == null ? '' : p.hcp).trim(), tee: tk });
                });
                S.paste = false; S.pasteText = ''; S.err = ''; render();
            });
            return;
        }
        if (a === 'save') { save(); return; }
    }

    // ---- THE SAVE: the Players sheet's own builder, one guarded update ------------------
    function teeObj(key) {
        var r = (S.tees || []).filter(function (x) { return x.key === key; })[0];
        return r ? { teeKey: r.key, teeName: r.full, slope: r.slope, courseRating: r.rating, par: r.par } : null;
    }
    function save() {
        if (S.saving) return;
        take();
        if (!S.list.length) { S.err = 'Type a name first.'; render(); return; }
        if (!organizer()) { S.err = 'Only the round’s organizer can add golfers.'; render(); return; }
        if (typeof buildPlayersUpdate !== 'function' || typeof rosterSignature !== 'function' || !dbr() || !code()) { S.err = 'This page cannot add golfers.'; render(); return; }
        if (typeof requireOnlineForMoney === 'function' && !requireOnlineForMoney('NOT SAVED', 'Reconnect before changing the players.')) return;
        var list = S.list.slice(), group = S.group, before = rosterSignature((data() || {}).players), rt = roundTeeKey(S.tees || []);
        var draft = { edits: [], added: list.map(function (r) { return { group: group, name: r.name, hcp: r.hcp, flight: 'A' }; }) };
        S.saving = true; S.err = ''; render();
        dbr().ref('events/' + code()).once('value').then(function (snap) {
            var fresh = (snap && snap.val()) || {};
            if (rosterSignature(fresh.players) !== before) throw new Error('The roster changed on another phone — close this and try again.');
            var merged = Object.assign({}, data(), fresh);
            var firstId = typeof nextRosterId === 'function' ? nextRosterId(merged) : null;
            var u = buildPlayersUpdate(merged, draft);
            if (u.refused) throw new Error(u.refused);
            if (!u.changed || !u.updates || !u.updates.players) throw new Error('Nothing to add.');
            // A golfer on another tee than the round's: that tee, and (GHIN) the Index from it.
            if (firstId != null) u.updates.players.forEach(function (p) {
                var r = list[Number(p.id) - firstId];
                if (!r || !r.tee || r.tee === rt) return;
                var t = teeObj(r.tee); if (!t) return;
                p.tee = t;
                var basis = typeof handicapBasisOf === 'function' ? handicapBasisOf(merged) : 'ghin-index';
                if (basis === 'ghin-index' && r.hcp !== '' && typeof convertHandicapIndex === 'function') {
                    var c = convertHandicapIndex(r.hcp, t);
                    if (c && c.ok) { p.hcp = c.playingText; p.handicapIndex = c.indexText; p.courseHandicap = c.course; delete p.handicapUnconverted; }
                }
            });
            return dbr().ref('events/' + code()).update(u.updates).then(function () { return list; });
        }).then(function (added) {
            S.saving = false;
            var cb = S.onDone, from = S.from;
            if (from === 'list') { S.mode = 'list'; S.list = []; S.name = ''; S.hcp = ''; setTimeout(render, 0); } else close();
            say(added.length > 1 ? 'Added ' + added.length + ' golfers' : 'Added ' + added[0].name);
            if (typeof cb === 'function') { try { cb(added); } catch (e) {} }
            // Whatever was under the sheet shows them: the + Bet chips redraw (the card redraws on
            // the round's own listener).
            setTimeout(function () { try { if (W.HardPanBet && W.HardPanBet.redraw) W.HardPanBet.redraw(); } catch (e) {} }, 0);
        }, function (err) {
            S.saving = false;
            S.list = list;
            S.err = 'NOT SAVED — ' + ((err && err.message) || 'try again');
            render();
        });
    }

    // ---- OPEN / CLOSE ------------------------------------------------------------------
    function open(opts) {
        var o = opts || {};
        if (!data() || !code()) return false;
        S = { open: true, mode: 'add', why: o.why || '', from: null, edit: null, out: false, list: [], name: o.name || '', hcp: '', tee: '', group: o.group || myGroup(), err: '', saving: false, paste: false, pasteText: '', tees: S.tees, chips: null, onDone: o.onDone || null };
        if (S.tees && S.tees.length) S.tee = roundTeeKey(S.tees);
        loadTees(); loadChips();
        render();
        root().classList.add('open');
        if (!organizer()) { S.err = 'Only the round’s organizer can add golfers.'; render(); }
        focusName();
        return true;
    }
    // EDIT ONE GOLFER in place (a tap on a golfer's name on the card, or a row of the Golfers list).
    function openEdit(id) {
        if (!data() || !code() || !playerById(id)) return false;
        S = { open: true, mode: 'edit', from: null, edit: null, out: false, list: [], name: '', hcp: '', tee: '', group: 1, err: '', saving: false, paste: false, pasteText: '', tees: S.tees, chips: S.chips, onDone: null };
        loadTees();
        root().classList.add('open');
        startEdit(id, null);
        if (!organizer()) { S.err = 'Only the round\u2019s organizer can change golfers.'; render(); }
        return true;
    }
    // THE GOLFERS LIST (Round settings > Golfers): every golfer -> Edit, and + Add golfer.
    function openGolfers() {
        if (!data() || !code()) return false;
        S = { open: true, mode: 'list', from: null, edit: null, out: false, list: [], name: '', hcp: '', tee: '', group: myGroup(), err: '', saving: false, paste: false, pasteText: '', tees: S.tees, chips: null, onDone: null };
        loadTees(); loadChips();
        root().classList.add('open');
        render();
        if (!organizer()) { S.err = 'Only the round\u2019s organizer can change golfers.'; render(); }
        return true;
    }
    function close() { S.open = false; var e = D.getElementById('hp-addg'); if (e) { e.classList.remove('open'); e.innerHTML = ''; } }
    function isOpen() { return !!S.open; }
    // A NEW ROUND'S TEES ARE THE COURSE'S: forget them when the round changes (a new code).
    var lastCode = null;
    setInterval(function () { var c = code(); if (c !== lastCode) { lastCode = c; S.tees = null; } }, 2000);

    // Every "+ Add a player" in a GPS round (the card's "Just scores" box, anywhere a link
    // still points at Round Setup's Players step for THIS round) opens the sheet instead.
    D.addEventListener('click', function (ev) {
        if (!on()) return;
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href*="step=players"], [data-hp-addgolfer]') : null;
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (href && code() && href.indexOf('game=' + encodeURIComponent(code())) < 0) return;
        if (!data()) return;
        ev.preventDefault(); ev.stopPropagation();
        open();
    }, true);
    // A TAP ON A GOLFER'S NAME ON THE CARD (Hole View row / Full Card header): Edit golfer, in
    // place - the organizer only. The card labels golfers with shortPlayerLabels over the golfers
    // it shows (the link's group); the same labels find the golfer back.
    function shownPlayers() {
        var ps = (data() || {}).players || [];
        try {
            if (typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup) {
                var b = bounds().filter(function (x) { return x.group === Number(lockedGroup); })[0];
                if (b) return ps.slice(b.startIdx, b.startIdx + b.size);
            }
        } catch (e) {}
        return ps;
    }
    function idForLabel(label) {
        var list = shownPlayers(), labels;
        try { labels = typeof shortPlayerLabels === 'function' ? shortPlayerLabels(list) : list.map(function (p) { return p.name; }); } catch (e) { labels = list.map(function (p) { return p.name; }); }   /* global shortPlayerLabels */
        var i = labels.map(function (l) { return String(l).trim(); }).indexOf(String(label).trim());
        if (i < 0) { var byName = list.filter(function (p) { return String(p.name).trim() === String(label).trim(); }); return byName.length === 1 ? byName[0].id : null; }
        return list[i] ? list[i].id : null;
    }
    D.addEventListener('click', function (ev) {
        if (!on() || !organizer() || isOpen()) return;
        var t = ev.target && ev.target.closest ? ev.target : null;
        var hv = t ? t.closest('.hv-player-name') : null, fc = t ? t.closest('th[data-player-name]') : null;
        if (!hv && !fc) return;
        var label = fc ? fc.getAttribute('data-player-name') : (hv.firstChild && hv.firstChild.nodeType === 3 ? hv.firstChild.nodeValue : '');
        var id = label ? idForLabel(label) : null;
        if (id == null) return;
        ev.preventDefault(); ev.stopPropagation();
        openEdit(id);
    }, true);
    // BACK (GolfBack): the sheet closes first.
    try {
        if (W.GolfBack && typeof W.GolfBack.register === 'function') W.GolfBack.register({ name: 'hp-addgolfer', priority: 3, isOpen: isOpen, close: close });
    } catch (e) {}

    W.HardPanAddGolfer = { open: open, openEdit: openEdit, openGolfers: openGolfers, close: close, isOpen: isOpen, myGroup: myGroup, _teeRowsOf: teeRowsOf };
})();
