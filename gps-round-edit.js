// ============================================================================
// HARDPAN - ROUND EDITS IN PLACE (URGENT-018 "no detours", features.simpleFlow)
//
// Manny, 10:18 PM: a quick edit must never send the golfer through the full setup steps.
// Each of these is ONE small sheet over whatever is showing (the map, the card, Round
// settings), saved as a narrow update of the round's own keys - the keys Round Setup's save
// writes, in the shapes it writes them - then closed on the same screen, hole and scroll:
//
//   Groups        groupSizeOverrides (the index-keyed sizes computeGroupBoundaries reads). A
//                 boundary moves; golfers keep their order, ids and scores. A group emptied
//                 that has scores is refused ("mark golfers Out instead"), as the Players sheet
//                 refuses it. Guarded: the record is re-read and the write refused when the
//                 roster or the groups changed on another phone.
//   Start         startingHole (1 / 10) and each group's own first hole (groupStartingHoles/<g>,
//                 the field the two-tee start and the shotgun already write - play-order.js
//                 groupStartHole reads it).
//   Nines         a two-nines course (course-data.js nineHoleLoops): courseData + courseName
//                 rebuilt by Round Setup's own remapNineHandicaps and naming. Only before any
//                 score is in - after that it is Full setup.
//   Tee for all   teeRating, and every golfer's handicap re-derived exactly as Round Setup's
//                 save derives it: GHIN - handicap.js playerHandicapFields(Index, -, new tee)
//                 for a golfer with an Index, a legacy golfer (no Index) keeps their number;
//                 as entered - the numbers stay, the tee is recorded. A round with the
//                 course-rating adjustment on (teeAdjustStrokes) cannot be re-derived (the
//                 typed numbers are not stored): Full setup.
//
// Round settings: these sit at the top, and Round Setup's whole wizard is "Full setup ›" -
// the one place the full setup stays (an explicit, labelled choice).
// Money engines untouched. OFF (simpleFlow off): nothing here draws.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    /* global currentData, currentMode, canReachSetup, db, uiToast, computeGroupSizes, computeGroupBoundaries, requireOnlineForMoney,
       playerHandicapFields, handicapBasisOf, teeStartHole, groupStartHole, nineHoleLoops, remapNineHandicaps, golferLabel */
    var W = window, D = document;
    function on() { var b = W.HardPanBet; return !!(b && typeof b.on === 'function' && b.on()); }
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function code() { try { return typeof currentMode !== 'undefined' ? currentMode : null; } catch (e) { return null; } }
    function dbr() { try { return typeof db !== 'undefined' ? db : null; } catch (e) { return null; } }
    function organizer() { try { return typeof canReachSetup === 'function' && !!canReachSetup(); } catch (e) { return false; } }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function say(t) { try { if (typeof uiToast === 'function') uiToast(t); } catch (e) {} }
    function nameOf(p) { try { return typeof golferLabel === 'function' ? golferLabel(p) : String(p.name || ''); } catch (e) { return String((p && p.name) || ''); } }
    function arr(v) { return Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; }) : []; }
    function sig(players) { return JSON.stringify((players || []).map(function (p) { return [String(p && p.id), String(p && p.name)]; })); }
    function anyScore(d, ids) {
        var sc = (d && d.scores) || {};
        return Object.keys(sc).some(function (k) {
            if (!(Number(sc[k]) > 0)) return false;
            if (!ids) return /^p\d+_h\d+$/.test(k);
            return ids.some(function (id) { return k.indexOf('p' + id + '_h') === 0; });
        });
    }
    function sizesOf(d) { var n = ((d && d.players) || []).length; try { return computeGroupSizes(n, (d && d.groupSizeOverrides) || {}); } catch (e) { return n ? [n] : []; } }
    function holesOf(d) { return ((d && d.courseData) || []).map(function (h) { return Number(h && h.hole); }).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; }); }

    // ---- THE SHEET ---------------------------------------------------------------------
    var CSS = '#hp-redit{position:fixed;inset:0;z-index:10300;display:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color-scheme:light}'
        + '#hp-redit.open{display:block}#hp-redit *{box-sizing:border-box}'
        + '#hp-redit .re-scrim{position:absolute;inset:0;background:rgba(5,20,12,.5)}'
        + '#hp-redit .re-panel{position:absolute;left:0;right:0;bottom:0;max-height:92vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#f4f6f3;color:#0f1f17;border-radius:22px 22px 0 0;padding:10px 16px calc(env(safe-area-inset-bottom) + 16px);box-shadow:0 -8px 30px rgba(0,0,0,.25)}'
        + '#hp-redit .re-grab{width:40px;height:5px;border-radius:3px;background:#c9d1cb;margin:0 auto 8px}'
        + '#hp-redit .re-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}'
        + '#hp-redit h2{font-size:22px;font-weight:800;margin:0}'
        + '#hp-redit .re-x{border:0;background:#e6ebe7;border-radius:999px;min-width:44px;min-height:44px;font-size:20px;color:#0f1f17;cursor:pointer}'
        + '#hp-redit .re-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#667;margin:14px 2px 8px}'
        + '#hp-redit .re-card{background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:12px 14px;margin-bottom:8px}'
        + '#hp-redit .re-line{display:flex;align-items:center;justify-content:space-between;gap:10px}'
        + '#hp-redit .re-n{font-size:16px;font-weight:800}#hp-redit .re-s{font-size:13px;color:#667;line-height:1.4}'
        + '#hp-redit .re-step{display:flex;align-items:center;gap:6px}#hp-redit .re-step button{min-width:44px;min-height:44px;border:1px solid #dfe5df;border-radius:12px;background:#fff;font:800 20px/1 inherit;color:#0f4c3a;cursor:pointer}#hp-redit .re-step button[disabled]{opacity:.35}'
        + '#hp-redit .re-step b{min-width:22px;text-align:center;font-size:17px}'
        + '#hp-redit .re-chips{display:flex;flex-wrap:wrap;gap:8px}'
        + '#hp-redit .re-chip{border:0;border-radius:999px;padding:9px 16px;min-height:42px;background:#e6ebe7;color:#0f1f17;font:700 15px/1 inherit;cursor:pointer}'
        + '#hp-redit .re-chip.on{background:#0f4c3a;color:#fff}'
        + '#hp-redit select{font:inherit;font-size:16px;height:44px;border:1px solid #dfe5df;border-radius:12px;background:#fff;color:#0f1f17;padding:0 10px}'
        + '#hp-redit .re-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:12px 14px;margin-bottom:8px;font:inherit;color:inherit;cursor:pointer}'
        + '#hp-redit .re-row.on{border:2px solid #0f4c3a}#hp-redit .re-dot{width:22px;height:22px;border-radius:50%;flex:none;display:inline-block}'
        + '#hp-redit .re-link{border:0;background:none;color:#0f4c3a;font:800 15px inherit;padding:10px 0;min-height:44px;cursor:pointer}'
        + '#hp-redit .re-warn{background:#fdf6e3;border:1px solid #f0dca8;border-radius:14px;padding:10px 14px;font-size:14px;line-height:1.45;margin-top:10px}'
        + '#hp-redit .re-cta{display:block;width:100%;min-height:56px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font:800 18px inherit;margin-top:14px;cursor:pointer}'
        + '#hp-redit .re-cta[disabled]{opacity:.5}'
        + '#hp-redit .re-err{color:#b42318;font-weight:700;font-size:14px;margin:8px 2px 0}'
        + '#hp-quick{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}'
        + '#hp-quick .hq-h{grid-column:1/-1;font-size:12px;font-weight:800;letter-spacing:.08em;opacity:.7;margin:2px 2px 0}'
        + '#hp-quick button{min-height:52px;border:1px solid #d0e1db;border-radius:14px;background:#fff;color:#0f4c3a;font-weight:800;font-size:15px;text-align:left;padding:8px 12px;cursor:pointer;font-family:inherit}'
        + '#hp-quick button span{display:block;font-weight:600;font-size:12px;color:#667;margin-top:2px}';
    var S = { open: false, kind: null, err: '', saving: false };
    function root() {
        var e = D.getElementById('hp-redit');
        if (e) return e;
        if (!D.getElementById('hp-redit-css')) { var st = D.createElement('style'); st.id = 'hp-redit-css'; st.textContent = CSS; D.head.appendChild(st); }
        e = D.createElement('div'); e.id = 'hp-redit'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-modal', 'true');
        D.body.appendChild(e);
        e.addEventListener('click', onClick);
        e.addEventListener('change', onChange);
        return e;
    }
    function css() { if (!D.getElementById('hp-redit-css')) root(); }
    function paint(title, body, cta) {
        var e = root(), p = e.querySelector('.re-panel'), y = p ? p.scrollTop : 0;
        e.setAttribute('aria-label', title);
        e.innerHTML = '<div class="re-scrim" data-re="close"></div><div class="re-panel"><div class="re-grab"></div>'
            + '<div class="re-top"><h2>' + esc(title) + '</h2><button type="button" class="re-x" data-re="close" aria-label="Close">✕</button></div>'
            + body + (S.err ? '<div class="re-err" role="alert">' + esc(S.err) + '</div>' : '')
            + (cta ? '<button type="button" class="re-cta" data-re="save"' + (S.saving || cta.off ? ' disabled' : '') + '>' + esc(S.saving ? 'Saving…' : cta.label) + '</button>' : '')
            + '</div>';
        p = e.querySelector('.re-panel'); if (p) p.scrollTop = y;
    }
    function render() {
        if (!S.open) return;
        if (S.kind === 'groups') return groupsView();
        if (S.kind === 'start') return startView();
        if (S.kind === 'nines') return ninesView();
        if (S.kind === 'tee') return teeView();
    }
    function close() { S.open = false; var e = D.getElementById('hp-redit'); if (e) { e.classList.remove('open'); e.innerHTML = ''; } }
    function isOpen() { return !!S.open; }
    function closeSettings() { try { var sh = D.getElementById('round-sheet'); if (sh && sh.classList.contains('open') && typeof W.toggleRoundSheet === 'function') W.toggleRoundSheet(false); } catch (e) {} }
    function open(kind) {
        var d = data();
        if (!d || !code()) return false;
        closeSettings();
        S = { open: true, kind: kind, err: '', saving: false };
        if (kind === 'groups') S.sizes = sizesOf(d).slice();
        if (kind === 'start') { S.start = startOf(d); S.gh = {}; groupsNow(d).forEach(function (b) { var m = d.groupStartingHoles; S.gh[b.group] = m && Number(m[String(b.group)]) ? Number(m[String(b.group)]) : null; }); }
        if (kind === 'tee') { S.tees = null; S.tee = (d.teeRating && d.teeRating.teeKey) || ''; loadTees(); }
        if (kind === 'nines') { S.loops = null; loadLoops(function () { var cur = currentNines(d); S.front = cur.front; S.back = cur.back; render(); }); }
        if (!organizer()) S.err = 'Only the round’s organizer can change this.';
        root().classList.add('open');
        render();
        return true;
    }
    // One guarded write: re-read, check what the sheet showed is still so, write, close.
    function commit(check, updates, okMsg) {
        if (S.saving) return;
        if (!organizer()) { S.err = 'Only the round’s organizer can change this.'; render(); return; }
        if (typeof requireOnlineForMoney === 'function' && !requireOnlineForMoney('NOT SAVED', 'Reconnect before changing the round.')) return;
        var r = dbr(), c = code();
        if (!r || !c) return;
        S.saving = true; S.err = ''; render();
        r.ref('events/' + c).once('value').then(function (snap) {
            var fresh = (snap && snap.val()) || {};
            var why = check ? check(fresh) : null;
            if (why) throw new Error(why);
            var u = typeof updates === 'function' ? updates(fresh) : updates;
            if (!u || !Object.keys(u).length) return 'nothing';
            return r.ref('events/' + c).update(u).then(function () { return 'written'; });
        }).then(function () {
            S.saving = false; close(); if (okMsg) say(okMsg);
        }, function (err) {
            S.saving = false; S.err = 'NOT SAVED — ' + ((err && err.message) || 'try again'); render();
        });
    }

    // ---- GROUPS ------------------------------------------------------------------------
    function groupsNow(d) { try { return computeGroupBoundaries(((d && d.players) || []).length, (d && d.groupSizeOverrides) || {}); } catch (e) { return [{ group: 1, startIdx: 0, size: ((d && d.players) || []).length }]; } }
    function groupsView() {
        var d = data() || {}, ps = d.players || [], sz = S.sizes, at = 0;
        var body = '<div class="re-s" style="margin:2px 2px 8px;">Golfers stay in their order; the line between groups moves. Scores stay with each golfer.</div>';
        sz.forEach(function (n, i) {
            var names = ps.slice(at, at + n).map(nameOf).join(', ');
            at += n;
            body += '<div class="re-card" data-re-group="' + (i + 1) + '"><div class="re-line"><span><span class="re-n">Group ' + (i + 1) + '</span><span class="re-s" style="display:block;">' + esc(names || '—') + '</span></span>'
                + '<span class="re-step"><button type="button" data-re-less="' + i + '" aria-label="One fewer in group ' + (i + 1) + '"' + (n <= 0 ? ' disabled' : '') + '>−</button><b>' + n + '</b>'
                + '<button type="button" data-re-more="' + i + '" aria-label="One more in group ' + (i + 1) + '"' + (i === sz.length - 1 || !(sz[i + 1] > 0) ? ' disabled' : '') + '>+</button></span></div></div>';
        });
        body += '<button type="button" class="re-link" data-re="newgroup"' + (sz.length && sz[sz.length - 1] > 1 ? '' : ' disabled') + '>+ New group</button>';
        var moved = movedNames(d);
        if (moved.length) body += '<div class="re-warn">' + moved.map(esc).join('<br>') + '</div>';
        paint('Groups', body, { label: 'Save groups', off: !changedSizes(d) });
    }
    function changedSizes(d) { return JSON.stringify(trimmed(S.sizes)) !== JSON.stringify(sizesOf(d)); }
    function trimmed(sz) { var s = sz.slice(); while (s.length && s[s.length - 1] === 0) s.pop(); return s; }
    function groupOfIdx(sz) { var out = [], g = 1; sz.forEach(function (n) { for (var k = 0; k < n; k++) out.push(g); g++; }); return out; }
    function movedNames(d) {
        var ps = d.players || [], a = groupOfIdx(sizesOf(d)), b = groupOfIdx(trimmed(S.sizes)), out = [];
        ps.forEach(function (p, i) { if (a[i] !== b[i]) out.push('Group ' + b[i] + '’s link now includes ' + nameOf(p)); });
        return out;
    }
    function groupsSave() {
        var d = data() || {}, shownSig = sig(d.players), shownSizes = JSON.stringify(sizesOf(d)), next = trimmed(S.sizes);
        // A group the change empties: refused when not the last (the groups after it would renumber -
        // their links with them), or when any golfer of it has a score.
        var empty = null;
        S.sizes.forEach(function (n, i) { if (n === 0 && i < next.length && empty == null) empty = i + 1; });
        if (empty) { S.err = 'Group ' + empty + ' would be empty and the groups after it would renumber — their links would change.'; render(); return; }
        commit(function (fresh) {
            if (sig(fresh.players) !== shownSig || JSON.stringify(sizesOf(fresh)) !== shownSizes) return 'The golfers or groups changed on another phone — open Groups again.';
            var was = groupsNow(fresh);
            for (var gi = next.length; gi < was.length; gi++) {
                var ids = (fresh.players || []).slice(was[gi].startIdx, was[gi].startIdx + was[gi].size).map(function (p) { return String(p.id); });
                if (anyScore(fresh, ids)) return 'Group ' + (gi + 1) + ' has scores — mark golfers Out instead.';
            }
            return null;
        }, function () { var m = {}; next.forEach(function (n, i) { m[i] = n; }); return { groupSizeOverrides: m }; }, 'Groups saved');
    }

    // ---- START: hole 1 / 10, and each group's own first hole --------------------------
    function startOf(d) { try { return typeof teeStartHole === 'function' ? teeStartHole(d, d.courseData || []) : (Number(d.startingHole) || 1); } catch (e) { return 1; } }
    function startView() {
        var d = data() || {}, holes = holesOf(d), gs = groupsNow(d), ten = holes.indexOf(10) > -1 && holes.length >= 18;
        var body = '<div class="re-h">THE ROUND GOES OFF</div><div class="re-chips">'
            + '<button type="button" class="re-chip' + (S.start !== 10 ? ' on' : '') + '" data-re-start="1">Hole 1</button>'
            + (ten ? '<button type="button" class="re-chip' + (S.start === 10 ? ' on' : '') + '" data-re-start="10">Hole 10</button>' : '') + '</div>';
        if (gs.length > 1 && holes.length) {
            body += '<div class="re-h">EACH GROUP’S FIRST HOLE</div><div class="re-chips" style="margin-bottom:8px;"><button type="button" class="re-chip" data-re="shotgun">Shotgun: Group 1 on 1, Group 2 on 2…</button><button type="button" class="re-chip" data-re="allsame">All off the round’s hole</button></div>';
            gs.forEach(function (b) {
                var v = S.gh[b.group];
                body += '<div class="re-card re-line"><span class="re-n">Group ' + b.group + '</span><select data-re-ghole="' + b.group + '" aria-label="Group ' + b.group + ' first hole"><option value="">Hole ' + (S.start === 10 ? 10 : holes[0] || 1) + ' (the round’s)</option>'
                    + holes.map(function (h) { return '<option value="' + h + '"' + (v === h ? ' selected' : '') + '>Hole ' + h + '</option>'; }).join('') + '</select></div>';
            });
        }
        if (anyScore(d)) body += '<div class="re-warn">Scores are already in. The start sets the order the holes are played in for the games and bets.</div>';
        paint('Start', body, { label: 'Save start', off: !startChanged(d) });
    }
    function startChanged(d) {
        if (S.start !== startOf(d)) return true;
        var m = d.groupStartingHoles || {};
        return Object.keys(S.gh).some(function (g) { var was = Number(m[String(g)]) || null; return was !== (S.gh[g] || null); });
    }
    function startSave() {
        var d = data() || {};
        commit(null, function (fresh) {
            var u = {};
            if (S.start !== startOf(fresh)) u.startingHole = S.start === 10 ? 10 : 1;
            var m = fresh.groupStartingHoles || {};
            Object.keys(S.gh).forEach(function (g) {
                var was = Number(m[String(g)]) || null, now = S.gh[g] || null;
                if (was !== now) u['groupStartingHoles/' + g] = now;
            });
            return u;
        }, 'Start saved');
        return d;
    }

    // ---- NINES (a two-nines course) -----------------------------------------------------
    function loopsFor(d) { try { return d && d.activeCourseKey && typeof nineHoleLoops !== 'undefined' && nineHoleLoops ? nineHoleLoops[d.activeCourseKey] || null : null; } catch (e) { return null; } }
    function loadLoops(done) {
        if (typeof nineHoleLoops !== 'undefined') { done(); return; }
        var s = D.createElement('script'); s.src = 'course-data.js'; s.onload = done; s.onerror = done; D.head.appendChild(s);
    }
    function hasNines(d) { return !!(d && d.activeCourseKey && /_27$/.test(String(d.activeCourseKey))) || !!loopsFor(d); }
    function nineWord(loop) { return String((loop && loop.name) || '').split(' ')[0]; }
    function currentNines(d) {
        var L = loopsFor(d) || {}, ks = Object.keys(L), m = /\(([^)]*)\)\s*$/.exec(String(d.courseName || '')), parts = m ? m[1].split('/').map(function (x) { return x.trim().replace(/\s+Only$/, ''); }) : [];
        var find = function (w) { return ks.filter(function (k) { return nineWord(L[k]).toLowerCase() === String(w || '').toLowerCase(); })[0] || null; };
        return { front: find(parts[0]) || ks[0] || null, back: parts.length > 1 ? (find(parts[1]) || ks[1] || null) : (parts.length ? 'none' : (ks[1] || null)) };
    }
    function ninesView() {
        var d = data() || {}, L = loopsFor(d);
        if (!L) { paint('Nines', '<div class="re-s">' + (S.front === undefined ? 'Loading the nines…' : 'This course has one 18.') + '</div>', null); return; }
        if (anyScore(d)) { paint('Nines', '<div class="re-warn">Scores are already in on this card. Changing the nines rewrites the card — do it in Round settings › Full setup.</div>', null); return; }
        var ks = Object.keys(L);
        var body = '<div class="re-h">FRONT 9</div><div class="re-chips">' + ks.map(function (k) { return '<button type="button" class="re-chip' + (S.front === k ? ' on' : '') + '" data-re-front="' + esc(k) + '">' + esc(nineWord(L[k])) + '</button>'; }).join('') + '</div>'
            + '<div class="re-h">BACK 9</div><div class="re-chips">' + ks.map(function (k) { return '<button type="button" class="re-chip' + (S.back === k ? ' on' : '') + '" data-re-back="' + esc(k) + '">' + esc(nineWord(L[k])) + '</button>'; }).join('')
            + '<button type="button" class="re-chip' + (S.back === 'none' ? ' on' : '') + '" data-re-back="none">None (9 holes)</button></div>';
        var cur = currentNines(d);
        paint('Nines', body, { label: 'Save nines', off: !S.front || (S.front === cur.front && S.back === cur.back) || S.front === S.back });
    }
    // Round Setup's own build (admin.html previewCourseData, the nineHoleLoops arm).
    function ninesBuild(d) {
        var L = loopsFor(d), built = [], base = String(d.courseName || '').split(' (')[0], name;
        remapNineHandicaps(L[S.front].data, true).forEach(function (it, i) { built.push({ hole: i + 1, par: it.par, hcpIndex: it.hcpIndex }); });
        if (S.back && S.back !== 'none') {
            remapNineHandicaps(L[S.back].data, false).forEach(function (it, i) { built.push({ hole: i + 10, par: it.par, hcpIndex: it.hcpIndex }); });
            name = base + ' (' + nineWord(L[S.front]) + ' / ' + nineWord(L[S.back]) + ')';
        } else name = base + ' (' + nineWord(L[S.front]) + ' Only)';
        return { courseData: built, courseName: name };
    }
    function ninesSave() {
        if (typeof remapNineHandicaps !== 'function') { S.err = 'The nines are not loaded — try again.'; render(); return; }
        commit(function (fresh) { return anyScore(fresh) ? 'Scores are already in — change the nines in Full setup.' : null; },
            function (fresh) { var b = ninesBuild(Object.assign({}, data(), fresh)); var u = { courseData: b.courseData, courseName: b.courseName }; if (b.courseData.length < 18) u.startingHole = 1; return u; }, 'Nines saved');
    }

    // ---- THE TEE FOR EVERYONE ----------------------------------------------------------
    var TEE_COLORS = { black: '#111', blue: '#2f6fdb', white: '#fff', red: '#d7262e', gold: '#d4a017', yellow: '#f2d22e', green: '#2e8b3d', silver: '#b8bec6', copper: '#b87333', purple: '#7b3fb5', orange: '#f08a24', grey: '#9aa0a6', gray: '#9aa0a6', tan: '#d2b48c' };
    function teeColor(name) {
        var n = String(name || '').toLowerCase(), hit = null;
        Object.keys(TEE_COLORS).forEach(function (c) { if (!hit && new RegExp('\\b' + c + '\\b').test(n)) hit = TEE_COLORS[c]; });
        if (!hit && /\bback\b|\btips?\b|\bchampionship\b/.test(n)) hit = TEE_COLORS.black;
        return hit || '#c4c9c4';
    }
    // The same choices Round Setup's tee select offers (admin.html courseTeeChoices): rated tees only,
    // key gender:index, par from parTotal or the holes.
    function teeChoices(rec) {
        var out = [];
        if (!rec || !rec.tees) return out;
        ['male', 'female'].forEach(function (g) {
            arr(rec.tees[g]).forEach(function (t, i) {
                if (!t) return;
                var slope = Number(t.slope != null ? t.slope : t.slope_rating), rating = Number(t.rating != null ? t.rating : t.course_rating);
                var par = Number(t.parTotal != null ? t.parTotal : t.par_total);
                if (!(par > 0)) { var hs = arr(t.holes); if (hs.length) par = hs.reduce(function (s, h) { return s + (Number(h && h.par) || 0); }, 0); }
                if (!(slope > 0) || !(rating > 0) || !(par > 0)) return;
                out.push({ key: g + ':' + i, gender: g, name: String(t.name || t.tee_name || 'Tee'), slope: slope, courseRating: rating, par: par });
            });
        });
        return out;
    }
    function loadTees() {
        var d = data() || {}, key = d.activeCourseKey, r = dbr();
        if (!key || !r) { S.tees = []; return; }
        r.ref('global_courses/' + key).once('value').then(function (s) { S.tees = teeChoices(s && s.val ? s.val() : null); if (S.open && S.kind === 'tee') render(); }, function () { S.tees = []; render(); });
    }
    function teeObjFor(key, d) {
        var c = (S.tees || []).filter(function (x) { return x.key === key; })[0];
        if (!c) return null;
        var cur = (d && d.teeRating) || {};
        return { teeKey: c.key, teeName: (c.gender === 'female' ? 'Women' : 'Men') + ' · ' + c.name, slope: c.slope, courseRating: c.courseRating, par: c.par, allowance: cur.allowance == null ? 100 : cur.allowance };
    }
    // What Round Setup's save would write for each golfer on the new tee (see the header).
    function teePlan(d, tee) {
        var basis = typeof handicapBasisOf === 'function' ? handicapBasisOf(d) : 'ghin-index', out = [];
        (d.players || []).forEach(function (p, i) {
            var f;
            if (basis === 'as-entered') f = { hcp: p.hcp };
            else if (p.handicapIndex != null && String(p.handicapIndex).trim() !== '') f = playerHandicapFields(String(p.handicapIndex), null, tee);
            else f = { hcp: p.hcp };   // a legacy golfer (no Index): their number stays
            out.push({ i: i, p: p, f: f });
        });
        return out;
    }
    function teeView() {
        var d = data() || {};
        if (d.teeAdjustStrokes === true) { paint('Tee for everyone', '<div class="re-warn">This round adjusts strokes by the tees’ course ratings, so the handicaps cannot be re-figured here. Change the tee in Round settings › Full setup.</div>', null); return; }
        if (S.tees === null) { paint('Tee for everyone', '<div class="re-s">Loading the tees…</div>', null); return; }
        if (!S.tees.length) { paint('Tee for everyone', '<div class="re-s">No rated tees for this course. Change the tee in Round settings › Full setup.</div>', null); return; }
        var body = '<div class="re-s" style="margin:2px 2px 8px;">Everyone plays this tee. Handicaps are re-figured from it exactly as Round Setup does.</div>' + S.tees.map(function (c) {
            var onx = S.tee === c.key, col = teeColor(c.name);
            return '<button type="button" class="re-row' + (onx ? ' on' : '') + '" data-re-tee="' + esc(c.key) + '" aria-pressed="' + onx + '"><span style="display:flex;align-items:center;gap:12px;"><span class="re-dot" style="background:' + col + ';' + (col === '#fff' ? 'border:1.5px solid #9aa0a6;' : '') + '"></span>'
                + '<span><span class="re-n" style="display:block;">' + esc(c.name.replace(/\s+tees?$/i, '')) + '</span><span class="re-s">' + (c.gender === 'female' ? 'Women' : 'Men') + '</span></span></span>'
                + '<span class="re-s" style="text-align:right;">' + esc(c.courseRating.toFixed(1)) + ' / ' + esc(c.slope) + '</span></button>';
        }).join('');
        var cur = (d.teeRating && d.teeRating.teeKey) || '', tee = teeObjFor(S.tee, d), lines = [];
        if (tee && S.tee !== cur) {
            teePlan(d, tee).forEach(function (x) { if (String(x.f.hcp) !== String(x.p.hcp)) lines.push(esc(nameOf(x.p)) + ': ' + esc(x.p.hcp) + ' → ' + esc(x.f.hcp)); });
            var own = (d.players || []).filter(function (p) { return p.tee; }).length;
            if (own) lines.push(own + ' golfer' + (own === 1 ? '' : 's') + ' on their own tee move to this one.');
            body += '<div class="re-warn">' + (lines.length ? lines.join('<br>') : 'No handicap changes.') + (anyScore(d) ? '<br>Scores are in: net results re-figure with the new handicaps.' : '') + '</div>';
        }
        paint('Tee for everyone', body, { label: 'Save tee', off: !tee || S.tee === cur });
    }
    function teeSave() {
        var d0 = data() || {}, shownSig = sig(d0.players), shownTee = JSON.stringify(d0.teeRating || null);
        commit(function (fresh) {
            if (sig(fresh.players) !== shownSig || JSON.stringify(fresh.teeRating || null) !== shownTee) return 'The golfers or the tee changed on another phone — open it again.';
            if (fresh.teeAdjustStrokes === true) return 'This round adjusts strokes by tee — change the tee in Full setup.';
            return null;
        }, function (fresh) {
            var d = Object.assign({}, data(), fresh), tee = teeObjFor(S.tee, d);
            if (!tee) return null;
            var u = { teeRating: tee };
            teePlan(d, tee).forEach(function (x) {
                var b = 'players/' + x.i + '/';
                u[b + 'hcp'] = x.f.hcp == null ? '' : x.f.hcp;
                if (x.f.handicapIndex !== undefined) u[b + 'handicapIndex'] = x.f.handicapIndex;
                if (x.p.handicapIndex != null && String(x.p.handicapIndex).trim() !== '') {
                    u[b + 'courseHandicap'] = typeof x.f.courseHandicap === 'number' && isFinite(x.f.courseHandicap) ? x.f.courseHandicap : null;
                    u[b + 'handicapUnconverted'] = x.f.handicapUnconverted ? true : null;
                }
                if (x.p.tee) u[b + 'tee'] = null;
            });
            return u;
        }, 'Tee saved');
    }

    // ---- TAPS --------------------------------------------------------------------------
    function onClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null, b;
        if (!t) return;
        if ((b = t.closest('[data-re-less]'))) { var i = Number(b.getAttribute('data-re-less')); if (S.sizes[i] > 0) { S.sizes[i]--; if (i + 1 < S.sizes.length) S.sizes[i + 1]++; else S.sizes.push(1); } S.err = ''; render(); return; }
        if ((b = t.closest('[data-re-more]'))) { var j = Number(b.getAttribute('data-re-more')); if (S.sizes[j + 1] > 0) { S.sizes[j]++; S.sizes[j + 1]--; } S.err = ''; render(); return; }
        if ((b = t.closest('[data-re-start]'))) { S.start = Number(b.getAttribute('data-re-start')) === 10 ? 10 : 1; render(); return; }
        if ((b = t.closest('[data-re-front]'))) { S.front = b.getAttribute('data-re-front'); render(); return; }
        if ((b = t.closest('[data-re-back]'))) { S.back = b.getAttribute('data-re-back'); render(); return; }
        if ((b = t.closest('[data-re-tee]'))) { S.tee = b.getAttribute('data-re-tee'); render(); return; }
        b = t.closest('[data-re]');
        if (!b) return;
        var a = b.getAttribute('data-re');
        if (a === 'close') { close(); return; }
        if (a === 'newgroup') { var L = S.sizes.length; if (L && S.sizes[L - 1] > 1) { S.sizes[L - 1]--; S.sizes.push(1); } render(); return; }
        if (a === 'shotgun') { var hs = holesOf(data() || {}); groupsNow(data() || {}).forEach(function (g, k) { S.gh[g.group] = hs[k % hs.length]; }); render(); return; }
        if (a === 'allsame') { Object.keys(S.gh).forEach(function (g) { S.gh[g] = null; }); render(); return; }
        if (a === 'save') {
            if (S.kind === 'groups') groupsSave();
            else if (S.kind === 'start') startSave();
            else if (S.kind === 'nines') ninesSave();
            else if (S.kind === 'tee') teeSave();
        }
    }
    function onChange(ev) {
        var t = ev.target;
        if (t && t.getAttribute && t.getAttribute('data-re-ghole')) { var v = Number(t.value) || null; S.gh[Number(t.getAttribute('data-re-ghole'))] = v; render(); }
    }

    // ---- ROUND SETTINGS: the quick edits on top, and "Full setup ›" -------------------
    function decorate() {
        if (!on()) return;
        var body = D.getElementById('round-sheet-body');
        if (!body) return;
        fullSetup();
        if (!organizer() || !data() || !code()) { var old = D.getElementById('hp-quick'); if (old) old.remove(); return; }
        if (D.getElementById('hp-quick')) return;
        css();
        var d = data(), q = D.createElement('div');
        q.id = 'hp-quick';
        var items = [];
        if (W.HardPanAddGolfer) items.push(['addgolfer', '+ Add golfer', 'Name, HCP, tee']);
        if (typeof W.openPlayersSheet === 'function') items.push(['players', '👥 Golfers', 'Rename, HCP, Out, move']);
        if ((d.players || []).length > 1) items.push(['groups', 'Groups', 'Who plays with who']);
        items.push(['start', 'Start', 'Hole 1 / 10, shotgun']);
        if (hasNines(d)) items.push(['nines', 'Nines', 'Front / back']);
        items.push(['tee', 'Tee for everyone', 'And the handicaps']);
        // 018-E: the Weekly Game (pot, KP, net, skins) - gps-bet.js's sheet, in place.
        if (W.HardPanBet && typeof W.HardPanBet.openWeekly === 'function') items.push(['weekly', 'Weekly Game', d.moneyPool && d.moneyPool.enabled !== false ? 'Pot, KP, net, skins' : 'Off - tap to set up']);
        // URGENT-019: switch courses without the full setup (gps-round.js changeCourse - a new round).
        if (W.HardPanRound && typeof W.HardPanRound.changeCourse === 'function') items.push(['course', '\u26F3 Change course', 'A new round somewhere else']);
        q.innerHTML = '<div class="hq-h">QUICK EDITS</div>' + items.map(function (x) { return '<button type="button" data-hq="' + x[0] + '">' + esc(x[1]) + '<span>' + esc(x[2]) + '</span></button>'; }).join('');
        q.addEventListener('click', function (ev) {
            var b = ev.target.closest ? ev.target.closest('[data-hq]') : null;
            if (!b) return;
            var k = b.getAttribute('data-hq');
            if (k === 'addgolfer') { closeSettings(); W.HardPanAddGolfer.open(); return; }
            if (k === 'players') { closeSettings(); W.openPlayersSheet(); return; }
            if (k === 'weekly') { closeSettings(); W.HardPanBet.openWeekly(); return; }
            if (k === 'course') { closeSettings(); W.HardPanRound.changeCourse(); return; }
            open(k);
        });
        body.insertBefore(q, body.firstChild);
    }
    // ONE "Full setup ›" (DETOURS #10/#11): Round settings' Edit Round Setup is relabelled; the
    // group strip's duplicate "Edit round setup" doors are hidden in the simple flow (the first one
    // stays, relabelled, when the Round settings entry is not drawn). Its Save comes back to the
    // round (front-door afterSave, stage 'game'), not Round Ready.
    function fullSetup() {
        var all = Array.prototype.slice.call(D.querySelectorAll('#setup-entry-mount a, a.group-setup-btn'));
        if (!all.length) return;
        var keep = all.filter(function (a) { return a.closest('#setup-entry-mount'); })[0] || all[0];
        all.forEach(function (a) {
            if (a === keep) {
                if (a.getAttribute('data-hp-full') !== '1') {
                    a.setAttribute('data-hp-full', '1');
                    a.textContent = 'Full setup › · every step: course, golfers, games, money';
                    a.addEventListener('click', function () {
                        try { W.sessionStorage.setItem('hardpan_ag_next', JSON.stringify({ code: String(code() || '').toUpperCase(), stage: 'game', at: Date.now() })); } catch (e) {}
                    });
                }
                if (a.style.display === 'none') a.style.display = '';
            } else if (a.style.display !== 'none') { a.style.display = 'none'; a.setAttribute('data-hp-hidden', '1'); }
        });
    }
    function watch() {
        var body = D.getElementById('round-sheet-body');
        if (!body || body.__hpQuick) return;
        body.__hpQuick = true;
        var queued = false;
        try { new MutationObserver(function () { if (queued) return; queued = true; setTimeout(function () { queued = false; decorate(); }, 0); }).observe(D.body, { childList: true, subtree: true }); } catch (e) {}
        decorate();
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', watch); else watch();
    setTimeout(watch, 1500);

    try { if (W.GolfBack && typeof W.GolfBack.register === 'function') W.GolfBack.register({ name: 'hp-redit', priority: 3, isOpen: isOpen, close: close }); } catch (e) {}

    W.HardPanRoundEdit = { open: open, close: close, isOpen: isOpen, decorate: decorate, teeChoices: teeChoices, teePlan: teePlan, currentNines: currentNines, teeColor: teeColor };
})();
