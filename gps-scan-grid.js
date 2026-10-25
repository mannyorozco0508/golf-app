// ============================================================================
// SCORECARD SCAN - THE CONFIRM / EDIT GRID (URGENT-066 feature 2, the app part)
//
//   window.HardPanScan.open(roundCode)   tips -> the camera -> "Reading the card..."
//                                        -> this grid (or a plain-words refusal)
//   window.HardPanScan.show(roundCode, response, image)
//                                        the grid for a result already in hand
//                                        (the Simulator has no document camera; tests)
//
// Players x holes, OUT / IN / TOTAL worked out live next to what the card says.
// Amber = a cell to check, red = a nine that does not add up to the card's figure
// (window.ScorecardValidate.validateScan - the SAME function the server runs,
// scorecard-validate.js). Tap a cell -> a number pad; "Next to check" walks the
// amber ones. A row whose name was not recognised gets "Who is this?".
//
// NOTHING IS WRITTEN until "Use these scores". Then every score goes through the
// card's own saveScore(playerId, hole, value) (index.html) - the same call a typed
// box makes: the permission gate, the offline queue, the audit entry and the
// "Saved" line, so Skins / Nassau / presses / the Receipt settle exactly as if the
// numbers were typed. No other write, no money logic. A box that already has a
// different score is listed first and replaced only on "Replace them"; a blank
// cell from the scan never erases a score; a golfer this phone may not score for
// is left alone (said so).
//
// It mounts nowhere by itself: the Scan button comes through customize-screen's
// feature registry (feature-registry.js, merged in phone3) - off until the golfer
// turns it on in Tools > Customize. HardPanScan.open() from code still works.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var ID = 'hp-scan';
    var st = null;   // { code, ctx, rows, holes, image, validation, pad, busy }
    var fx = null;   // the feature registry's ctx (customize-screen feature-registry.js) when mounted through it

    // ---- the round on this page (index.html globals) ----------------------------------
    function pageRound() { try { return typeof currentData !== 'undefined' ? currentData : null; } catch (e) { return null; } }   /* global currentData */
    function pageCode() { try { return typeof currentMode !== 'undefined' ? String(currentMode || '') : ''; } catch (e) { return ''; } }   /* global currentMode */
    function canWrite(pid) { try { return typeof canWritePlayer === 'function' ? !!canWritePlayer(pid) : true; } catch (e) { return false; } }   /* global canWritePlayer */
    function V() { return W.ScorecardValidate || null; }
    function C() { return W.HardPanScanClient || null; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

    // ---- the sheet ---------------------------------------------------------------------
    var CSS = '#hp-scan{position:fixed;inset:0;z-index:100000;background:var(--bg-main,#f0f4f2);color:var(--text-main,#14261c);display:flex;flex-direction:column;font:16px/1.35 -apple-system,system-ui,sans-serif;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}'
        + '#hp-scan .hs-top{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,.08)}'
        + '#hp-scan .hs-title{font-weight:700;font-size:18px;flex:1}'
        + '#hp-scan .hs-x{min-width:44px;min-height:44px;border:0;background:none;font-size:16px;color:inherit}'
        + '#hp-scan .hs-body{flex:1;overflow:auto;padding:12px 16px}'
        + '#hp-scan .hs-msg{margin:8px 0;padding:12px;border-radius:10px;background:var(--bg-card,#fff)}'
        + '#hp-scan .hs-tips{margin:8px 0 16px;padding-left:20px}'
        + '#hp-scan .hs-btn{display:block;width:100%;min-height:48px;margin:8px 0;border-radius:12px;border:0;font:600 16px system-ui;background:#1f6f43;color:#fff}'
        + '#hp-scan .hs-btn.hs-2{background:var(--bg-card,#fff);color:inherit;border:1px solid rgba(0,0,0,.15)}'
        + '#hp-scan .hs-thumb{display:block;max-width:100%;max-height:120px;border-radius:8px;margin:0 auto 8px}'
        + '#hp-scan .hs-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px;background:var(--bg-card,#fff)}'
        + '#hp-scan table{border-collapse:collapse;font-size:15px}'
        + '#hp-scan th,#hp-scan td{border:1px solid rgba(0,0,0,.08);text-align:center;padding:0}'
        + '#hp-scan th{font-size:12px;font-weight:600;padding:4px 2px;color:#55665c}'
        + '#hp-scan .hs-name{position:sticky;left:0;z-index:1;background:var(--bg-card,#fff);text-align:left;padding:4px 6px;min-width:84px;max-width:110px;font-size:13px}'
        + '#hp-scan .hs-name select{max-width:104px;font-size:13px}'
        + '#hp-scan .hs-c{min-width:40px;min-height:44px;width:40px;height:44px;border:0;background:none;font:600 17px system-ui;color:inherit}'
        + '#hp-scan .hs-c.hs-sus{background:#ffe2a8}#hp-scan .hs-c.hs-ed{text-decoration:underline}#hp-scan .hs-c.hs-cur{outline:3px solid #1f6f43;outline-offset:-3px}'
        + '#hp-scan .hs-sum{min-width:46px;font-weight:700;font-size:15px;padding:2px}#hp-scan .hs-sum small{display:block;font-weight:400;font-size:11px;color:#55665c}'
        + '#hp-scan .hs-sum.hs-bad{background:#f7c4c0;color:#8a1c12}'
        + '#hp-scan .hs-key{font-size:13px;color:#55665c;margin:6px 0}'
        + '#hp-scan .hs-pad{position:fixed;left:0;right:0;bottom:0;background:var(--bg-card,#fff);box-shadow:0 -4px 16px rgba(0,0,0,.2);padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,1fr);gap:8px;z-index:2}'
        + '#hp-scan .hs-pad .hs-ph{grid-column:1/-1;font-weight:600}'
        + '#hp-scan .hs-pad button{min-height:48px;border-radius:10px;border:1px solid rgba(0,0,0,.15);background:var(--bg-main,#f0f4f2);font:600 18px system-ui;color:inherit}'
        + '#hp-scan .hs-pad button.hs-on{background:#1f6f43;color:#fff}'
        + '#hp-scan .hs-foot{padding:8px 16px;border-top:1px solid rgba(0,0,0,.08);background:var(--bg-main,#f0f4f2)}'
        + '#hp-scan .hs-row2{display:flex;gap:8px}#hp-scan .hs-row2 .hs-btn{flex:1}'
        + '#hp-scan .hs-diff{margin:6px 0 10px;padding-left:20px}';

    function sheet() {
        var el = document.getElementById(ID);
        if (el) return el;
        if (!document.getElementById(ID + '-css')) { var s = document.createElement('style'); s.id = ID + '-css'; s.textContent = CSS; document.head.appendChild(s); }
        el = document.createElement('div');
        el.id = ID; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Scan scorecard');
        el.addEventListener('click', onClick);
        el.addEventListener('change', onChange);
        document.body.appendChild(el);
        return el;
    }
    function paint(title, body, foot) {
        var el = sheet();
        el.innerHTML = '<div class="hs-top"><div class="hs-title">' + esc(title) + '</div><button class="hs-x" data-hs="cancel" aria-label="Close">Cancel</button></div>'
            + '<div class="hs-body">' + body + '</div>' + (foot ? '<div class="hs-foot">' + foot + '</div>' : '');
    }
    function close() { var el = document.getElementById(ID); if (el) el.remove(); st = null; }
    function say(msg, again) {
        paint('Scan scorecard', '<div class="hs-msg" data-hs-msg>' + esc(msg) + '</div>',
            (again ? '<button class="hs-btn" data-hs="shoot">Try again</button>' : '') + '<button class="hs-btn hs-2" data-hs="cancel">Close</button>');
    }

    // ---- OPEN: tips -> camera -> server -> grid ----------------------------------------------
    function open(roundCode, featureCtx) {
        fx = featureCtx || null;   // HardPanScan.open(code) from code = no registry
        var code = String(roundCode || '').toUpperCase();
        var round = pageRound();
        if (!code || code !== pageCode().toUpperCase() || !round || !Array.isArray(round.players) || !round.players.length) {
            st = null; say('Open the round first, then scan its scorecard.'); return false;
        }
        st = { code: code, ctx: C() ? C().roundContext(round) : null };
        paint('Scan scorecard', '<div class="hs-msg">Take one photo of the paper card. You check every number before anything is saved.</div>'
            + '<ul class="hs-tips"><li>Lay the card flat</li><li>Get the whole card in the frame</li><li>Avoid shadows and glare</li></ul>',
            '<button class="hs-btn" data-hs="shoot">Scan the card</button><button class="hs-btn hs-2" data-hs="cancel">Cancel</button>');
        return true;
    }
    function shoot() {
        if (!st || !C()) return;
        // phone3: the scan server is not switched on for the app yet - say so before the camera opens.
        if (typeof C().serverOffHere === 'function' && C().serverOffHere()) { say(C().messageFor('not_configured'), false); return; }
        var s = st;
        C().capture().then(function (shot) {
            if (st !== s) return;
            if (!shot || shot.cancelled || !shot.image) { open(s.code); return; }
            s.image = shot.image;
            paint('Scan scorecard', '<div class="hs-msg" data-hs-msg>Reading the card…</div>');
            return C().request(shot.image, s.ctx).then(function (res) {
                if (st !== s) return;
                // One of the free scans used, on the phone too (the server counts its own): only a
                // read that came back, and only for a host without a pass.
                if (res.ok && !res.paid && fx && typeof fx.useOne === 'function') { try { fx.useOne('scan'); } catch (e) {} }
                if (!res.ok) { say(res.message, ['not_configured', 'needs_pass', 'monthly_cap', 'daily_limit', 'sign_in'].indexOf(res.code) === -1); return; }
                show(s.code, res, shot.image);
            });
        }).catch(function (e) {
            if (st !== s) return;
            say(C().messageFor(e && e.code === 'bad_image' ? 'bad_image' : 'no_camera'), true);
        });
    }

    // ---- THE GRID ------------------------------------------------------------------------
    // response: { scan: { players, notes }, validation? } (the server's), image: base64 JPEG (optional).
    function show(roundCode, response, image) {
        var round = pageRound();
        var code = String(roundCode || '').toUpperCase();
        if (!round || code !== pageCode().toUpperCase()) { say('Open the round first, then scan its scorecard.'); return false; }
        if (!V()) { say(C() ? C().messageFor('server') : 'Something went wrong reading the card.'); return false; }
        var ctx = C() ? C().roundContext(round) : {};
        var scan = response && (response.scan || response.result || response);
        var parsed = V().parseModelOutput(scan);
        if (!parsed.ok) { say(C() ? C().messageFor('unreadable') : 'We couldn’t read that card.', true); return false; }
        var val = V().validateScan(parsed, ctx);
        // The grid's own copy: one entry per scan row, its assigned golfer and its numbers.
        var rows = parsed.value.players.map(function (p, i) {
            var vr = val.rows[i] || {};
            var cells = {};
            val.holes.forEach(function (h) { var c = (vr.cells || {})[h] || {}; cells[h] = { score: isInt(c.score) ? c.score : null, confidence: c.confidence || 0, edited: false }; });
            return { label: p.row_label_as_written || p.name, player: vr.index >= 0 ? vr.index : -1, cells: cells,
                written: { out: p.written_out, 'in': p.written_in, total: p.written_total } };
        });
        st = { code: code, ctx: ctx, rows: rows, holes: val.holes, image: image || (st && st.image) || null, round: round, pad: null };
        revalidate();
        render();
        return true;
    }
    // What the grid shows NOW, as the model's shape, through the shared validator.
    // An edited (or confirmed) cell counts as sure: the golfer typed it.
    function asParsed() {
        var known = st.ctx.players || [];
        return { ok: true, value: { notes: '', players: st.rows.map(function (r) {
            return { name: r.player >= 0 && known[r.player] ? known[r.player].name : 'UNKNOWN:' + r.label, row_label_as_written: r.label,
                holes: st.holes.map(function (h) { var c = r.cells[h]; return { hole: h, score: c.score, confidence: c.edited ? 1 : c.confidence }; }),
                written_out: r.written.out, written_in: r.written['in'], written_total: r.written.total };
        }) } };
    }
    function revalidate() { st.v = V().validateScan(asParsed(), st.ctx); return st.v; }
    function suspectList() {
        var out = [];
        st.v.rows.forEach(function (vr, ri) { st.holes.forEach(function (h) { if (vr.cells[h] && vr.cells[h].suspect) out.push({ row: ri, hole: h }); }); });
        return out;
    }
    function sumCell(vr, key, label) {
        var nine = key === 'out' ? vr.nines.front : key === 'in' ? vr.nines.back : null;
        var bad = nine === 'mismatch' || (key === 'total' && vr.written.total !== null && vr.sums.total !== vr.written.total && !vr.totalWrittenWrong);
        var wr = vr.written[key];
        return '<td class="hs-sum' + (bad ? ' hs-bad' : '') + '" data-hs-sum="' + key + '">' + (vr.sums[key] == null ? '' : vr.sums[key])
            + (wr !== null && wr !== undefined ? '<small>card ' + esc(wr) + '</small>' : '') + '</td>';
    }
    function render() {
        var v = st.v, known = st.ctx.players || [], players = (st.round.players || []);
        var front = st.holes.filter(function (h) { return h <= 9; }), back = st.holes.filter(function (h) { return h >= 10; });
        var head = '<tr><th class="hs-name">Hole</th>' + front.map(function (h) { return '<th>' + h + '</th>'; }).join('') + (front.length ? '<th>OUT</th>' : '')
            + back.map(function (h) { return '<th>' + h + '</th>'; }).join('') + (back.length ? '<th>IN</th>' : '') + '<th>TOT</th></tr>';
        var parRow = '<tr><th class="hs-name">Par</th>' + front.map(function (h) { return '<th>' + esc(st.ctx.par[h - 1] == null ? '' : st.ctx.par[h - 1]) + '</th>'; }).join('') + (front.length ? '<th></th>' : '')
            + back.map(function (h) { return '<th>' + esc(st.ctx.par[h - 1] == null ? '' : st.ctx.par[h - 1]) + '</th>'; }).join('') + (back.length ? '<th></th>' : '') + '<th></th></tr>';
        var body = st.rows.map(function (r, ri) {
            var vr = v.rows[ri];
            var opts = '<option value="-1"' + (r.player < 0 ? ' selected' : '') + '>Who is this?</option>' + known.map(function (p, pi) { return '<option value="' + pi + '"' + (pi === r.player ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
            var name = r.player >= 0 && vr.match !== 'duplicate' && vr.match !== 'none'
                ? esc(known[r.player].name) + (r.label && r.label.toLowerCase() !== known[r.player].name.toLowerCase() ? '<br><small>card: ' + esc(r.label) + '</small>' : '')
                  + '<br><select data-hs-who="' + ri + '" aria-label="Change golfer">' + opts + '</select>'
                : '<small>card: ' + esc(r.label) + '</small><br><select data-hs-who="' + ri + '" aria-label="Who is this?">' + opts + '</select>';
            var locked = r.player >= 0 && players[r.player] && !canWrite(players[r.player].id);
            var cell = function (h) {
                var c = r.cells[h], vc = vr.cells[h] || {};
                var cur = st.pad && st.pad.row === ri && st.pad.hole === h;
                return '<td><button class="hs-c' + (vc.suspect ? ' hs-sus' : '') + (c.edited ? ' hs-ed' : '') + (cur ? ' hs-cur' : '') + '" data-hs-cell="' + ri + ':' + h + '"'
                    + ' aria-label="' + esc((r.player >= 0 ? known[r.player].name : r.label) + ' hole ' + h + ': ' + (c.score == null ? 'blank' : c.score) + (vc.suspect ? ', check this' : '')) + '">'
                    + (c.score == null ? '–' : c.score) + '</button></td>';
            };
            return '<tr data-hs-row="' + ri + '"><td class="hs-name">' + name + (locked ? '<br><small>not your group - skipped</small>' : '') + '</td>'
                + front.map(cell).join('') + (front.length ? sumCell(vr, 'out') : '') + back.map(cell).join('') + (back.length ? sumCell(vr, 'in') : '') + sumCell(vr, 'total') + '</tr>';
        }).join('');
        var n = suspectList().length;
        var missing = v.missingPlayers.length ? '<div class="hs-msg">Not found on the card: ' + esc(v.missingPlayers.join(', ')) + '. Their scores stay as they are.</div>' : '';
        var html = (st.image ? '<img class="hs-thumb" alt="Your scorecard photo" src="data:image/jpeg;base64,' + st.image + '">' : '')
            + '<div class="hs-key" data-hs-count="' + n + '">' + (n ? n + ' to check - tap a number to fix it, or tap it again if it’s right. Amber = check, red total = doesn’t match the card.' : 'Everything adds up. Check it over, then use these scores.') + '</div>'
            + missing + '<div class="hs-wrap"><table><thead>' + head + parRow + '</thead><tbody>' + body + '</tbody></table></div>'
            + (st.pad ? padHtml() : '');
        var foot = '<div class="hs-row2">' + (n ? '<button class="hs-btn hs-2" data-hs="next">Next to check</button>' : '') + '<button class="hs-btn" data-hs="use">Use these scores</button></div>'
            + '<div class="hs-row2"><button class="hs-btn hs-2" data-hs="shoot">Retake</button><button class="hs-btn hs-2" data-hs="cancel">Cancel</button></div>';
        var keep = document.querySelector('#' + ID + ' .hs-wrap'), sx = keep ? keep.scrollLeft : 0;
        paint('Check the scores', html, foot);
        var w = document.querySelector('#' + ID + ' .hs-wrap'); if (w) w.scrollLeft = sx;
    }
    function padHtml() {
        var r = st.rows[st.pad.row], c = r.cells[st.pad.hole], known = st.ctx.players || [];
        var nm = r.player >= 0 ? known[r.player].name : r.label;
        var keys = '';
        for (var k = 1; k <= 12; k++) keys += '<button data-hs-key="' + k + '"' + (c.score === k ? ' class="hs-on"' : '') + '>' + k + '</button>';
        return '<div class="hs-pad" data-hs-pad><div class="hs-ph">' + esc(nm) + ' - hole ' + st.pad.hole + '</div>' + keys
            + '<button data-hs-key="clear">Blank</button><button data-hs-key="done" style="grid-column:span 3">Done</button></div>';
    }
    function setCell(ri, hole, score) {
        var c = st.rows[ri].cells[hole];
        c.score = score; c.edited = true;
        revalidate();
    }
    function nextSuspect() {
        var list = suspectList();
        if (!list.length) { st.pad = null; render(); return; }
        var at = st.pad ? list.findIndex(function (s) { return s.row > st.pad.row || (s.row === st.pad.row && s.hole > st.pad.hole); }) : 0;
        var s = list[at < 0 ? 0 : at];
        st.pad = { row: s.row, hole: s.hole };
        render();
        var b = document.querySelector('#' + ID + ' [data-hs-cell="' + s.row + ':' + s.hole + '"]'); if (b && b.scrollIntoView) try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
    }

    // ---- USE THESE SCORES ---------------------------------------------------------------
    // The plan, before anything is written: what goes in, what would replace a different
    // score, what is skipped and why.
    function plan() {
        var players = st.round.players || [], scores = st.round.scores || {};
        var used = {}, dup = false, unassigned = 0;
        st.rows.forEach(function (r) { if (r.player < 0) unassigned++; else if (used[r.player]) dup = true; else used[r.player] = true; });
        var writes = [], replace = [], locked = [];
        st.rows.forEach(function (r) {
            if (r.player < 0) return;
            var p = players[r.player];
            if (!p) return;
            if (!canWrite(p.id)) { if (locked.indexOf(p.name) === -1) locked.push(p.name); return; }
            st.holes.forEach(function (h) {
                var v = r.cells[h].score;
                if (!isInt(v) || v < 1) return;               // a blank never erases a score
                var k = 'p' + p.id + '_h' + h, old = scores[k];
                var oldN = old === undefined || old === null || old === '' ? null : Number(old);
                if (oldN === v) return;                      // already on the card
                var w = { playerId: p.id, name: p.name, hole: h, value: v, old: oldN };
                writes.push(w);
                if (oldN !== null) replace.push(w);
            });
        });
        return { writes: writes, replace: replace, locked: locked, dup: dup, unassigned: unassigned };
    }
    function use(mode) {
        var p = plan();
        if (p.dup) { flash('Two rows are set to the same golfer. Pick who each row is.'); return; }
        if (p.unassigned && mode !== 'skip-unknown') {
            confirmPanel(p.unassigned === 1 ? 'One row isn’t matched to a golfer. Pick who it is, or leave it out.' : p.unassigned + ' rows aren’t matched to a golfer. Pick who they are, or leave them out.',
                '<button class="hs-btn hs-2" data-hs="back">Pick the golfer</button><button class="hs-btn hs-2" data-hs="use-skip-unknown">Leave them out</button>');
            return;
        }
        var n = suspectList().filter(function (s) { return st.rows[s.row].player >= 0; }).length;
        if (n && mode !== 'anyway' && mode !== 'replace' && mode !== 'keep') {
            confirmPanel(n === 1 ? 'One number is still marked to check.' : n + ' numbers are still marked to check.',
                '<button class="hs-btn hs-2" data-hs="next">Check them</button><button class="hs-btn" data-hs="use-anyway">Use them anyway</button>');
            return;
        }
        if (p.replace.length && mode !== 'replace' && mode !== 'keep') {
            confirmPanel('These boxes already have a different score:<ul class="hs-diff">' + p.replace.map(function (w) { return '<li>' + esc(w.name) + ', hole ' + w.hole + ': ' + w.old + ' → card ' + w.value + '</li>'; }).join('') + '</ul>',
                '<button class="hs-btn" data-hs="use-replace">Replace them</button><button class="hs-btn hs-2" data-hs="use-keep">Keep what’s there</button><button class="hs-btn hs-2" data-hs="back">Back</button>');
            return;
        }
        var list = mode === 'keep' ? p.writes.filter(function (w) { return w.old === null; }) : p.writes;
        write(list, p.locked);
    }
    // THE HAND-OFF. Through the feature registry (customize-screen): ctx.proposeScores opens the
    // NORMAL score sheet pre-filled, and the golfer's save there is the card's own save
    // (host.saveScore -> gpsSheetHole(n).save -> saveScore -> the offline queue), ONE confirm for the
    // whole card. Without the registry (HardPanScan.open from code): the card's own saveScore, once
    // per box, exactly as a typed box.
    // Either way this file never writes a score or touches the database itself.
    function write(list, locked) {
        var note = locked.length ? ' Not saved for ' + locked.join(', ') + ' (another group scores for them).' : '';
        if (!list.length) {
            st = null;
            paint('Scan scorecard', '<div class="hs-msg" data-hs-msg data-hs-saved="0">' + esc('Nothing new to save - the card already has these scores.' + note) + '</div>', '<button class="hs-btn" data-hs="cancel">Done</button>');
            return;
        }
        if (fx && typeof fx.proposeScores === 'function') {
            var props = list.map(function (w) { return { pid: w.playerId, hole: w.hole, strokes: w.value }; });
            var f = fx;
            close();
            f.proposeScores(props, { source: 'scan' });
            if (note && typeof f.toast === 'function') { try { f.toast(note.trim()); } catch (e) {} }
            return;
        }
        if (typeof W.saveScore !== 'function') { flash('Open the round\u2019s card first.'); return; }
        var done = 0;
        list.forEach(function (w) { W.saveScore(w.playerId, w.hole, String(w.value)); done++; });
        var msg = (done === 1 ? '1 score saved to the card.' : done + ' scores saved to the card.') + note;
        st = null;
        paint('Scan scorecard', '<div class="hs-msg" data-hs-msg data-hs-saved="' + done + '">' + esc(msg) + '</div>', '<button class="hs-btn" data-hs="cancel">Done</button>');
    }
    function confirmPanel(html, buttons) {
        var foot = document.querySelector('#' + ID + ' .hs-foot');
        if (!foot) return;
        foot.innerHTML = '<div class="hs-msg" data-hs-confirm>' + html + '</div>' + buttons;
    }
    function flash(msg) { confirmPanel(esc(msg), '<button class="hs-btn hs-2" data-hs="back">OK</button>'); }

    // ---- taps ------------------------------------------------------------------------------
    function onClick(e) {
        var t = e.target.closest ? e.target.closest('[data-hs],[data-hs-cell],[data-hs-key]') : null;
        if (!t) return;
        var a = t.getAttribute('data-hs');
        if (a === 'cancel') { close(); return; }
        if (a === 'shoot') { if (!st) return; var code = st.code; st = { code: code, ctx: st.ctx }; shoot(); return; }
        if (!st || !st.rows) return;
        if (a === 'next') { nextSuspect(); return; }
        if (a === 'back') { render(); return; }
        if (a === 'use') { st.pad = null; use(); return; }
        if (a && a.indexOf('use-') === 0) { use(a.slice(4)); return; }
        var cell = t.getAttribute('data-hs-cell');
        if (cell) { var m = cell.split(':'); st.pad = { row: Number(m[0]), hole: Number(m[1]) }; render(); return; }
        var key = t.getAttribute('data-hs-key');
        if (key && st.pad) {
            if (key === 'done') { st.pad = null; render(); return; }
            setCell(st.pad.row, st.pad.hole, key === 'clear' ? null : Number(key));
            if (suspectList().length) nextSuspect(); else { st.pad = null; render(); }
        }
    }
    function onChange(e) {
        var who = e.target.getAttribute && e.target.getAttribute('data-hs-who');
        if (who === null || who === undefined || !st || !st.rows) return;
        st.rows[Number(who)].player = Number(e.target.value);
        revalidate(); render();
    }

    W.HardPanScan = {
        open: function (roundCode, featureCtx) { return open(roundCode, featureCtx); },
        show: show,
        close: close,
        scan: function () { shoot(); },
        // read-only views for checks
        state: function () { return st ? { code: st.code, holes: st.holes && st.holes.slice(), suspects: st.v ? suspectList().length : null, plan: st.rows ? plan() : null } : null; }
    };

    // ---- THE SCAN BUTTON, through customize-screen's feature registry ------------------------
    // (066-1 report, section 1.) Off by default; a host feature with the validator's free scans.
    // Shown only where the native document camera plugin is in the app.
    function pluginHere() { try { return !!(C() && C().nativeCameraHere()); } catch (e) { return false; } }
    function roundCodeOf(ctx) { return String((ctx && ctx.round && ctx.round.code) || pageCode() || ''); }
    (W.HardPanFeatureQueue = W.HardPanFeatureQueue || []).push({
        id: 'scan',
        label: 'Scan scorecard',
        sub: 'Photo of a paper card to scores',
        icon: '\uD83D\uDCF7',
        isNew: true,
        kind: 'button',
        slot: 'dock',
        screens: ['round'],
        defaultOn: false,
        tier: 'host',
        freeUses: V() ? V().SCAN_FREE_LIMIT : 0,
        // phone3 (the real registry): one free use is a 'scan' - "You have 3 free scans", "Try a free scan".
        unit: 'scan',
        available: pluginHere,
        // phone3 (the real registry): unlocked = the host pass only. The registry itself lets a locked
        // extra show while free scans are left (feature-registry.js effective(): shows = on && (!locked
        // || usesLeft > 0)), so the Customize row shows the lock ("Host · 3 free") and its explainer.
        unlocked: function (ctx) { return !!(ctx && ctx.ent && ctx.ent.host); },
        mount: function (el, ctx) {
            var cur = ctx;
            el.innerHTML = '<button type="button" class="hpf-btn" data-hs-mount="scan" aria-label="Scan scorecard"><span>\uD83D\uDCF7</span>Scan</button>';
            el.firstChild.onclick = function () { open(roundCodeOf(cur), cur); };
            return { update: function (c) { cur = c; if (fx) fx = c; }, unmount: function () { el.innerHTML = ''; if (fx === cur) fx = null; } };
        }
    });
})();
