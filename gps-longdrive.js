// ============================================================================
// HARDPAN GPS - LONG DRIVE (URGENT-045 #2b, docs/gps-phase2.md section 2)
//
// THE BET: "+ Bet" > More > Long Drive opens the Weekly Game sheet (gps-bet.js) with a Long
// Drive row: the hole (a par 4 or 5) and "Rough counts" (off by default). It is saved by the
// sheet's own Save - organizer only, online only, pool-engine.js validateMoneyPool - as
//     moneyPool.longDrive = { holes: [N], allowRough: false }
// and the hole is ALSO one of moneyPool.kp.holes, so the KP money pays it exactly as it pays a
// KP hole (an even share of the KP money). gps-kp.js leaves moneyPool.longDrive.holes alone.
//
// ON THE LONG DRIVE HOLE the GPS screen's bottom row gets "🏌️ Mark my drive" (the shared Mark
// button, gps-mark-distance.js / HardPanMark). The golfer stands at the ball and taps; the phone
// takes the best reading over ~5 s and this file measures, ON THE PHONE:
//   distance  haversine(this hole's tee, the ball), whole yards
//   lie       'fairway'  inside an OSM fairway polygon, or within 25 yds of the saved line
//                        (course_gps/<key>/lines/hN, gps-geo.savedLine)
//             'rough'    neither - it does not count unless the organizer turned on "Rough counts"
//             'nomap'    the hole has no fairway polygon and no saved line: counts, flagged, and
//                        the organizer can call it rough from the results sheet
//
// WHAT IS RECORDED: a DISTANCE, the lie and the time, never a position -
//     events/<code>/ldGps/h<N>/marks/<playerId> =
//         { kind: 'ld', yds, lie, lieBy: 'gps' | 'organizer', accYd, at, name, group, by: 'gps' }
// gps_longdrive_test.js (the guard) proves no written value holds a latitude or a longitude.
//
// THE EXISTING KP FLOW DECIDES THE MONEY, UNCHANGED. The longest counting drive wins and is
// written by index.html's own saveKpLeader(hole, playerId, '', '') + recordKpGroupAnswer - what a
// tap on the golfer's name in the KP block does - so kpLeaders/h<N> + kpWinners/h<N> land in ONE
// update and pool-engine.js pays kpWinners as it always has. Ties: the earlier mark. A winner
// typed by hand (the KP block / question on that hole) stands, as a KP typed with no distance
// does in gps-kp.js. ORGANIZER: "Make winner" / "Back to the GPS result", and "Rough" /
// "Fairway" on any drive; logged at events/<code>/ldGpsLog/<push>.
// MONEY: no engine is touched. pool-engine.js / settlement-engine.js never read ldGps, ldGpsLog
// or moneyPool.longDrive.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : null;
    var M_PER_YD = 0.9144, LINE_YD = 25, MIN_YD = 50, MAX_YD = 450;
    function geo() { return (W && W.HardPanGeo) || (typeof require === 'function' ? require('./gps-geo.js') : null); }
    function list(v) { if (Array.isArray(v)) return v; if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; }); return []; }
    function nums(v) { return list(v).map(Number).filter(function (x) { return isFinite(x) && x > 0; }); }

    // ---- WHICH HOLES (pure) ---------------------------------------------------------------
    function pool(d) { var mp = d && d.moneyPool; return mp && mp.enabled !== false ? mp : null; }
    function ldCfg(d) { var mp = pool(d); return (mp && mp.longDrive) || null; }
    // A Long Drive hole PAYS only when it is also a KP hole with KP money (the KP engine's own rule).
    function ldHoles(d) {
        var mp = pool(d); if (!mp || !mp.longDrive) return [];
        if (d && d.kpCancelled && d.kpCancelled.cancelled === true) return [];
        return nums(mp.longDrive.holes);
    }
    function isLdHole(d, hole) { return ldHoles(d).indexOf(Number(hole)) > -1; }
    function pays(d, hole) {
        var mp = pool(d); if (!mp || !mp.kp || !(Number(mp.kp.amount) > 0)) return false;
        return isLdHole(d, hole) && nums(mp.kp.holes).indexOf(Number(hole)) > -1;
    }
    function allowRough(d) { var c = ldCfg(d); return !!(c && c.allowRough === true); }

    // ---- THE MEASURE (pure) ---------------------------------------------------------------
    function driveYards(tee, ball) { var g = geo(); return Math.round(g.haversineMeters(tee, ball) / M_PER_YD); }
    // rings: OSM fairway polygons ([[lat, lng], ...] each); line: the saved line's points or null.
    function lieOf(ball, rings, line) {
        var g = geo(), rs = list(rings).filter(function (r) { return r && r.length >= 3; });
        var ln = Array.isArray(line) && line.length >= 2 ? line : null;
        if (!rs.length && !ln) return 'nomap';
        if (rs.some(function (r) { return g.pointInRing(ball, r); })) return 'fairway';
        if (ln && g.alongLine(ball, ln).d <= LINE_YD * M_PER_YD) return 'fairway';
        return 'rough';
    }
    function counts(m, rough) { return !!m && (m.lie === 'fairway' || m.lie === 'nomap' || (m.lie === 'rough' && rough)); }
    // THE RECORD - a distance, the lie, its accuracy, the time, who. No coordinates.
    function ldMark(yds, lie, accM, at, who) {
        return { kind: 'ld', yds: Math.round(Number(yds)), lie: lie, lieBy: 'gps', accYd: Math.round((Number(accM) || 0) / M_PER_YD), at: at,
            name: String((who && who.name) || ''), group: who && who.group != null ? who.group : null, by: 'gps' };
    }

    // ---- WHO HAS THE LONG DRIVE (pure) -----------------------------------------------------
    function rec(d, hole) { return ((d && d.ldGps) || {})['h' + Number(hole)] || {}; }
    function marksOf(d, hole) {
        var m = rec(d, hole).marks || {};
        return Object.keys(m).map(function (pid) { return Object.assign({ pid: String(pid) }, m[pid]); })
            .filter(function (x) { return x && x.at && x.kind === 'ld' && isFinite(x.yds); });
    }
    // Longest counting drive; a tie goes to the earlier mark.
    function longest(marks, rough) {
        var c = marks.filter(function (m) { return counts(m, rough); });
        c.sort(function (a, b) { return b.yds !== a.yds ? b.yds - a.yds : (a.at || 0) - (b.at || 0); });
        return c[0] || null;
    }
    // { best: { pid, yds, src }, leader, blocked: null | 'override' | 'typed' | 'nobody', change, clear }
    function decide(d, hole) {
        var h = Number(hole), r = rec(d, h), leader = ((d && d.kpLeaders) || {})['h' + h] || null;
        var winner = ((d && d.kpWinners) || {})['h' + h];
        var out = { best: null, leader: leader, blocked: null, change: false, clear: false };
        if (r.override && r.override.playerId != null) { out.blocked = 'override'; out.best = { pid: String(r.override.playerId), src: 'organizer' }; return out; }
        if (d && d.kpNoWinner && d.kpNoWinner['h' + h]) { out.blocked = 'nobody'; return out; }
        var win = r.win || null;
        var fromGps = !!(leader && win && String(win.playerId) === String(leader.playerId));
        if ((leader && !fromGps) || (!leader && winner)) { out.blocked = 'typed'; return out; }
        var b = longest(marksOf(d, h), allowRough(d));
        if (!b) { out.clear = fromGps; return out; }
        out.best = { pid: b.pid, yds: Number(b.yds), at: b.at, src: 'gps' };
        out.change = !leader || String(leader.playerId) !== out.best.pid || Number(win && win.yds) !== out.best.yds;
        return out;
    }

    // ---- THE PAGE SIDE --------------------------------------------------------------------
    /* global currentData, currentMode, db, durableWrite, saveKpLeader, recordKpGroupAnswer, canSetKpLeader,
       hasOrganizerAuthority, canReachSetup, playerGroupOf, requireOnlineForMoney */
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
    function local(path, v) {
        var d = data(); if (!d) return;
        var parts = path.split('/'), o = d;
        for (var i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
        if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
    }
    function logEntry(hole, action, pid, prev) {
        var e = { hole: Number(hole), kind: 'ld', action: action, playerId: pid == null ? null : String(pid), prevPlayerId: prev == null ? null : String(prev), at: Date.now(), by: organizer() ? 'organizer' : 'group' };
        var k = null; try { k = db.ref('events/' + code() + '/ldGpsLog').push().key; } catch (x) { k = null; }
        return { key: k || ('l' + e.at + Math.floor(Math.random() * 1e4)), entry: e };
    }
    function logsFor(hole) {
        var L = (data() || {}).ldGpsLog || {};
        return Object.keys(L).map(function (k) { return L[k]; }).filter(function (e) { return e && Number(e.hole) === Number(hole); })
            .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    }
    // THE WINNER INTO THE EXISTING KP FLOW: index.html's saveKpLeader + recordKpGroupAnswer when this
    // link may write for the golfer; else (the organizer) the same two keys, the same shape and the
    // same queue key in ONE update. best = null clears a GPS winner whose drive no longer counts.
    function feed(hole, best, why) {
        var h = Number(hole), d = data() || {}, prev = ((d.kpLeaders || {})['h' + h] || {}).playerId;
        if (!best) {
            if (!organizer() && !(prev != null && mayWriteFor(prev))) return null;
            var lc = logEntry(h, why || 'auto', null, prev), uc = {};
            uc['kpLeaders/h' + h] = null; uc['kpWinners/h' + h] = null; uc['ldGps/h' + h + '/win'] = null; uc['ldGpsLog/' + lc.key] = lc.entry;
            local('kpLeaders/h' + h, null); local('kpWinners/h' + h, null); local('ldGps/h' + h + '/win', null); local('ldGpsLog/' + lc.key, lc.entry);
            return write(uc, 'kp:' + code() + ':h' + h);
        }
        var pid = String(best.pid);
        var win = { playerId: pid, at: Date.now() }; if (best.yds != null && isFinite(best.yds)) win.yds = Number(best.yds);
        var lg = logEntry(h, why || 'auto', pid, prev);
        var extra = {}; extra['ldGps/h' + h + '/win'] = win; extra['ldGpsLog/' + lg.key] = lg.entry;
        var leaderRec = { playerId: pid, playerName: nameOf(pid), group: groupOf(pid), distanceInches: null, updatedAt: Date.now() };
        if (mayWriteFor(pid) && typeof saveKpLeader === 'function') {
            var p = saveKpLeader(h, pid, '', '');
            if (!p) return null;
            if (typeof recordKpGroupAnswer === 'function') { try { recordKpGroupAnswer(h, pid); } catch (e) {} }
            local('kpLeaders/h' + h, leaderRec); local('kpWinners/h' + h, pid);
            local('ldGps/h' + h + '/win', win); local('ldGpsLog/' + lg.key, lg.entry);
            write(extra, 'ldgps:' + code() + ':h' + h + ':win');
            return p;
        }
        if (!organizer()) return null;
        var u = {};
        u['kpLeaders/h' + h] = leaderRec;
        u['kpWinners/h' + h] = pid;
        Object.keys(extra).forEach(function (k) { u[k] = extra[k]; });
        local('kpLeaders/h' + h, leaderRec); local('kpWinners/h' + h, pid);
        local('ldGps/h' + h + '/win', win); local('ldGpsLog/' + lg.key, lg.entry);
        return write(u, 'kp:' + code() + ':h' + h);
    }
    function settle(hole) {
        var d = data(); if (!d) return null;
        var v = decide(d, hole);
        if (v.change && v.best) feed(hole, v.best, 'auto');
        else if (v.clear) feed(hole, null, 'auto');
        return v;
    }
    function override(hole, pid) {
        if (!organizer()) return false;
        var h = Number(hole), m = marksOf(data(), h).filter(function (x) { return x.pid === String(pid); })[0];
        var ov = { playerId: String(pid), at: Date.now() };
        var u = {}; u['ldGps/h' + h + '/override'] = ov; local('ldGps/h' + h + '/override', ov);
        write(u, 'ldgps:' + code() + ':h' + h + ':ov');
        feed(h, { pid: String(pid), yds: m ? Number(m.yds) : null }, 'override');
        st.note = 'Organizer: ' + nameOf(pid) + ' has the Long Drive';
        return true;
    }
    function clearOverride(hole) {
        if (!organizer()) return false;
        var h = Number(hole), lg = logEntry(h, 'override-off', null, (rec(data(), h).override || {}).playerId);
        var u = {}; u['ldGps/h' + h + '/override'] = null; u['ldGps/h' + h + '/win'] = null; u['ldGpsLog/' + lg.key] = lg.entry;
        local('ldGps/h' + h + '/override', null); local('ldGps/h' + h + '/win', null); local('ldGpsLog/' + lg.key, lg.entry);
        write(u, 'ldgps:' + code() + ':h' + h + ':ov');
        var v = decide(Object.assign({}, data(), { kpLeaders: {}, kpWinners: {} }), h);
        feed(h, v.best || null, 'auto');
        st.note = '';
        return true;
    }
    // The organizer calls a drive rough / fairway (logged) - then the winner is decided again.
    function setLie(hole, pid, lie) {
        if (!organizer() || (lie !== 'rough' && lie !== 'fairway')) return false;
        var h = Number(hole), m = marksOf(data(), h).filter(function (x) { return x.pid === String(pid); })[0];
        if (!m) return false;
        var lg = logEntry(h, 'lie-' + lie, pid, null), u = {};
        u['ldGps/h' + h + '/marks/' + pid + '/lie'] = lie; u['ldGps/h' + h + '/marks/' + pid + '/lieBy'] = 'organizer'; u['ldGpsLog/' + lg.key] = lg.entry;
        local('ldGps/h' + h + '/marks/' + pid + '/lie', lie); local('ldGps/h' + h + '/marks/' + pid + '/lieBy', 'organizer'); local('ldGpsLog/' + lg.key, lg.entry);
        write(u, 'ldgps:' + code() + ':h' + h + ':' + pid + ':lie');
        settle(h);
        return true;
    }
    // "Rough counts" - the organizer's toggle (a Weekly Game setting: online only, as its Save).
    function setAllowRough(on) {
        if (!organizer() || !ldCfg(data())) return false;
        if (typeof requireOnlineForMoney === 'function' && !requireOnlineForMoney('NOT SAVED', 'Reconnect before changing the Long Drive.')) return false;
        var v = !!on;
        local('moneyPool/longDrive/allowRough', v);
        db.ref('events/' + code() + '/moneyPool/longDrive').update({ allowRough: v });
        ldHoles(data()).forEach(function (h) { settle(h); });
        return true;
    }

    // ---- THE BUTTON (HardPanMark) -----------------------------------------------------------
    var st = { note: '' };
    function golfer(c) {
        var g = c && c.golfer; if (!g || g.id == null) return null;
        return { id: String(g.id), name: (g.player && g.player.name) || nameOf(g.id), group: groupOf(g.id) };
    }
    // pos = { pt, acc, at }: measured here and dropped - only the yards and the lie leave this function.
    function measure(pos, c) {
        var g = golfer(c);
        if (!g) return { error: 'Pick your golfer first' };
        if (!c.tee) return { error: 'No tee mapped for this hole - the drive can’t be measured' };
        var yds = driveYards(c.tee, pos.pt);
        if (yds < MIN_YD) return { error: 'You’re ' + yds + ' yds from the tee - walk to your ball, then mark' };
        if (yds > MAX_YD) return { error: 'That’s ' + yds + ' yds from the tee - are you on hole ' + Number(c.hole) + '?' };
        var lie = lieOf(pos.pt, c.fairway, c.savedLine);
        return { yds: yds, ft: null, extra: { lie: lie, accM: pos.acc, golfer: g } };
    }
    function lieWord(m, rough) {
        if (m.lie === 'fairway') return 'fairway';
        if (m.lie === 'rough') return rough ? 'rough (counts)' : 'rough - doesn’t count';
        return 'no fairway map';
    }
    function onMark(res, c) {
        var h = Number(c.hole), g = res.extra.golfer;
        var mark = ldMark(res.yds, res.extra.lie, res.extra.accM, Date.now(), g);
        var u = {}; u['ldGps/h' + h + '/marks/' + g.id] = mark;
        local('ldGps/h' + h + '/marks/' + g.id, mark);
        write(u, 'ldgps:' + code() + ':h' + h + ':' + g.id);
        settle(h);
        st.note = g.name + ': ' + mark.yds + ' yds · ' + lieWord(mark, allowRough(data())) + ' · ' + clock(mark.at);
    }
    function sheet(c) {
        var d = data() || {}, h = Number(c.hole), v = decide(d, h), org = organizer(), rough = allowRough(d);
        var marks = marksOf(d, h).sort(function (a, b) { return b.yds - a.yds; });
        var leader = (d.kpLeaders || {})['h' + h];
        var html = '<div class="mk-head"><b>Hole ' + esc(h) + ' · Long Drive</b><button type="button" class="mk-x" data-mark="close" aria-label="Close">✕</button></div>';
        if (st.note) html += '<div class="mk-note">' + esc(st.note) + '</div>';
        var now = leader ? esc(leader.playerName || nameOf(leader.playerId)) : '';
        var winYds = (rec(d, h).win || {}).yds;
        if (v.blocked === 'override') html += '<div class="mk-now">Long Drive: <b>' + esc(nameOf(v.best.pid)) + '</b> - set by the organizer</div>';
        else if (v.blocked === 'nobody') html += '<div class="mk-now">The organizer recorded that nobody won it.</div>';
        else if (v.blocked === 'typed') html += '<div class="mk-now">Long Drive: <b>' + now + '</b> - recorded by hand. The organizer can change it.</div>';
        else if (leader) html += '<div class="mk-now">Long Drive: <b>' + now + '</b>' + (winYds != null ? ' · ' + esc(winYds) + ' yds' : '') + '</div>';
        else html += '<div class="mk-now">No Long Drive yet.</div>';
        if (!pays(d, h)) html += '<div class="mk-note">No KP money on this hole yet - the organizer sets it in Weekly Game.</div>';
        marks.forEach(function (m) {
            var lead = leader && String(leader.playerId) === m.pid, off = !counts(m, rough);
            var acts = '';
            if (org) {
                if (!lead && !off) acts += '<button type="button" data-mark="win" data-pid="' + esc(m.pid) + '">Make winner</button>';
                acts += m.lie === 'rough' ? '<button type="button" data-mark="fairway" data-pid="' + esc(m.pid) + '">Fairway</button>'
                    : '<button type="button" data-mark="rough" data-pid="' + esc(m.pid) + '">Rough</button>';
                acts = '<span class="a">' + acts + '</span>';
            }
            html += '<div class="mk-row' + (off ? ' off' : '') + '"><span class="n">' + esc(m.name || nameOf(m.pid)) + '</span><span class="d">' + esc(m.yds) + ' yds <small>±' + esc(m.accYd) + ' yds · ' + esc(clock(m.at)) + '</small>'
                + ' <i class="mk-tag' + (m.lie === 'fairway' ? '' : ' warn') + '">' + esc(lieWord(m, rough)) + (m.lieBy === 'organizer' ? ' · organizer' : '') + '</i>'
                + (lead ? ' <i class="mk-tag">Long Drive</i>' : '') + '</span>' + acts + '</div>';
        });
        if (!marks.length) html += '<div class="mk-row off">No drives marked on this hole yet.</div>';
        var logs = logsFor(h).filter(function (e) { return e.action !== 'auto'; });
        if (logs.length) html += '<div class="mk-log">' + logs.slice(-3).map(function (e) {
            var what = e.action === 'override' ? 'made ' + esc(nameOf(e.playerId)) + ' the Long Drive' + (e.prevPlayerId ? ' (was ' + esc(nameOf(e.prevPlayerId)) + ')' : '')
                : e.action === 'lie-rough' ? 'called ' + esc(nameOf(e.playerId)) + '’s drive rough'
                : e.action === 'lie-fairway' ? 'called ' + esc(nameOf(e.playerId)) + '’s drive fairway' : 'went back to the GPS result';
            return '<div>' + esc(clock(e.at)) + ' · Organizer ' + what + '</div>';
        }).join('') + '</div>';
        if (org && v.blocked === 'override') html += '<button type="button" class="mk-wide" data-mark="auto">Back to the GPS result</button>';
        if (org) html += '<button type="button" class="mk-wide" data-mark="allow-rough">Rough counts: ' + (rough ? 'ON - tap to turn off' : 'OFF - tap to turn on') + '</button>';
        else html += '<div class="mk-foot">Fairway only' + (rough ? ' - the organizer lets rough count' : '') + '.</div>';
        html += '<div class="mk-foot">Distances only - no position leaves this phone.</div>';
        return html;
    }
    function onAction(a, el, c) {
        var h = Number(c.hole), pid = el.getAttribute('data-pid');
        if (a === 'win') override(h, pid);
        else if (a === 'auto') clearOverride(h);
        else if (a === 'rough' || a === 'fairway') setLie(h, pid, a);
        else if (a === 'allow-rough') setAllowRough(!allowRough(data()));
    }
    var spec = {
        id: 'ld', listName: 'Long Drive results',
        when: function (c) { return isLdHole(data(), c.hole); },
        label: function () { return '🏌️ Mark my drive'; },
        canMark: function (c) { var g = golfer(c); if (!g) return 'Pick your golfer first'; if (!mayWriteFor(g.id)) return 'Only a golfer in your group can be marked from this phone'; return null; },
        measure: measure, onMark: onMark, sheet: sheet, onAction: onAction,
        count: function (c) { return marksOf(data(), c.hole).length || null; },
        onHole: function () { st.note = ''; }
    };
    function register() { if (W && W.HardPanMark && typeof W.HardPanMark.button === 'function') { W.HardPanMark.button(spec); return true; } return false; }
    if (W && !register()) { var tries = 0, t = setInterval(function () { if (register() || ++tries > 40) clearInterval(t); }, 250); }

    // For index.html's KP block / question on a Long Drive hole: the words, and the winning yards.
    function holeWord(d, hole) { return isLdHole(d, hole) ? 'Long Drive' : null; }
    function leaderYards(d, hole) { var w = rec(d, hole).win, l = ((d && d.kpLeaders) || {})['h' + Number(hole)]; return w && l && String(w.playerId) === String(l.playerId) && w.yds != null ? Number(w.yds) : null; }

    // THE CARD'S KP BLOCK AND THE "leaving the hole" QUESTION on a Long Drive hole say "Long Drive",
    // not "Closest to the Pin", and show the winning yards, not "Distance not recorded". Done HERE (a
    // GPS file) after index.html draws them, so index.html itself is unchanged (the Consumer build
    // must stay the pre-GPS page - gps_flag_test.js / gps_wiring_test.js).
    function relabel(root) {
        if (!root || typeof document === 'undefined') return;
        var d = data(); if (!d) return;
        var head = root.querySelector('.kp-head, .kpf-head'); if (!head) return;
        var m = /Hole (\d+)/.exec(head.textContent || ''); if (!m || !isLdHole(d, m[1])) return;
        var yd = leaderYards(d, m[1]);
        var walker = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */), n;
        while ((n = walker.nextNode())) {
            var t = n.nodeValue, v = t.replace(/Closest to the Pin/g, 'Long Drive').replace(/Current KP:/g, 'Current Long Drive:').replace(/Change KP/g, 'Change Long Drive').replace(/\bthe KP\b/g, 'the Long Drive').replace(/No KP yet/g, 'No Long Drive yet');
            if (yd != null) v = v.replace(/Distance not recorded/g, yd + ' yds');
            if (v !== t) n.nodeValue = v;
        }
        if (yd != null) Array.prototype.forEach.call(root.querySelectorAll('.kp-dist-none'), function (e) { e.style.display = 'none'; });
    }
    function wrapAfter(name, after) {
        try {
            var f = W[name];
            if (typeof f !== 'function' || f.__ld) return typeof f === 'function';
            var g = function () { var r = f.apply(this, arguments); try { after(); } catch (e) {} return r; };
            g.__ld = true; W[name] = g;
            return true;
        } catch (e) { return false; }
    }
    function patchKpWords() {
        var a = wrapAfter('renderKpEntryMount', function () { relabel(document.getElementById('kp-entry-mount')); });
        var b = wrapAfter('renderKpForcedModal', function () { relabel(document.getElementById('kp-force-body')); });
        return a && b;
    }
    if (W && typeof document !== 'undefined') {
        var pk = 0, pt = setInterval(function () { if (patchKpWords() || ++pk > 80) clearInterval(pt); }, 250);
    }

    var api = {
        ldHoles: ldHoles, isLdHole: isLdHole, pays: pays, allowRough: allowRough, driveYards: driveYards, lieOf: lieOf, counts: counts,
        ldMark: ldMark, marksOf: marksOf, longest: longest, decide: decide, holeWord: holeWord, leaderYards: leaderYards,
        LINE_YD: LINE_YD, MIN_YD: MIN_YD, MAX_YD: MAX_YD,
        settle: settle, override: override, clearOverride: clearOverride, setLie: setLie, setAllowRough: setAllowRough, spec: spec,
        state: function () { return { note: st.note }; }
    };
    if (W) W.HardPanGpsLd = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
