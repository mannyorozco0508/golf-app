// ============================================================================
// 088-3 (080): "📷 Scan the scorecard" ON THE PARS / ADD A COURSE SCREENS
//
// A photo of a BLANK printed card -> the scan server's course mode -> a check
// grid (Hole | Par | Men's HCP | Ladies' HCP | each tee's yards). Amber marks a
// failed check (course-card-validate.js, the SAME file the server uses):
//   par 3-6 · each HCP 1..N once · total par 60-75 (27-38 for 9) · the printed
//   OUT / IN / TOTAL (par, and each tee's yards).
// Save ("Use these") stays off until no hard amber is left. "Use these" only
// FILLS the screen's own typed boxes (the 071b pars sheet in simple-flow.js, or
// Round Setup's Add a course grid in admin.html); the golfer then saves through
// the SAME button as typed pars, so the round gets exactly what typing gives.
//
// On this phone only (localStorage hardpan_course_card_scan_v1, keyed by course):
// the Ladies' HCP (only when it checks out) and the tee yardages - the yards
// ONLY when the course has no tees yet, and never a rating or slope.
// The SHARED course list: publishShared() writes NOTHING unless gps-config
// features.courseScanShare === true (OFF, DECISIONS Oct 26).
//
// The camera opens only from the golfer's tap. Sent: the photo, the course name,
// the hole count - no location, no names, no scores (gps-scan-client.js).
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : globalThis;
    var D = W.document;
    var STORE = 'hardpan_course_card_scan_v1';
    var LEFT = 'hardpan_course_scans_left_v1';
    var AMBER = 'background:#fde68a;border:2px solid #d97706;color:#7c2d12;';

    // Its own look (the simple flow's sf- styles are scoped to #sf; this sheet and the Add a course button
    // sit outside it), the same colors: lime = the main action, dark green outline = the second one.
    var CSS = '.hcs-entry .hcs-cta,#hcs-sheet .hcs-cta{display:block;width:100%;min-height:52px;border:0;border-radius:16px;background:#d4f27c;color:#10392d;font-size:18px;font-weight:800;font-family:inherit;cursor:pointer}'
        + '#hcs-sheet .hcs-cta[disabled]{opacity:.45;cursor:default}'
        + '#hcs-sheet .hcs-btn{min-height:44px;padding:6px 14px;border-radius:12px;border:1px solid #0f4c3a;background:#fff;color:#0f4c3a;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer}'
        + '#hcs-sheet .hcs-link{border:0;background:none;color:#0f4c3a;font-weight:800;font-size:13px;padding:8px 0;cursor:pointer;font-family:inherit}'
        + '.hcs-entry .hcs-note,#hcs-sheet .hcs-note{font-size:13px;color:#667;line-height:1.4}'
        + '#hcs-sheet .hcs-err{color:#b42318;font-weight:700;font-size:14px;margin:6px 0}'
        + '#hcs-sheet{color:#13241d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}';
    function styleOnce() {
        if (!D || D.getElementById('hcs-style')) return;
        var st0 = D.createElement('style'); st0.id = 'hcs-style'; st0.textContent = CSS; (D.head || D.documentElement).appendChild(st0);
    }
    function C() { return W.HardPanScanClient; }
    function V() { return W.CourseCardValidate; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function lsGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, v); } catch (e) {} }
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
    function num(v) { var s = String(v == null ? '' : v).trim(); return /^[0-9]+$/.test(s) ? parseInt(s, 10) : null; }
    function fmt(n) { return n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function uid() { try { var u = W.firebase && W.firebase.auth && W.firebase.auth().currentUser; return (u && u.uid) || ''; } catch (e) { return ''; } }
    function limit() { return (V() && V().COURSE_SCAN_FREE_LIMIT) || 3; }

    // The button shows where the scan can run: the app's document camera (the score scan's own rule),
    // or a test / Simulator capture stub. Never on the web.
    function available() {
        try { return !!(C() && V() && (C().nativeCameraHere() || W.__hpScanCaptureStub)); } catch (e) { return false; }
    }

    // ---- "N of 3 free course scans left" ------------------------------------------------
    function leftKnown() {
        var raw = lsGet(LEFT), o = null;
        try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
        if (!o || o.uid !== uid()) return null;
        return o;
    }
    function noteLeft(n, paid) { lsSet(LEFT, JSON.stringify({ uid: uid(), left: typeof n === 'number' ? n : null, paid: !!paid })); }
    function leftLine() {
        var k = leftKnown(), L = limit();
        if (k && k.paid) return '';
        if (k && typeof k.left === 'number') return k.left > 0 ? k.left + ' of ' + L + ' free course scans left' : 'You’ve used your ' + L + ' free course scans';
        return L + ' of ' + L + ' free course scans left';
    }
    function buttonHtml(where) {
        if (!available()) return '';
        styleOnce();
        var line = leftLine();
        return '<div class="hcs-entry" data-hcs-where="' + esc(where || '') + '" style="margin:6px 0 12px;">'
            + '<button type="button" class="hcs-cta" data-hcs="scan" id="hcs-scan-' + esc(where || 'x') + '" style="width:100%;min-height:52px;font-weight:800;">📷 Scan the scorecard</button>'
            + '<div class="hcs-note" style="text-align:center;font-size:13px;margin-top:6px;">One photo of the printed card fills the pars and indexes. You check them before anything saves. Or type them below.</div>'
            + (line ? '<div class="hcs-note hcs-left" id="hcs-left-' + esc(where || 'x') + '" style="text-align:center;font-size:12px;margin-top:2px;">' + esc(line) + '</div>' : '')
            + '</div>';
    }

    // ---- THE CHECK GRID STATE -----------------------------------------------------------
    var st = null;
    function rows(n, a) { var out = []; for (var i = 0; i < n; i++) out.push(a && isInt(a[i]) ? a[i] : null); return out; }
    function stateFrom(card, holes, opts) {
        var n = holes === 9 ? 9 : 18;
        var w = function (x) { x = x || {}; return { out: isInt(x.out) ? x.out : null, 'in': isInt(x['in']) ? x['in'] : null, total: isInt(x.total) ? x.total : null }; };
        var ladies = (card.hcp_ladies || []).some(function (x) { return x !== null && x !== undefined; });
        return {
            n: n, name: opts.name || card.course_name || '', onUse: opts.onUse,
            par: rows(n, card.par), parW: w(card.par_written),
            men: rows(n, card.hcp_men), ladies: ladies ? rows(n, card.hcp_ladies) : null,
            tees: (card.tees || []).map(function (t) { return { name: String(t.name || '').slice(0, 40), yards: rows(n, t.yards), w: w(t.written) }; }),
            unsure: (card.unsure || []).map(function (u) { return u.row + ':' + u.hole; }),
            touched: {}, phase: 'grid'
        };
    }
    function asParsed(s) {
        return { ok: true, value: {
            course_name: s.name || null, holes: s.n, par: s.par, par_written: s.parW,
            hcp_men: s.men, hcp_ladies: s.ladies || [],
            tees: s.tees.map(function (t) { return { name: t.name, yards: t.yards, written: t.w }; }),
            unsure: s.unsure.filter(function (k) { return !s.touched[k]; }).map(function (k) { var i = k.lastIndexOf(':'); return { row: k.slice(0, i), hole: Number(k.slice(i + 1)) }; }),
            notes: '' } };
    }
    function check(s) { return V().validateCourse(asParsed(s), { holes: s.n }); }

    // amber cells + the plain-words list, from the validator's codes
    function permIssues(row, n) {
        var where = {}, bad = {}, out = [];
        row.forEach(function (v, i) { if (!isInt(v) || v < 1 || v > n) bad[i] = 1; else (where[v] = where[v] || []).push(i + 1); });
        Object.keys(where).forEach(function (v) { if (where[v].length > 1) { where[v].forEach(function (h) { bad[h - 1] = 1; }); out.push('index ' + v + ' is on holes ' + where[v].join(' and ')); } });
        var missing = []; for (var k = 1; k <= n; k++) if (!where[k]) missing.push(k);
        if (missing.length) out.push('index ' + missing.join(', ') + (missing.length === 1 ? ' is' : ' are') + ' missing');
        Object.keys(bad).forEach(function (i) { if (!isInt(row[i]) || row[i] < 1 || row[i] > n) out.unshift('hole ' + (Number(i) + 1) + ' needs an index from 1 to ' + n); });
        return { bad: bad, words: out };
    }
    function sumOf(a, from, to) { var s = 0; for (var i = from; i < to; i++) { if (!isInt(a[i])) return null; s += a[i]; } return s; }
    function marks(s, v) {
        var cell = {}, words = [], hard = 0;
        var put = function (k, isHard) { if (!cell[k]) { cell[k] = isHard ? 'hard' : 'soft'; } else if (isHard) cell[k] = 'hard'; };
        var nineName = { out: 'OUT', 'in': 'IN', total: 'TOTAL' };
        var nineSum = function (a, nine) { return nine === 'out' ? (s.n === 18 ? sumOf(a, 0, 9) : sumOf(a, 0, s.n)) : nine === 'in' ? sumOf(a, 9, 18) : sumOf(a, 0, s.n); };
        var seen = {};
        v.hard.forEach(function (h) {
            if (h.code === 'par_range') { put('par:' + h.hole, true); words.push('Hole ' + h.hole + ': a par of 3, 4, 5 or 6' + (s.par[h.hole - 1] != null ? ' (read as ' + s.par[h.hole - 1] + ')' : '')); }
            else if (h.code === 'par_total') { put('par:sum', true); var tp = sumOf(s.par, 0, s.n); words.push((tp == null ? 'Total par' : 'Total par ' + tp) + ': a course is par ' + (s.n === 9 ? '27–38' : '60–75')); }
            else if (h.code === 'par_written') { put('parW:' + h.nine, true); words.push('Par ' + nineName[h.nine] + ' adds to ' + fmt(nineSum(s.par, h.nine)) + ' but the card says ' + fmt(s.parW[h.nine])); }
            else if (h.code === 'hcp_men' || h.code === 'hcp_ladies') {
                if (seen[h.code]) return; seen[h.code] = 1;
                var row = h.code === 'hcp_men' ? s.men : s.ladies, p = permIssues(row || [], s.n);
                Object.keys(p.bad).forEach(function (i) { put(h.code + ':' + (Number(i) + 1), true); });
                words.push((h.code === 'hcp_men' ? 'Men’s HCP' : 'Ladies’ HCP') + ': ' + (p.words.join(' — ') || 'each index 1–' + s.n + ' once'));
            }
            else if (h.code === 'tee_written') { var ti = teeIndex(s, h.row); put('teeW:' + ti + ':' + h.nine, true); words.push(h.row + ' ' + nineName[h.nine] + ' adds to ' + fmt(nineSum(s.tees[ti] ? s.tees[ti].yards : [], h.nine)) + ' yds but the card says ' + fmt(s.tees[ti] ? s.tees[ti].w[h.nine] : null)); }
            else if (h.code === 'hole_count') { put('rows', true); words.push(h.row === 'tees' ? 'No tee rows were read' : 'The ' + h.row + ' row is not ' + s.n + ' holes — scan again or type them'); }
            else { put('rows', true); words.push('The card could not be read — scan again or type them'); }
        });
        hard = Object.keys(cell).filter(function (k) { return cell[k] === 'hard'; }).length;
        v.soft.forEach(function (x) {
            if (x.code === 'yards_range') put('tee:' + teeIndex(s, x.row) + ':' + x.hole, false);
            else if (x.code === 'unsure') {
                var r = x.row === 'par' ? 'par' : x.row === 'hcp_men' ? 'hcp_men' : x.row === 'hcp_ladies' ? 'hcp_ladies' : 'tee:' + teeIndex(s, x.row);
                put(r + ':' + x.hole, false);
            }
        });
        var soft = Object.keys(cell).filter(function (k) { return cell[k] === 'soft'; }).length;
        return { cell: cell, words: words, hard: hard, soft: soft };
    }
    function teeIndex(s, name) { for (var i = 0; i < s.tees.length; i++) if (s.tees[i].name === name) return i; return -1; }

    // ---- RENDER ---------------------------------------------------------------------------
    function inp(key, val, cls, wide) {
        var mk = st.m.cell[key];
        return '<input type="tel" inputmode="numeric" data-hcs-cell="' + esc(key) + '" value="' + esc(val == null ? '' : val) + '" aria-label="' + esc(key) + '"'
            + ' style="width:' + (wide ? 50 : 38) + 'px;height:34px;text-align:center;font:inherit;font-size:15px;border-radius:7px;padding:0;margin:0;'
            + (mk ? AMBER : 'border:1px solid #d6dbd8;background:#fff;color:#0b1a12;') + '"' + (mk ? ' data-hcs-amber="' + mk + '"' : '') + '>';
    }
    function sumCell(a, from, to, key) {
        var v = sumOf(a, from, to), mk = key && st.m.cell[key];
        return '<td style="font-weight:800;padding:4px 2px;' + (mk ? 'color:#b45309;' : '') + '"' + (mk ? ' data-hcs-amber="' + mk + '"' : '') + '>' + (v == null ? '–' : fmt(v)) + '</td>';
    }
    function gridHtml() {
        var s = st, n = s.n, td = 'padding:3px 2px;border-bottom:1px solid #eef0ef;';
        var head = '<tr style="font-size:11px;font-weight:800;letter-spacing:.04em;color:#4b5b53;text-transform:uppercase;"><th style="padding:4px 2px;text-align:left;">Hole</th><th>Par</th><th>HCP</th>'
            + (s.ladies ? '<th>Ladies<br>HCP</th>' : '') + s.tees.map(function (t) { return '<th>' + esc(t.name) + '</th>'; }).join('') + '</tr>';
        var body = '';
        var holeRow = function (h) {
            return '<tr><td style="' + td + 'font-weight:800;text-align:left;">' + h + '</td>'
                + '<td style="' + td + '">' + inp('par:' + h, s.par[h - 1]) + '</td>'
                + '<td style="' + td + '">' + inp('hcp_men:' + h, s.men[h - 1]) + '</td>'
                + (s.ladies ? '<td style="' + td + '">' + inp('hcp_ladies:' + h, s.ladies[h - 1]) + '</td>' : '')
                + s.tees.map(function (t, ti) { return '<td style="' + td + '">' + inp('tee:' + ti + ':' + h, t.yards[h - 1], '', true) + '</td>'; }).join('') + '</tr>';
        };
        var nineRows = function (label, nine, from, to) {
            var blank = '<td></td>' + (s.ladies ? '<td></td>' : '');
            var sums = '<tr style="background:#f4f6f5;"><td style="padding:4px 2px;font-weight:800;text-align:left;">' + label + '</td>' + sumCell(s.par, from, to, nine === 'total' ? 'par:sum' : '') + blank
                + s.tees.map(function (t) { return sumCell(t.yards, from, to); }).join('') + '</tr>';
            var card = '<tr><td style="padding:2px;font-size:11px;color:#4b5b53;text-align:left;">Card ' + label + '</td><td>' + inp('parW:' + nine, s.parW[nine]) + '</td>' + blank
                + s.tees.map(function (t, ti) { return '<td>' + inp('teeW:' + ti + ':' + nine, t.w[nine], '', true) + '</td>'; }).join('') + '</tr>';
            return sums + card;
        };
        for (var h = 1; h <= Math.min(9, n); h++) body += holeRow(h);
        body += nineRows('OUT', 'out', 0, Math.min(9, n));
        if (n === 18) {
            for (h = 10; h <= 18; h++) body += holeRow(h);
            body += nineRows('IN', 'in', 9, 18);
        }
        body += nineRows('TOT', 'total', 0, n);
        return '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;"><table id="hcs-grid" style="border-collapse:collapse;text-align:center;font-size:14px;min-width:100%;">' + head + body + '</table></div>';
    }
    function sheet(inner) {
        return '<div class="hcs-card" style="width:100%;max-width:560px;max-height:90vh;overflow:auto;margin:0 8px calc(env(safe-area-inset-bottom) + 10px);padding:16px;background:#fff;border-radius:16px;box-sizing:border-box;" role="dialog" aria-labelledby="hcs-t">' + inner + '</div>';
    }
    function render() {
        styleOnce();
        var host = D.getElementById('hcs-sheet');
        if (!st) { if (host) host.remove(); return; }
        if (!host) {
            host = D.createElement('div');
            host.id = 'hcs-sheet';
            host.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(10,20,15,.45);display:flex;align-items:flex-end;justify-content:center;font-family:inherit;';
            host.addEventListener('click', onClick);
            host.addEventListener('input', onInput);
            D.body.appendChild(host);
        }
        var nm = esc(String(st.name || 'this course').split(' (')[0]);
        if (st.phase === 'busy') {
            host.innerHTML = sheet('<div id="hcs-t" style="font-size:18px;font-weight:800;margin-bottom:6px;">Reading the card…</div><div class="hcs-note" id="hcs-busy">⏳ This takes a few seconds. Nothing is saved yet.</div>');
            return;
        }
        if (st.phase === 'error') {
            host.innerHTML = sheet('<div id="hcs-t" style="font-size:18px;font-weight:800;margin-bottom:6px;">Couldn’t scan the card</div>'
                + '<div class="hcs-err" id="hcs-err" style="margin-bottom:10px;">' + esc(st.msg) + '</div>'
                + (st.code === 'needs_pass' || st.code === 'not_configured' ? '' : '<button type="button" class="hcs-cta" data-hcs="again" style="width:100%;">Scan again</button>')
                + '<button type="button" class="hcs-btn" data-hcs="type" style="width:100%;min-height:46px;margin-top:8px;">Type them instead</button>');
            return;
        }
        st.v = check(st); st.m = marks(st, st.v);
        var list = st.m.words.length ? '<div id="hcs-amber" style="' + AMBER + 'border-radius:10px;padding:10px 12px;margin:10px 0;font-weight:700;font-size:14px;line-height:1.4;">'
            + st.m.hard + ' box' + (st.m.hard === 1 ? '' : 'es') + ' to check:<br>' + st.m.words.map(function (w) { return '• ' + esc(w); }).join('<br>') + '</div>' : '';
        var soft = !st.m.words.length && st.m.soft ? '<div class="hcs-note" id="hcs-soft" style="margin:8px 0;">Amber boxes were hard to read — give them a look.</div>' : '';
        var ok = st.m.hard === 0;
        var ladiesNote = st.ladies && !st.v.saveLadies ? '<button type="button" class="hcs-link" data-hcs="dropladies" style="font-size:13px;padding:0;min-height:0;">Don’t keep the Ladies’ HCP</button>' : '';
        host.innerHTML = sheet('<div id="hcs-t" style="font-size:18px;font-weight:800;line-height:1.3;">Check the card — ' + nm + '</div>'
            + '<div class="hcs-note" style="margin:4px 0 6px;">Read from your photo. Tap any box to change it. Nothing is saved yet.</div>'
            + list + soft + gridHtml() + ladiesNote
            + '<button type="button" class="hcs-cta" data-hcs="use" id="hcs-use" style="width:100%;margin-top:12px;' + (ok ? '' : 'opacity:.45;') + '"' + (ok ? '' : ' disabled') + '>'
            + (ok ? 'Use these pars and indexes' : 'Fix the ' + st.m.hard + ' amber box' + (st.m.hard === 1 ? '' : 'es') + ' to use them') + '</button>'
            + '<div style="display:flex;gap:8px;margin-top:8px;"><button type="button" class="hcs-btn" data-hcs="again" style="flex:1;min-height:46px;">Scan again</button>'
            + '<button type="button" class="hcs-btn" data-hcs="type" style="flex:1;min-height:46px;">Type them instead</button></div>');
    }
    function setCell(key, raw) {
        var v = num(raw), p = key.split(':');
        st.touched[key.replace(/^tee:(\d+):/, function (m0, ti) { return (st.tees[ti] ? st.tees[ti].name : '') + ':'; })] = 1;
        if (p[0] === 'par') st.par[p[1] - 1] = v;
        else if (p[0] === 'hcp_men') st.men[p[1] - 1] = v;
        else if (p[0] === 'hcp_ladies' && st.ladies) st.ladies[p[1] - 1] = v;
        else if (p[0] === 'tee' && st.tees[p[1]]) st.tees[p[1]].yards[p[2] - 1] = v;
        else if (p[0] === 'parW') st.parW[p[1]] = v;
        else if (p[0] === 'teeW' && st.tees[p[1]]) st.tees[p[1]].w[p[2]] = v;
        st.touched[key] = 1;
    }
    function onInput(ev) {
        var t = ev.target, k = t && t.getAttribute && t.getAttribute('data-hcs-cell');
        if (!k || !st) return;
        setCell(k, t.value);
        // keep the focus and caret: repaint after the golfer's keystroke, then put them back in the same box
        var pos = t.selectionStart;
        render();
        var again = D.querySelector('[data-hcs-cell="' + k + '"]');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
    }
    function onClick(ev) {
        var b = ev.target && ev.target.closest && ev.target.closest('[data-hcs]');
        if (!b || !st) return;
        var a = b.getAttribute('data-hcs');
        if (a === 'type') { close(); return; }
        if (a === 'again') { var o = st.opts; start(o); return; }
        if (a === 'dropladies') { st.ladies = null; render(); return; }
        if (a === 'use') { use(); return; }
    }
    function close() { st = null; render(); }

    // The checked card, in the shape the screens fill from.
    function cardOut(s) {
        var v = check(s);
        if (v.hard.length) return null;
        return {
            holes: s.n,
            par: s.par.slice(),
            hcpMen: s.men.slice(),
            hcpLadies: s.ladies && v.saveLadies ? s.ladies.slice() : null,
            tees: s.tees.filter(function (t) { return t.name && t.yards.every(isInt); }).map(function (t) { return { name: t.name, yards: t.yards.slice() }; })
        };
    }
    function use() {
        var out = cardOut(st);
        if (!out) { render(); return; }
        var cb = st.onUse;
        try { (W.__hcsUsed = W.__hcsUsed || []).push(out); } catch (e) {}
        close();
        if (typeof cb === 'function') cb(out);
    }

    // ---- THE TAP: camera -> server -> the grid ------------------------------------------
    // opts: { name, holes (9|18), onUse(card), where }
    function start(opts) {
        var o = opts || {};
        if (!available()) return Promise.resolve(null);
        var cl = C();
        st = { opts: o, name: o.name, phase: 'busy', onUse: o.onUse };
        return Promise.resolve().then(function () { return cl.capture(); }).then(function (shot) {
            if (!shot || shot.cancelled || !shot.image) { close(); return null; }
            render();
            return cl.requestCourse(shot.image, { name: o.name || '', holes: o.holes === 9 ? 9 : 18 }).then(function (r) {
                if (!st) return r;
                if (!r.ok) {
                    if (r.code === 'needs_pass') noteLeft(0, false);
                    else if (typeof r.courseScansLeft === 'number') noteLeft(r.courseScansLeft, false);
                    st.phase = 'error'; st.code = r.code; st.msg = r.message; render(); refreshLeft(); return r;
                }
                noteLeft(r.courseScansLeft, r.paid);
                var keepOpts = st.opts;
                st = stateFrom(r.card, o.holes === 9 ? 9 : (r.card.holes === 9 ? 9 : 18), { name: o.name, onUse: o.onUse });
                st.opts = keepOpts;
                render(); refreshLeft();
                return r;
            });
        }, function (e) {
            st = { opts: o, name: o.name, phase: 'error', code: (e && e.code) || 'no_camera', msg: cl.courseMessageFor((e && e.code) === 'bad_image' ? 'bad_image' : 'no_camera') };
            render();
            return null;
        });
    }
    function refreshLeft() {
        var els = D.querySelectorAll('.hcs-left'), line = leftLine();
        for (var i = 0; i < els.length; i++) els[i].textContent = line;
    }

    // ---- ON THIS PHONE: Ladies' HCP + tee yards (yards only when the course has no tees) --------
    function hasTees(rec) {
        var t = rec && rec.tees;
        if (!t || typeof t !== 'object') return false;
        return Object.keys(t).some(function (g) { return Array.isArray(t[g]) ? t[g].length > 0 : !!t[g]; });
    }
    // Never a rating or a slope: name, total yards, per-hole yards, source.
    function teesRecord(tees) {
        return { male: (tees || []).map(function (t) {
            return { name: t.name, totalYards: t.yards.reduce(function (a, b) { return a + b; }, 0), holes: t.yards.map(function (y) { return { yardage: y }; }), source: 'scan' };
        }) };
    }
    function readStore() { try { return JSON.parse(lsGet(STORE) || '{}') || {}; } catch (e) { return {}; } }
    function keepOnPhone(key, name, card, rec) {
        if (!key || !card) return null;
        var all = readStore(), prev = all[key] || {};
        var entry = { name: String(name || prev.name || '').slice(0, 120), at: Date.now() };
        if (card.hcpLadies) entry.hcpLadies = card.hcpLadies.slice();
        else if (prev.hcpLadies) entry.hcpLadies = prev.hcpLadies;
        if (prev.tees) entry.tees = prev.tees;   // a course that got its tees once keeps them
        else if (!hasTees(rec) && card.tees && card.tees.length) entry.tees = teesRecord(card.tees);
        all[key] = entry;
        lsSet(STORE, JSON.stringify(all));
        return entry;
    }
    function kept(key) { return readStore()[key] || null; }

    // ---- THE SHARED COURSE LIST: behind features.courseScanShare (OFF) --------------------------
    function shareOn() { try { return ((W.HARDPAN_GPS_CONFIG || {}).features || {}).courseScanShare === true; } catch (e) { return false; } }
    // db: a firebase database; rec: the record as read. OFF -> nothing at all is read or written.
    function publishShared(db, key, name, card, rec) {
        if (!shareOn()) return Promise.resolve({ skipped: 'off' });
        if (!db || !key || !card || /^gca_/.test(key) || card.holes !== 18) return Promise.resolve({ skipped: 'not_eligible' });
        var data = card.par.map(function (p, i) { return { hole: i + 1, par: p, hcpIndex: card.hcpMen[i] }; });
        var up = { name: String(name || '').slice(0, 120), data: data };
        if (!hasTees(rec) && card.tees && card.tees.length) up.tees = teesRecord(card.tees);
        // .update(), never .set(): a child it does not name is never touched (course_publish_merge_test.js)
        return Promise.resolve(db.ref('global_courses/' + key).update(up)).then(function () { return { published: Object.keys(up) }; });
    }

    // ---- ROUND SETUP'S ADD A COURSE GRID (admin.html #custom-course-container, the 064 path) ---------
    // "Use these" fills the 18 Par / HCP boxes (c-par-N / c-hcp-N) and runs the page's own total; the
    // golfer saves with the wizard's normal button - the same validateCourseGrid() and round save as typing.
    function fillAdmin(card) {
        if (!card || card.holes !== 18) return false;
        for (var i = 1; i <= 18; i++) {
            var p = D.getElementById('c-par-' + i), h = D.getElementById('c-hcp-' + i);
            if (!p || !h) return false;
            p.value = String(card.par[i - 1]); h.value = String(card.hcpMen[i - 1]);
        }
        try { if (typeof W.updateCustomCoursePars === 'function') W.updateCustomCoursePars(); } catch (e) {}
        var nm = (D.getElementById('course-search-input') || {}).value || '';
        var key = 'name:' + String(nm).trim().toLowerCase();
        var rec = null;
        try { var sel = (D.getElementById('course-select') || {}).value; if (sel && typeof globalCourses !== 'undefined' && globalCourses) rec = globalCourses[sel] || null; } catch (e) {}   /* global globalCourses */
        try { keepOnPhone((D.getElementById('course-select') || {}).value || key, nm, card, rec); } catch (e) {}
        var note = D.getElementById('hcs-admin-filled');
        if (note) note.textContent = '\u2713 Filled from your scan \u2014 check them, then save as usual.';
        return true;
    }
    function mountAdmin() {
        var slot = D && D.getElementById('hcs-admin-slot');
        if (!slot || slot.getAttribute('data-hcs-mounted') || !available()) return;
        slot.setAttribute('data-hcs-mounted', '1');
        slot.innerHTML = buttonHtml('addcourse') + '<div id="hcs-admin-filled" style="font-size:0.78rem;font-weight:700;color:var(--brand-green);margin:0 0 8px;"></div>';
        slot.addEventListener('click', function (ev) {
            if (!(ev.target && ev.target.closest && ev.target.closest('[data-hcs="scan"]'))) return;
            var nm = (D.getElementById('course-search-input') || {}).value || '';
            start({ name: nm, holes: 18, where: 'addcourse', onUse: fillAdmin });
        });
    }
    if (D) { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', mountAdmin); else mountAdmin(); }

    var api = { available: available, mountAdmin: mountAdmin, fillAdmin: fillAdmin, buttonHtml: buttonHtml, start: start, close: close, leftLine: leftLine,
        keepOnPhone: keepOnPhone, kept: kept, teesRecord: teesRecord, hasTees: hasTees, publishShared: publishShared, shareOn: shareOn,
        // read-only views for checks
        state: function () { return st ? { phase: st.phase, hard: st.m ? st.m.hard : null, soft: st.m ? st.m.soft : null, words: st.m ? st.m.words.slice() : null, code: st.code || null } : null; },
        STORE: STORE, LEFT: LEFT };
    W.HardPanCourseScan = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
