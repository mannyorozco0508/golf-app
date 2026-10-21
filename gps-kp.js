// ============================================================================
// HARDPAN GPS - KP BY GPS (URGENT-045 #2, docs/gps-phase2.md section 1)
//
// ON A KP HOLE (the Weekly Game's KP holes, moneyPool.kp) the GPS screen's bottom row gets
// "⛳ Mark my KP" - the shared Mark button (gps-mark-distance.js, HardPanMark), beside Mark
// shot. The golfer stands at the ball and taps; the phone takes the best GPS reading over
// ~5 s. The distance is to THE CUP, not the green's middle (the phase 2 plan: a green-middle
// distance is not a KP measure, and Edit pin is gone): the first golfer on this phone to mark
// the hole is asked to stand at the cup and tap "Cup is here" once; the rest of the group on
// this phone reuse it. The ball and cup points are held in this page's memory only (never
// stored, never sent); the cup is forgotten after 4 hours.
//
// WHAT IS RECORDED: a DISTANCE and the time, never a position -
//     events/<code>/kpGps/h<N>/marks/<playerId> =
//         { kind: 'kp', inches, ft, in, yd, accFt, at, name, group, by: 'gps' }
// gps_kp_test.js (the guard) drives the flow and proves no written value holds a latitude or
// a longitude, and that this file and gps-mark-distance.js never store or send a point.
//
// THE EXISTING KP FLOW DECIDES THE MONEY, UNCHANGED. The closest GPS distance (against the
// other GPS marks and a KP typed WITH a distance) wins, and is written by index.html's own
// saveKpLeader(hole, playerId, feet, inches) + recordKpGroupAnswer(hole, playerId) - exactly
// what a tap on the golfer's name in the KP block does (pickKpLeader) with feet / inches typed
// in. So kpLeaders/h<N> + kpWinners/h<N> land in ONE update, the group's KP question is
// answered, and pool-engine.js pays kpWinners as it always has. Not overruled by a GPS number:
// a KP typed by hand WITHOUT a distance (the group on the green said so), a hole the organizer
// marked "nobody won it", and the organizer's override.
//
// ORGANIZER OVERRIDE (organizer link, or the round's signed-in owner): from the results sheet,
// "Make KP" on any golfer. Written with the same two keys in one update (saveKpLeader itself
// when this link may write for that golfer, else the same shape and queue key), it locks the
// hole against later GPS marks (kpGps/h<N>/override) and is LOGGED:
//     events/<code>/kpGpsLog/<push> = { hole, kind: 'kp', action: 'override' | 'override-off' | 'auto',
//                                      playerId, prevPlayerId, at, by: 'organizer' | 'group' }
// MONEY: no engine is touched. pool-engine.js / settlement-engine.js never read kpGps or kpGpsLog.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : null;
    var M_PER_YD = 0.9144, M_PER_IN = 0.0254;
    var KEEP_MS = 4 * 3600 * 1000;    // the cup, held in memory this long
    var KP_MAX_YD = 60;               // farther than this from the cup is not a KP

    function geo() { return (W && W.HardPanGeo) || (typeof require === 'function' ? require('./gps-geo.js') : null); }
    function list(v) { if (Array.isArray(v)) return v; if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; }); return []; }
    function nums(v) { return list(v).map(Number).filter(function (x) { return isFinite(x) && x > 0; }); }

    // ---- THE ROUND'S KP HOLES (pure) ----------------------------------------------
    // The holes the KP engine pays: moneyPool.kp.holes with KP money on it, not cancelled. A hole
    // another feature claims (moneyPool.longDrive.holes - the Long Drive helper) is not a KP hole.
    function pool(d) { var mp = d && d.moneyPool; return mp && mp.enabled !== false ? mp : null; }
    function kpCancelled(d) { return !!(d && d.kpCancelled && d.kpCancelled.cancelled === true); }
    function kpHoles(d) {
        var mp = pool(d);
        if (!mp || kpCancelled(d) || !mp.kp || !(Number(mp.kp.amount) > 0)) return [];
        var other = nums(mp.longDrive && mp.longDrive.holes);
        return nums(mp.kp.holes).filter(function (h) { return other.indexOf(h) === -1; });
    }
    function isKpHole(d, hole) { return kpHoles(d).indexOf(Number(hole)) > -1; }

    // ---- DISTANCES (pure) -----------------------------------------------------------
    function kpDistance(meters) {
        var inches = Math.max(0, Math.round(Number(meters) / M_PER_IN));
        return { inches: inches, ft: Math.floor(inches / 12), in: inches % 12, yd: Math.round(Number(meters) / M_PER_YD) };
    }
    function kpLabel(inches) {
        if (inches == null || !isFinite(inches)) return '';
        return Math.floor(inches / 12) + ' ft ' + Math.round(inches % 12) + ' in';
    }
    function acc(a, b) { var x = Number(a) || 0, y = Number(b) || 0; return Math.sqrt(x * x + y * y); }
    // THE RECORD - a distance, its accuracy, the time, who. No coordinates (gps_kp_test.js).
    function kpMark(meters, accM, at, who) {
        var k = kpDistance(meters);
        return { kind: 'kp', inches: k.inches, ft: k.ft, in: k.in, yd: k.yd, accFt: Math.round((Number(accM) || 0) / 0.3048), at: at,
            name: String((who && who.name) || ''), group: who && who.group != null ? who.group : null, by: 'gps' };
    }

    // ---- WHO HAS THE KP (pure) --------------------------------------------------------
    function rec(d, hole) { return ((d && d.kpGps) || {})['h' + Number(hole)] || {}; }
    function marksOf(d, hole) {
        var m = rec(d, hole).marks || {};
        return Object.keys(m).map(function (pid) { return Object.assign({ pid: String(pid) }, m[pid]); })
            .filter(function (x) { return x && x.at && (x.kind || 'kp') === 'kp' && isFinite(x.inches); });
    }
    // { best: { pid, inches, at, src: 'gps' | 'typed' | 'organizer' }, leader, blocked: null | 'override' | 'typed' | 'nobody', change }
    function decide(d, hole) {
        var h = Number(hole), r = rec(d, h), leader = ((d && d.kpLeaders) || {})['h' + h] || null;
        var winner = ((d && d.kpWinners) || {})['h' + h];
        var out = { best: null, leader: leader, blocked: null, change: false };
        if (r.override && r.override.playerId != null) { out.blocked = 'override'; out.best = { pid: String(r.override.playerId), src: 'organizer' }; return out; }
        if (d && d.kpNoWinner && d.kpNoWinner['h' + h]) { out.blocked = 'nobody'; return out; }
        var win = r.win || null;
        var fromGps = !!(leader && win && String(win.playerId) === String(leader.playerId));
        var cands = marksOf(d, h).map(function (m) { return { pid: m.pid, inches: Number(m.inches), at: m.at, src: 'gps' }; });
        if (leader && !fromGps) {
            // Typed on the scorecard. With a distance it competes; without one it stands.
            if (leader.distanceInches != null && isFinite(leader.distanceInches)) cands.push({ pid: String(leader.playerId), inches: Number(leader.distanceInches), at: leader.updatedAt || 0, src: 'typed' });
            else { out.blocked = 'typed'; return out; }
        } else if (!leader && winner) { out.blocked = 'typed'; return out; }
        if (!cands.length) return out;
        cands.sort(function (a, b) { return a.inches !== b.inches ? a.inches - b.inches : (a.at || 0) - (b.at || 0); });
        out.best = cands[0];
        out.change = out.best.src === 'gps' && (!leader || String(leader.playerId) !== out.best.pid || Number(leader.distanceInches) !== out.best.inches);
        return out;
    }

    // ---- THE PAGE SIDE --------------------------------------------------------------------
    /* global currentData, currentMode, db, durableWrite, saveKpLeader, recordKpGroupAnswer, canSetKpLeader,
       hasOrganizerAuthority, canReachSetup, playerGroupOf */
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function code() { try { return typeof currentMode !== 'undefined' ? currentMode : null; } catch (e) { return null; } }
    function mayWriteFor(pid) { try { return typeof canSetKpLeader === 'function' ? !!canSetKpLeader(pid) : false; } catch (e) { return false; } }
    function organizer() {
        try { if (typeof hasOrganizerAuthority === 'function' && hasOrganizerAuthority()) return true; } catch (e) {}
        try { if (typeof canReachSetup === 'function' && canReachSetup()) return true; } catch (e) {}
        return false;
    }
    function groupOf(pid) { try { return typeof playerGroupOf === 'function' ? playerGroupOf(pid) : null; } catch (e) { return null; } }
    function playerOf(pid) { var d = data() || {}; return (d.players || []).filter(function (p) { return String(p.id) === String(pid); })[0] || null; }
    function nameOf(pid) { var p = playerOf(pid); return p ? p.name : String(pid); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function clock(t) { var d = new Date(t), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM'); }
    function write(updates, key) {
        var c = code(); if (!c) return Promise.reject(new Error('no round'));
        try {
            var p = typeof durableWrite === 'function' ? durableWrite('events/' + c, 'update', updates, key) : db.ref('events/' + c).update(updates);
            if (p && typeof p.catch === 'function') p.catch(function () {});
            return p;
        } catch (e) { return Promise.reject(e); }
    }
    // The page's copy first (the live snapshot brings the same back), so the sheet and decide() see it now.
    function local(path, v) {
        var d = data(); if (!d) return;
        var parts = path.split('/'), o = d;
        for (var i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
        if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
    }
    function logEntry(hole, action, pid, prev) {
        var e = { hole: Number(hole), kind: 'kp', action: action, playerId: pid == null ? null : String(pid), prevPlayerId: prev == null ? null : String(prev), at: Date.now(), by: organizer() ? 'organizer' : 'group' };
        var k = null; try { k = db.ref('events/' + code() + '/kpGpsLog').push().key; } catch (x) { k = null; }
        return { key: k || ('l' + e.at + Math.floor(Math.random() * 1e4)), entry: e };
    }
    function logsFor(hole) {
        var L = (data() || {}).kpGpsLog || {};
        return Object.keys(L).map(function (k) { return L[k]; }).filter(function (e) { return e && Number(e.hole) === Number(hole) && (e.kind || 'kp') === 'kp'; })
            .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    }
    // THE WINNER INTO THE EXISTING KP FLOW. This link may write for the golfer: index.html's own
    // saveKpLeader + recordKpGroupAnswer (pickKpLeader's two calls). Otherwise - the organizer on a
    // field link - the same two keys, the same shape, the same queue key, in ONE update.
    function feed(hole, best, why) {
        var h = Number(hole), pid = String(best.pid), d = data() || {};
        var has = best.inches != null && isFinite(best.inches);
        var ft = has ? String(Math.floor(best.inches / 12)) : '', inch = has ? String(best.inches % 12) : '';
        var prev = ((d.kpLeaders || {})['h' + h] || {}).playerId;
        var win = { playerId: pid, at: Date.now() }; if (has) win.inches = best.inches;
        var lg = logEntry(h, why || 'auto', pid, prev);
        var extra = {}; extra['kpGps/h' + h + '/win'] = win; extra['kpGpsLog/' + lg.key] = lg.entry;
        var leaderRec = { playerId: pid, playerName: nameOf(pid), group: groupOf(pid), distanceInches: has ? best.inches : null, updatedAt: Date.now() };
        if (mayWriteFor(pid) && typeof saveKpLeader === 'function') {
            var p = saveKpLeader(h, pid, ft, inch);
            if (!p) return null;
            if (typeof recordKpGroupAnswer === 'function') { try { recordKpGroupAnswer(h, pid); } catch (e) {} }
            local('kpLeaders/h' + h, leaderRec); local('kpWinners/h' + h, pid);
            local('kpGps/h' + h + '/win', win); local('kpGpsLog/' + lg.key, lg.entry);
            write(extra, 'kpgps:' + code() + ':h' + h + ':win');
            return p;
        }
        if (!organizer()) return null;
        var u = {};
        u['kpLeaders/h' + h] = leaderRec;
        u['kpWinners/h' + h] = pid;
        Object.keys(extra).forEach(function (k) { u[k] = extra[k]; });
        local('kpLeaders/h' + h, leaderRec); local('kpWinners/h' + h, pid);
        local('kpGps/h' + h + '/win', win); local('kpGpsLog/' + lg.key, lg.entry);
        return write(u, 'kp:' + code() + ':h' + h);
    }
    function settle(hole) {
        var d = data(); if (!d) return null;
        var v = decide(d, hole);
        if (v.change && v.best) feed(hole, v.best, 'auto');
        return v;
    }
    function override(hole, pid) {
        if (!organizer()) return false;
        var h = Number(hole), m = marksOf(data(), h).filter(function (x) { return x.pid === String(pid); })[0];
        var ov = { playerId: String(pid), at: Date.now() };
        var u = {}; u['kpGps/h' + h + '/override'] = ov; local('kpGps/h' + h + '/override', ov);
        write(u, 'kpgps:' + code() + ':h' + h + ':ov');
        feed(h, { pid: String(pid), inches: m ? Number(m.inches) : null }, 'override');
        st.note = 'Organizer: ' + nameOf(pid) + ' has the KP';
        return true;
    }
    function clearOverride(hole) {
        if (!organizer()) return false;
        var h = Number(hole), lg = logEntry(h, 'override-off', null, (rec(data(), h).override || {}).playerId);
        var u = {}; u['kpGps/h' + h + '/override'] = null; u['kpGps/h' + h + '/win'] = null; u['kpGpsLog/' + lg.key] = lg.entry;
        local('kpGps/h' + h + '/override', null); local('kpGps/h' + h + '/win', null); local('kpGpsLog/' + lg.key, lg.entry);
        write(u, 'kpgps:' + code() + ':h' + h + ':ov');
        // Back to the GPS result: the closest mark, as if just marked.
        var v = decide(Object.assign({}, data(), { kpLeaders: {}, kpWinners: {} }), h);
        if (v.best) feed(h, v.best, 'auto');
        st.note = '';
        return true;
    }

    // ---- THE BUTTON (HardPanMark) -----------------------------------------------------------
    var st = { ball: null, note: '' };
    var cups = {};   // in memory only: { '<code>|h<N>': { pt, acc, at } } - never stored, never sent
    function keyOf(h) { return String(code() || '') + '|h' + Number(h); }
    function cupFor(h) { var c = cups[keyOf(h)]; if (c && Date.now() - c.at < KEEP_MS) return c; delete cups[keyOf(h)]; return null; }
    function golfer(c) {
        var g = c && c.golfer; if (!g || g.id == null) return null;
        return { id: String(g.id), name: (g.player && g.player.name) || nameOf(g.id), group: groupOf(g.id) };
    }
    function measure(pos, c) {
        var h = Number(c.hole), g = golfer(c);
        if (st.ball && st.ball.hole === h) {
            // The second tap, at the cup: the cup for this hole (this phone, memory only), then the distance
            // - for the golfer whose ball it is, whoever the screen shows now.
            cups[keyOf(h)] = { pt: [pos.pt[0], pos.pt[1]], acc: pos.acc, at: Date.now() };
            var ball = st.ball; st.ball = null;
            return distanceOf(ball, cups[keyOf(h)], ball.golfer);
        }
        if (!g) return { error: 'Pick your golfer first' };
        st.note = '';
        var cup = cupFor(h);
        if (!cup) {
            st.ball = { pid: g.id, golfer: g, hole: h, pt: [pos.pt[0], pos.pt[1]], acc: pos.acc };
            st.note = g.name + '’s ball is marked - now the cup';
            return { pending: 'Ball marked. Now walk to the cup.' };
        }
        st.ball = null;
        return distanceOf(pos, cup, g);
    }
    function distanceOf(ball, cup, g) {
        var m = geo().haversineMeters(ball.pt, cup.pt);
        if (m / M_PER_YD > KP_MAX_YD) return { error: 'That’s ' + Math.round(m / M_PER_YD) + ' yds from the cup - mark it from your ball' };
        var k = kpDistance(m);
        return { yds: k.yd, ft: k.ft, extra: { inches: k.inches, in: k.in, meters: m, accM: acc(ball.acc, cup.acc), golfer: g } };
    }
    function onMark(res, c) {
        var h = Number(c.hole), g = res.extra.golfer;
        var mark = kpMark(res.extra.meters, res.extra.accM, Date.now(), g);
        var u = {}; u['kpGps/h' + h + '/marks/' + g.id] = mark;
        local('kpGps/h' + h + '/marks/' + g.id, mark);
        write(u, 'kpgps:' + code() + ':h' + h + ':' + g.id);
        settle(h);
        st.note = g.name + ': ' + kpLabel(mark.inches) + ' from the pin (' + mark.yd + ' yds) · ' + clock(mark.at);
    }
    function sheet(c) {
        var d = data() || {}, h = Number(c.hole), v = decide(d, h), org = organizer();
        var marks = marksOf(d, h).sort(function (a, b) { return a.inches - b.inches; });
        var leader = (d.kpLeaders || {})['h' + h];
        var html = '<div class="mk-head"><b>Hole ' + esc(h) + ' · Closest to the pin</b><button type="button" class="mk-x" data-mark="close" aria-label="Close">✕</button></div>';
        if (st.note) html += '<div class="mk-note">' + esc(st.note) + '</div>';
        var now = leader ? esc(leader.playerName || nameOf(leader.playerId)) : '';
        if (v.blocked === 'override') html += '<div class="mk-now">KP: <b>' + esc(nameOf(v.best.pid)) + '</b> - set by the organizer</div>';
        else if (v.blocked === 'nobody') html += '<div class="mk-now">The organizer recorded that nobody won it.</div>';
        else if (v.blocked === 'typed') html += '<div class="mk-now">KP: <b>' + now + '</b> - recorded by hand with no distance. The organizer can change it.</div>';
        else if (leader) html += '<div class="mk-now">KP: <b>' + now + '</b>' + (leader.distanceInches != null ? ' · ' + esc(kpLabel(leader.distanceInches)) : '') + '</div>';
        else html += '<div class="mk-now">No KP yet.</div>';
        marks.forEach(function (m) {
            var lead = leader && String(leader.playerId) === m.pid;
            var acts = org && !lead ? '<span class="a"><button type="button" data-mark="win" data-pid="' + esc(m.pid) + '">Make KP</button></span>' : '';
            html += '<div class="mk-row"><span class="n">' + esc(m.name || nameOf(m.pid)) + '</span><span class="d">' + esc(kpLabel(m.inches)) + ' <small>' + esc(m.yd) + ' yds · ±' + esc(m.accFt) + ' ft · ' + esc(clock(m.at)) + '</small>'
                + (lead ? ' <i class="mk-tag">KP</i>' : '') + '</span>' + acts + '</div>';
        });
        if (!marks.length) html += '<div class="mk-row off">No GPS marks on this hole yet.</div>';
        var logs = logsFor(h).filter(function (e) { return e.action !== 'auto'; });
        if (logs.length) html += '<div class="mk-log">' + logs.slice(-3).map(function (e) {
            return '<div>' + esc(clock(e.at)) + ' · Organizer ' + (e.action === 'override' ? 'made ' + esc(nameOf(e.playerId)) + ' the KP' + (e.prevPlayerId ? ' (was ' + esc(nameOf(e.prevPlayerId)) + ')' : '') : 'went back to the GPS result') + '</div>';
        }).join('') + '</div>';
        if (org && v.blocked === 'override') html += '<button type="button" class="mk-wide" data-mark="auto">Back to the GPS result</button>';
        if (st.ball) html += '<button type="button" class="mk-wide" data-mark="cancel">Cancel this mark</button>';
        html += '<button type="button" class="mk-link" data-mark="recup">Mark the cup again</button>';
        html += '<div class="mk-foot">Distances only - no position leaves this phone.</div>';
        return html;
    }
    function onAction(a, el, c) {
        var h = Number(c.hole), pid = el.getAttribute('data-pid');
        if (a === 'win') override(h, pid);
        else if (a === 'auto') clearOverride(h);
        else if (a === 'cancel') st.ball = null;
        else if (a === 'recup') { delete cups[keyOf(h)]; st.ball = null; st.note = 'Cup cleared - the next mark asks for it again'; }
    }
    var spec = {
        id: 'kp', listName: 'KP results',
        when: function (c) { return isKpHole(data(), c.hole); },
        label: function (c) { return st.ball && st.ball.hole === Number(c.hole) ? '⛳ Cup is here' : '⛳ Mark my KP'; },
        canMark: function (c) { if (st.ball && st.ball.hole === Number(c.hole)) return null; var g = golfer(c); if (!g) return 'Pick your golfer first'; if (!mayWriteFor(g.id)) return 'Only a golfer in your group can be marked from this phone'; return null; },
        measure: measure, onMark: onMark, sheet: sheet, onAction: onAction,
        count: function (c) { return marksOf(data(), c.hole).length || null; },
        onHole: function () { st.ball = null; st.note = ''; }
    };
    function register() { if (W && W.HardPanMark && typeof W.HardPanMark.button === 'function') { W.HardPanMark.button(spec); return true; } return false; }
    if (W && !register()) { var tries = 0, t = setInterval(function () { if (register() || ++tries > 40) clearInterval(t); }, 250); }

    var api = {
        kpHoles: kpHoles, isKpHole: isKpHole, kpDistance: kpDistance, kpLabel: kpLabel, kpMark: kpMark, marksOf: marksOf, decide: decide,
        KP_MAX_YD: KP_MAX_YD,
        settle: settle, override: override, clearOverride: clearOverride, spec: spec,
        state: function () { return { pendingBall: !!st.ball, note: st.note, cupHeld: !!(W && W.HardPanMark && W.HardPanMark.context() && cupFor(W.HardPanMark.context().hole)) }; }
    };
    if (W) W.HardPanGpsKp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
