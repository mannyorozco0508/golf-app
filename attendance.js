// ============================================================================
// ATTENDANCE — who is actually playing, before tee time.
//
// One builder for the scorecard (index.html), the setup wizard and Round Ready
// (admin.html), and the Road Trip round list (trip.html). A listed golfer taps
// Confirm or Can't. The organizer reads the count. Nothing here is money, a
// score, or a roster edit.
//
// STORAGE. events/<code>/attendance/<playerId> = { status: 'in'|'out', at }.
// A sibling of the roster, never a field on the player. A round saved before
// this exists has no attendance node and reads as "nobody has answered".
// A key for a golfer who has since been taken off the roster is ignored, so a
// dropped name cannot keep counting.
//
// 'in' is Confirmed. 'out' is Can't make it. Anything else, including a missing
// record, is unanswered. There is no Maybe: a headcount that includes a third
// state is a headcount the organizer still has to chase.
// ============================================================================

function attendancePlayerId(player) {
    const id = String(player && player.id != null ? player.id : '');
    return /^[0-9]+$/.test(id) ? id : null;
}

function attendanceStatusOf(rec) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'open';
    if (rec.status === 'in' || rec.status === 'out') return rec.status;
    return 'open';
}

function attendanceMap(attendance) {
    if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) return {};
    return attendance;
}

// The rows the screen shows, in roster order. Stale ids and nameless rows with
// no id are not rows: they cannot be confirmed and they are not a person.
function summarizeAttendance(players, attendance) {
    const map = attendanceMap(attendance);
    const rows = [];
    (players || []).forEach(function (p) {
        if (!p) return;
        const id = attendancePlayerId(p);
        if (!id) return;
        rows.push({
            id: id,
            name: String(p.name || '').trim(),
            status: attendanceStatusOf(map[id])
        });
    });
    return {
        playing: rows.filter(function (r) { return r.status === 'in'; }).length,
        out: rows.filter(function (r) { return r.status === 'out'; }).length,
        waiting: rows.filter(function (r) { return r.status === 'open'; }).length,
        rows: rows
    };
}

function attendanceStatusWord(status) {
    if (status === 'in') return 'Confirmed';
    if (status === 'out') return "Can't make it";
    return 'No answer yet';
}

// The sentence the organizer reads. Built from the same summary as the rows,
// so the number and the list cannot disagree.
function attendanceCountLine(summary) {
    const s = summary || { playing: 0, out: 0, waiting: 0 };
    const p = s.playing || 0;
    const o = s.out || 0;
    const w = s.waiting || 0;
    if (p === 0 && o === 0) {
        return w === 1 ? "1 hasn't answered" : (w + " haven't answered");
    }
    const bits = [p + ' confirmed'];
    if (o) bits.push(o + " can't make it");
    if (w) bits.push(w === 1 ? "1 hasn't answered" : (w + " haven't answered"));
    return bits.join(' \u00B7 ');
}

function attendanceRecord(status, at) {
    if (status !== 'in' && status !== 'out') return null;
    const n = Number(at);
    if (!isFinite(n) || n <= 0) return null;
    return { status: status, at: n };
}

function attendanceWritePath(eventCode, playerId) {
    const id = String(playerId == null ? '' : playerId);
    if (!/^[0-9]+$/.test(id)) return null;
    const code = String(eventCode || '').trim();
    if (!code) return null;
    return 'events/' + code + '/attendance/' + id;
}

function commitAttendance(db, eventCode, playerId, status, now) {
    const path = attendanceWritePath(eventCode, playerId);
    const rec = attendanceRecord(status, now == null ? Date.now() : now);
    if (!db || typeof db.ref !== 'function' || !path || !rec) {
        return Promise.reject(new Error('bad-attendance'));
    }
    return db.ref(path).set(rec).then(function () { return rec; });
}

function attendanceWriteError(err) {
    const m = String((err && err.message) || err || '');
    if (/PERMISSION_DENIED|permission[ _-]denied/i.test(m)) {
        return "Couldn't save that. Ask the organizer to mark you for now.";
    }
    return "Couldn't save that. Check your signal.";
}

function applyLocalAttendance(data, playerId, record) {
    if (!data || !record) return data;
    if (!data.attendance || typeof data.attendance !== 'object' || Array.isArray(data.attendance)) {
        data.attendance = {};
    }
    data.attendance[String(playerId)] = record;
    return data;
}

function attEscape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function attendanceChoiceButtons(playerId, status) {
    const id = String(playerId == null ? '' : playerId);
    if (!/^[0-9]+$/.test(id)) return '';
    const base = 'margin-left:6px; padding:8px 12px; border-radius:8px; font-weight:bold; font-size:0.82rem; border:1px solid var(--border-mid); background:transparent; color:var(--text-main);';
    const inOn = status === 'in';
    const outOn = status === 'out';
    const inStyle = inOn
        ? 'margin-left:6px; padding:8px 12px; border-radius:8px; font-weight:bold; font-size:0.82rem; border:1px solid var(--brand-green); background:var(--brand-green); color:#F2EDE4;'
        : base;
    const outStyle = outOn
        ? 'margin-left:6px; padding:8px 12px; border-radius:8px; font-weight:bold; font-size:0.82rem; border:1px solid var(--text-muted); background:var(--bg-page); color:var(--text-main);'
        : base;
    return '<button type="button" class="att-confirm' + (inOn ? ' att-on' : '') + '" onclick="confirmAttendance(\'' + id + '\',\'in\')" style="' + inStyle + '">Confirm</button>'
        + '<button type="button" class="att-cant' + (outOn ? ' att-on' : '') + '" onclick="confirmAttendance(\'' + id + '\',\'out\')" style="' + outStyle + '">Can\'t</button>';
}

// The card a golfer sees on the scorecard, and the card the organizer sees on
// setup. Same rows, same count, same buttons.
function attendancePanelHtml(players, attendance, opts) {
    const summary = summarizeAttendance(players, attendance);
    if (!summary.rows.length) return '';
    const o = opts || {};
    const heading = o.heading || "Who's playing";
    const note = o.note || 'Tap your name before tee time.';
    const rows = summary.rows.map(function (r) {
        return '<div class="att-row" data-att-id="' + r.id + '" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-top:1px solid var(--border-light);">'
            + '<div style="flex:1; min-width:0;">'
            + '<div class="att-name" style="font-weight:bold; color:var(--text-main);">' + attEscape(r.name || 'Golfer') + '</div>'
            + '<div class="att-state" style="font-size:0.75rem; color:var(--text-muted);">' + attEscape(attendanceStatusWord(r.status)) + '</div>'
            + '</div>'
            + attendanceChoiceButtons(r.id, r.status)
            + '</div>';
    }).join('');
    return '<div class="att-panel" style="background:var(--bg-card); border:1px solid var(--border-mid); border-radius:12px; padding:12px 14px; margin-bottom:12px; text-align:left;">'
        + '<div class="att-heading" style="font-size:0.72rem; text-transform:uppercase; font-weight:bold; letter-spacing:0.04em; color:var(--text-muted);">' + attEscape(heading) + '</div>'
        + '<div class="att-count" style="font-size:1.05rem; font-weight:800; color:var(--brand-green); margin:4px 0 2px 0;">' + attEscape(attendanceCountLine(summary)) + '</div>'
        + '<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">' + attEscape(note) + '</div>'
        + rows
        + '</div>';
}

// Live child listener. The scorecard already listens to the whole event; setup
// and Round Ready read the round once, so they watch this node on their own.
function watchAttendance(db, eventCode, onValue) {
    if (!db || typeof db.ref !== 'function' || typeof onValue !== 'function') return function () {};
    const code = String(eventCode || '').trim();
    if (!code) return function () {};
    const ref = db.ref('events/' + code + '/attendance');
    if (!ref || typeof ref.on !== 'function') return function () {};
    const handler = function (snap) {
        const val = snap && typeof snap.val === 'function' ? snap.val() : null;
        onValue(attendanceMap(val));
    };
    ref.on('value', handler);
    return function () {
        if (typeof ref.off === 'function') ref.off('value', handler);
    };
}
