// ============================================================================
// HARDPAN GPS - WHAT THE SHOT LOG TEACHES MY BAG (URGENT-049 part 3, 2026-10-21)
//
// Reads the shot log (gps-shot-log.js HardPanShotLog) and the wind math
// (gps-wind-learn.js HardPanWindLearn, 049 part 2) and gives gps-view.js:
//   - learned still-air carry per club (once a club has LEARN_MIN logged shots), merged
//     into My bag's numbers (a number the golfer typed still wins);
//   - the per-club wind line for My bag ("wind: head -1.4 · tail +0.9 · from left -0.6 ·
//     from right -0.3 yd/mph" or "wind: generic · 3 of 8 windy shots");
//   - the Plays-like (i) text ("From your 14 marked 7-iron shots: ..." / "Generic wind
//     model - 5 more windy 7-iron shots to learn yours");
//   - the plays-like number with the golfer's own wind numbers once a club qualifies;
//   - the Shot history sheet (newest first, filters by strength and direction,
//     swipe-to-delete).
// THE ANGLE (Manny 8:44): where the wind comes FROM vs the line ball -> green center:
// 0 head, 90 from the right, 180 tail, 270 from the left. Coefficients are the SIGNED
// change in carry per mph (head negative, tail positive, crosswinds negative).
// Nothing here writes anything but the log on this phone; no position is read or kept.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var LEARN_MIN = 3, QUALIFY = 8, WINDY_MPH = 5;
    var MINUS = '−';
    var NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    function nameOf(c) { var B = W.HardPanGpsBag; return (B && B.NAMES && B.NAMES[c]) || NAMES[c] || String(c); }
    function low(c) { var n = nameOf(c); return /wedge|wood|iron|Hybrid|Driver/.test(n) ? n.replace(/^(Driver|Hybrid|Pitching|Gap|Sand|Lob)/, function (x) { return x.toLowerCase(); }) : n; }
    function toRad(d) { return d * Math.PI / 180; }
    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

    function WL() { return W.HardPanWindLearn && typeof W.HardPanWindLearn.fit === 'function' ? W.HardPanWindLearn : null; }
    function Log() { return W.HardPanShotLog || null; }

    // ---- 070 PART 4: LEARNED CARRIES AT THE GOLFER'S BASELINE ------------------------
    // A shot marked at a 1,200 ft course carried a 1,200 ft distance. My bag's numbers are at the
    // golfer's "My distances are from" baseline, and plays-like takes the altitude out again
    // against it - so each learned carry is brought to the baseline first:
    //   carryAtBaseline = stillAirCarry / altFactor(shot.cft, baselineFt)   (wind out first)
    // A shot with no cft (logged before 070, or the course had no height / only the phone's
    // estimate) is used as marked - "at this course". No baseline ("Don't adjust", or a picked
    // course with no height): every shot as marked, exactly as before. On this phone only.
    function Geo() { return W.HardPanGeo && typeof W.HardPanGeo.altFactor === 'function' ? W.HardPanGeo : null; }
    function baselineFtOf(golfer) {
        var B = W.HardPanGpsBag;
        try { if (B && typeof B.baseline === 'function' && typeof B.baselineFt === 'function') { var b = B.baselineFt(B.baseline(golfer)); return isNum(b) ? b : null; } } catch (e) {}
        return null;
    }
    // The divisor for one shot (1 = as marked).
    function altDivOf(s, baseFt) {
        var G = Geo();
        if (!G || !s || !isNum(s.cft) || !isNum(baseFt)) return 1;
        var f = G.altFactor(s.cft, baseFt);
        return isNum(f) && f > 0 ? f : 1;
    }
    // A carry of shot s, brought to the golfer's baseline.
    function atBaseline(carry, s, golfer) { return isNum(carry) ? carry / altDivOf(s, baselineFtOf(golfer)) : carry; }

    // ---- PER CLUB ------------------------------------------------------------------
    var cache = {};
    // 070 part 4: the baseline height is part of the key (a new baseline = new learned carries).
    function logSig(golfer) { var L = Log(); if (!L) return ''; var a = L.list({ golfer: golfer }); return a.length + ':' + (a[0] ? a[0].id : '') + ':' + L.hand(golfer) + ':' + baselineFtOf(golfer) + ':' + !!Geo(); }
    // { club: fit } for every club with logged shots. Cached until the log changes.
    function fits(golfer) {
        var L = Log(), api = WL(); if (!L || !api) return {};
        var sig = logSig(golfer), k = L.golferKey(golfer);
        if (cache[k] && cache[k].sig === sig) return cache[k].fits;
        var by = L.byClub(golfer), hand = L.hand(golfer), out = {}, baseFt = baselineFtOf(golfer);
        var altDiv = function (s) { return altDivOf(s, baseFt); };
        Object.keys(by).forEach(function (c) { try { out[c] = api.fit(by[c], { hand: hand, altDiv: altDiv }); out[c].club = c; } catch (e) {} });
        cache[k] = { sig: sig, fits: out };
        return out;
    }
    function clubFit(golfer, club) { return fits(golfer)[club] || null; }
    // My bag's numbers with the shot log as the ONE source of marked shots (int-049): for a club
    // with logged shots, n = the log's count (what Shot history lists), never the old bag's shot
    // list as well. The number: a typed one (set) still wins; else the log's still-air carry once
    // the club has LEARN_MIN logged shots (or from the first, when there is no other number);
    // until then the number it had (the setup's carry, or an older one). bag: HardPanGpsBag.bag(golfer).
    function mergeBag(bag, golfer) {
        var out = {}, f = fits(golfer);
        Object.keys(bag || {}).forEach(function (c) { out[c] = bag[c]; });
        Object.keys(f).forEach(function (c) {
            var x = f[c], cur = out[c];
            if (!x || !(x.n > 0)) return;
            if (cur && cur.set) { out[c] = { yd: cur.yd, n: x.n, set: true }; return; }
            if (isNum(x.stillAir) && (x.n >= LEARN_MIN || !cur)) { out[c] = { yd: Math.round(x.stillAir), n: x.n, set: false, log: true, qualified: !!x.qualified }; return; }
            if (cur) { var k = {}; Object.keys(cur).forEach(function (q) { k[q] = cur[q]; }); k.n = x.n; out[c] = k; }
        });
        return out;
    }
    function part(v) { return isNum(v) ? sgn(v) : '\u2014'; }
    function sgn(v) { var r = Math.round(v * 10) / 10; return (r > 0 ? '+' : r < 0 ? MINUS : '') + Math.abs(r).toFixed(1); }
    // My bag's wind line.
    function windLine(f) {
        if (!f) return { text: 'wind: generic · 0 of ' + QUALIFY + ' windy shots', learned: false, need: QUALIFY };
        if (f.qualified) return { text: 'wind: head ' + sgn(f.head) + ' · tail ' + sgn(f.tail) + ' · from left ' + sgn(f.left) + ' · from right ' + sgn(f.right) + ' yd/mph', learned: true, need: 0 };
        return { text: 'wind: generic · ' + Math.min(f.windyN, QUALIFY) + ' of ' + QUALIFY + ' windy shots', learned: false, need: QUALIFY - f.windyN, windyN: f.windyN };
    }
    // Where the wind is from, in words, for a relative angle.
    function dirWords(rel, mph) {
        var L = Log(), d = L ? L.dirOf(rel, mph) : null;
        return d === 'head' ? 'into you' : d === 'tail' ? 'behind you' : d === 'left' ? 'from the left' : d === 'right' ? 'from the right' : 'calm';
    }
    function windWords(mph, rel) {
        // int-049: no reading at the mark - said so, never "calm".
        if (mph === null || mph === undefined || mph === '' || !isFinite(Number(mph))) return 'no wind reading';
        mph = Number(mph) || 0;
        if (mph < 1) return 'calm';
        return Math.round(mph) + ' mph ' + dirWords(rel, mph) + ' (' + Math.round(Number(rel) || 0) % 360 + '°)';
    }
    // THE (i) TEXT for the club the plays-like line names. now: { mph, rel } or null.
    function infoText(golfer, club, now, hand) {
        if (!club) return null;
        var f = clubFit(golfer, club), nm = low(club);
        if (f && f.qualified) {
            var bits = [], gen = [];
            [['head', ' yd per mph of headwind'], ['tail', ' tailwind'], ['left', ' from the left'], ['right', ' from the right']].forEach(function (x) {
                if (isNum(f[x[0]])) bits.push(sgn(f[x[0]]) + x[1]); else gen.push(x[1].replace(' yd per mph of ', '').trim());
            });
            var t = 'From your ' + f.n + ' marked ' + nm + ' shots: ' + bits.join(', ') + '.' + (gen.length ? ' Generic for ' + gen.join(' and ') + ' (too few shots yet).' : '');
            if (now && now.mph >= 1) t += ' Wind now: ' + windWords(now.mph, now.rel) + '.';
            return { learned: true, text: t, n: f.n };
        }
        var have = f ? Math.min(f.windyN, QUALIFY) : 0, need = QUALIFY - have;
        return { learned: false, text: 'Generic wind model — ' + need + ' more windy ' + nm + ' shot' + (need === 1 ? '' : 's') + ' to learn yours',
            sub: have + ' of ' + QUALIFY + ' marked shots in wind over ' + WINDY_MPH + ' mph', have: have, need: need, hand: hand };
    }
    // THE PLAYS-LIKE NUMBER, the golfer's own wind: pl (gps-geo.playsLike's result, generic wind),
    // o: { yards (raw D), mph, fromDeg, bearingDeg, golfer, club }. A qualified club: the generic
    // wind term swapped for theirs (the same clamp as playsLike). Else pl unchanged.
    function adjust(pl, o) {
        if (!pl || !o || !o.club || !isNum(o.yards) || !isNum(o.mph) || !isNum(o.fromDeg) || !isNum(o.bearingDeg)) return pl;
        var f = clubFit(o.golfer, o.club);
        if (!f || !f.qualified) return pl;
        var L = Log(), hand = L ? L.hand(o.golfer) : 'R', api = WL();
        if (!api) return pl;
        var rel = api.relAngle(o.fromDeg, o.bearingDeg);
        var wt = rel == null ? null : api.windTerm(o.yards, o.mph, rel, f, hand), w = wt ? wt.yards : null;
        if (!isNum(w)) return pl;
        var terms = {}; Object.keys(pl.terms || {}).forEach(function (k) { terms[k] = pl.terms[k]; });
        var exact = pl.exact - (terms.wind || 0) + w;
        terms.wind = w;
        exact = Math.max(o.yards * 0.5, Math.min(o.yards * 1.6, exact));
        return { yards: Math.round(exact), exact: exact, terms: terms, learned: { club: o.club, n: f.n, rel: rel, used: wt.used } };
    }
    // One shot's still-air carry (its wind taken out with the club's numbers, else generic).
    function stillAirOf(s, golfer) {
        var f = clubFit(golfer, s.club), L = Log(), api = WL();
        if (!api || !isNum(s.windMph)) return s.carry;
        var wt = api.windTerm(s.carry, Number(s.windMph) || 0, Number(s.relAngle) || 0, f && f.qualified ? f : null, L ? L.hand(golfer) : 'R');
        return wt ? s.carry + wt.yards : s.carry;
    }

    // ---- SHOT HISTORY (My bag > a club) -----------------------------------------------
    var STRENGTHS = [['', 'Any wind'], ['calm', 'Calm'], ['5-10', '5-10'], ['10-15', '10-15'], ['15+', '15+']];
    var DIRS = [['', 'All'], ['head', 'Head'], ['tail', 'Tail'], ['left', 'From left'], ['right', 'From right']];
    function dayWords(ms) {
        var d = new Date(ms), now = new Date();
        if (d.toDateString() === now.toDateString()) return 'today';
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '');
    }
    var CSS = '#gps-overlay .gps-shist{position:absolute;z-index:49;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:84%;overflow:auto;border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;touch-action:pan-y;}'
        + '#gps-overlay .gps-shist-sum{margin:2px 0 6px;padding:8px 10px;border-radius:12px;background:rgba(217,249,157,.10);font:700 13px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;}'
        + '#gps-overlay .gps-shist-f{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;touch-action:pan-x;}'
        + '#gps-overlay .gps-shist-f button{flex:0 0 auto;min-height:36px;border-radius:999px;padding:0 12px !important;font:700 13px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;border:1px solid rgba(255,255,255,.25) !important;background:rgba(255,255,255,.06) !important;color:#f4f4ef !important;}'
        + '#gps-overlay .gps-shist-f button[aria-pressed="true"]{background:#d9f99d !important;color:#0b0f0c !important;border-color:#d9f99d !important;}'
        + '#gps-overlay .gps-shist-list{position:relative;overflow:hidden;}'
        + '#gps-overlay .gps-shist-row{position:relative;display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.08);transition:transform .15s;}'
        + '#gps-overlay .gps-shist-row.gps-swiped{transform:translateX(-76px);}'
        + '#gps-overlay .gps-shist-yd{flex:0 0 58px;font:800 20px/1 -apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums;}'
        + '#gps-overlay .gps-shist-yd small{display:block;font:600 10.5px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;color:#a7b3aa;margin-top:2px;}'
        + '#gps-overlay .gps-shist-w{flex:1 1 auto;font:600 12.5px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#c8d1ca;}'
        + '#gps-overlay .gps-shist-w b{display:block;color:#f4f4ef;font-weight:700;font-size:13.5px;}'
        + '#gps-overlay .gps-shist-del{position:absolute;right:-76px;top:4px;bottom:4px;width:70px;border-radius:10px;background:#fca5a5 !important;color:#0b0f0c !important;font:800 13px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;}'
        + '#gps-overlay .gps-shist-none{padding:14px 0;color:#c8d1ca;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;}'
        + '#gps-overlay .gps-shist-noft{margin:0 0 6px;font:600 11.5px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#9ca3af;}'
        + '#gps-overlay .gps-shist-foot{margin-top:8px;font:600 11.5px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#9ca3af;}'
        + '#gps-overlay .gps-bag-wind{flex:1 0 100%;font:700 12px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#d9f99d;padding-bottom:3px;display:flex;align-items:center;justify-content:space-between;gap:8px;}'
        + '#gps-overlay .gps-bag-wind.gen{color:#a7b3aa;font-weight:600;}'
        + '#gps-overlay .gps-bag-miss{flex:1 0 100%;font:700 12px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#7dd3fc;padding-bottom:3px;}'
        + '#gps-overlay .gps-bag-hist{flex:0 0 auto;min-height:32px;padding:0 8px !important;border-radius:8px;font:700 12px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;color:#d9f99d !important;background:rgba(217,249,157,.10) !important;border:0 !important;}'
        + '#gps-overlay .gps-bag-row{flex-wrap:wrap;row-gap:2px;}'
        + '#gps-overlay .gps-bag-hand{display:flex;align-items:center;gap:6px;margin:0 0 8px;font:700 13px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;}'
        + '#gps-overlay .gps-bag-hand button{min-height:36px;border-radius:10px;padding:0 10px !important;font:700 13px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;}'
        + '#gps-overlay .gps-bag-hand button[aria-pressed="true"]{background:#d9f99d !important;color:#0b0f0c !important;}'
        + '#gps-overlay .gps-plinfo-src{margin-top:6px;padding-top:6px;border-top:1px solid rgba(217,249,157,.22);font-weight:700;}'
        + '#gps-overlay .gps-plinfo-src.gen{color:#fde68a;}'
        + '#gps-overlay .gps-plinfo-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.12);margin:6px 0 2px;overflow:hidden;}#gps-overlay .gps-plinfo-bar i{display:block;height:100%;background:#fde68a;}'
        + '#gps-overlay .gps-ld-plays small b.gps-ld-yours{font:800 11px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;color:#3f6212;background:#d9f99d;border-radius:6px;padding:0 5px;margin-left:4px;}';
    function ensureCss() {
        if (typeof document === 'undefined' || document.getElementById('gps-shotbag-css')) return;
        var st = document.createElement('style'); st.id = 'gps-shotbag-css'; st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }
    // ctx: { el (#gps-overlay), golfer, club, units() ('y'|'m'), onChange(), back() }
    var H = null;
    function histOpen(ctx) {
        ensureCss();
        var host = ctx.el, sh = host.querySelector('.gps-shist');
        if (!sh) {
            sh = document.createElement('div');
            sh.className = 'gps-shist gps-float gps-scroll-ok'; sh.setAttribute('role', 'dialog');
            sh.innerHTML = '<div class="gps-bag-head"><div class="gps-bag-title"></div><button type="button" class="gps-bag-done gps-shist-done">Done</button></div>'
                + '<div class="gps-bag-sub">Newest first. Swipe a shot left to delete one marked by mistake. Wind angle: where it came from vs your line to the green (0° into you, 90° from the right, 180° behind, 270° from the left).</div>'
                + '<div class="gps-shist-sum" role="status"></div>'
                // URGENT-052 B: MY MISS for this club - the summary line, the oval, the map switch.
                + '<div class="gps-shist-miss" style="display:none"></div>'
                + '<div class="gps-shist-f gps-shist-fs" role="group" aria-label="Wind strength"></div>'
                + '<div class="gps-shist-f gps-shist-fd" role="group" aria-label="Wind direction"></div>'
                + '<div class="gps-shist-list"></div>'
                + '<div class="gps-shist-foot">Saved on this phone · distances and wind only, never a map point</div>';
            host.appendChild(sh);
            sh.addEventListener('click', histClick);
            var x0 = null, y0 = null, row0 = null;
            sh.addEventListener('touchstart', function (e) { var t = e.touches && e.touches[0], r = e.target && e.target.closest && e.target.closest('.gps-shist-row'); if (!t || !r) { row0 = null; return; } x0 = t.clientX; y0 = t.clientY; row0 = r; }, { passive: true });
            sh.addEventListener('touchend', function (e) {
                var t = e.changedTouches && e.changedTouches[0]; if (!t || !row0) return;
                var dx = t.clientX - x0, dy = t.clientY - y0;
                if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) swipe(row0, dx < 0);
                row0 = null;
            }, { passive: true });
        }
        H = { ctx: ctx, sh: sh, strength: '', dir: '' };
        sh.setAttribute('aria-label', nameOf(ctx.club) + ' shot history');
        sh.style.display = '';
        histFill();
        return sh;
    }
    function swipe(row, open) {
        if (!H) return;
        Array.prototype.forEach.call(H.sh.querySelectorAll('.gps-swiped'), function (r) { if (r !== row) r.classList.remove('gps-swiped'); });
        row.classList.toggle('gps-swiped', !!open);
    }
    function histClose() { if (H && H.sh) H.sh.style.display = 'none'; var b = H && H.ctx && H.ctx.back; H = null; if (typeof b === 'function') b(); }
    function histClick(e) {
        var t = e.target; if (!H || !t || !t.closest) return;
        if (t.closest('.gps-shist-done')) { histClose(); return; }
        if (t.closest('[data-shist-miss]')) { var MP = Miss(); if (MP) { MP.setOn(H.ctx.golfer, !MP.isOn(H.ctx.golfer)); if (H.ctx.onChange) H.ctx.onChange(); histFill(); } return; }
        var f = t.closest('[data-shist-s]'); if (f) { H.strength = f.getAttribute('data-shist-s'); histFill(); return; }
        f = t.closest('[data-shist-d]'); if (f) { H.dir = f.getAttribute('data-shist-d'); histFill(); return; }
        var d = t.closest('[data-shist-del]');
        if (d) { var L = Log(); if (L && L.remove(d.getAttribute('data-shist-del'), H.ctx.golfer)) { if (H.ctx.onChange) H.ctx.onChange(); histFill(); } return; }
    }
    function histFill() {
        if (!H) return;
        var L = Log(), c = H.ctx, sh = H.sh, m = c.units && c.units() === 'm', k = m ? 0.9144 : 1, u = m ? ' m' : ' yds';
        sh.querySelector('.gps-bag-title').textContent = nameOf(c.club) + ' · shot history';
        var all = L ? L.list({ golfer: c.golfer, club: c.club }) : [];
        var shown = L ? L.list({ golfer: c.golfer, club: c.club, strength: H.strength || undefined, dir: H.dir || undefined }) : [];
        var f = clubFit(c.golfer, c.club), wl = windLine(f);
        sh.querySelector('.gps-shist-sum').textContent = all.length + ' marked shot' + (all.length === 1 ? '' : 's')
            + (f && isNum(f.stillAir) && f.n >= LEARN_MIN ? ' · still-air carry ' + Math.round(f.stillAir * k) + u : '') + ' · ' + wl.text;
        var fill = function (box, list, cur, attr) {
            box.textContent = '';
            list.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute(attr, x[0]); b.setAttribute('aria-pressed', x[0] === cur ? 'true' : 'false'); b.textContent = x[1]; box.appendChild(b); });
        };
        missFill(sh.querySelector('.gps-shist-miss'), c, all, f, k, u);
        fill(sh.querySelector('.gps-shist-fs'), STRENGTHS, H.strength, 'data-shist-s');
        fill(sh.querySelector('.gps-shist-fd'), DIRS, H.dir, 'data-shist-d');
        var box = sh.querySelector('.gps-shist-list');
        box.textContent = '';
        // 070 part 4: older shots with no course height are used as marked ("at this course").
        var noFt = all.filter(function (s) { return s && !isNum(s.cft); }).length, nf = sh.querySelector('.gps-shist-noft');
        if (!nf) { nf = document.createElement('div'); nf.className = 'gps-shist-noft'; box.parentNode.insertBefore(nf, box); }
        nf.textContent = noFt ? noFt + ' shot' + (noFt === 1 ? '' : 's') + ' with no course height saved (older, or no height for that course): used as marked, at that course.' : '';
        nf.style.display = noFt ? '' : 'none';
        if (!shown.length) { var n0 = document.createElement('div'); n0.className = 'gps-shist-none'; n0.textContent = all.length ? 'No ' + low(c.club) + ' shots in that wind yet.' : 'No marked ' + low(c.club) + ' shots yet. Mark shot, pick the club, and the next mark measures it.'; box.appendChild(n0); return; }
        shown.forEach(function (s) {
            var row = document.createElement('div'); row.className = 'gps-shist-row'; row.setAttribute('data-shist-id', s.id);
            var yd = document.createElement('div'); yd.className = 'gps-shist-yd';
            yd.textContent = String(Math.round(s.carry * k));
            var sm = document.createElement('small'); sm.textContent = 'still air ' + Math.round(stillAirOf(s, c.golfer) * k); yd.appendChild(sm);
            var w = document.createElement('div'); w.className = 'gps-shist-w';
            var b = document.createElement('b'); b.textContent = 'Hole ' + (s.hole != null ? s.hole : '?') + (s.course ? ' · ' + s.course : '') + ' · ' + dayWords(s.date);
            w.appendChild(b); w.appendChild(document.createTextNode(windWords(s.windMph, s.relAngle) + (isNum(s.tempF) ? ' · ' + Math.round(s.tempF) + '°F' : '')));
            var del = document.createElement('button'); del.type = 'button'; del.className = 'gps-shist-del'; del.setAttribute('data-shist-del', s.id); del.textContent = 'Delete';
            del.setAttribute('aria-label', 'Delete this ' + low(c.club) + ' shot');
            row.appendChild(yd); row.appendChild(w); row.appendChild(del);
            box.appendChild(row);
        });
    }

    // ---- MY MISS (URGENT-052 B; URGENT-063) on the club screen ---------------------------
    // 063: the oval from My bag's average carry for the club (gps-miss-pattern.js oval - its TUNE
    // numbers), irons and wedges only; the My bag line, the picture (the aim line straight up,
    // LONG at the top, the golfer's right on the right) and the formula in plain words.
    // ctx.carryNow() is My bag's number NOW (so a change shows at once); ctx.carry the one at open.
    function Miss() { return W.HardPanMissPattern && typeof W.HardPanMissPattern.oval === 'function' ? W.HardPanMissPattern : null; }
    function missOval(golfer, club, carry) {
        var MP = Miss(), L = Log(); if (!MP) return null;
        return MP.oval(club, carry, L && L.hand ? L.hand(golfer) : 'R');
    }
    // His marked shots (052 B, kept): dots, side + right, y = long / short of their own average.
    function missStats(golfer, club) {
        var MP = Miss(), L = Log(); if (!MP || !L || !MP.shotStats) return null;
        return MP.shotStats(L.list({ golfer: golfer, club: club }), clubFit(golfer, club));
    }
    function missSvg(mf, st) {
        var MP = Miss(); if (!MP || !mf) return '';
        var ring = MP.outline(mf, 64).map(function (q) { return [q[0], q[1] - mf.carry]; });
        var pts = st ? st.pts : [];
        var ext = 6;
        ring.concat(pts).forEach(function (q) { ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1])); });
        ext *= 1.15;
        var Wd = 300, Ht = 150, sc = Math.min(Wd / 2, Ht / 2) / ext, cx = Wd / 2, cy = Ht / 2;
        var X = function (x) { return (cx + x * sc).toFixed(1); }, Y = function (y) { return (cy - y * sc).toFixed(1); };
        var d = ring.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]) + ' ' + Y(q[1]); }).join(' ') + ' Z';
        return '<svg class="gps-miss-svg" viewBox="0 0 ' + Wd + ' ' + Ht + '" role="img" aria-label="Your miss oval">'
            + '<line x1="' + cx + '" y1="4" x2="' + cx + '" y2="' + (Ht - 4) + '" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>'
            + '<line x1="8" y1="' + cy + '" x2="' + (Wd - 8) + '" y2="' + cy + '" stroke="rgba(255,255,255,.15)"/>'
            + '<path d="' + d + '" fill="rgba(125,211,252,.22)" stroke="#7dd3fc" stroke-width="2"/>'
            + pts.map(function (q) { return '<circle cx="' + X(q[0]) + '" cy="' + Y(q[1]) + '" r="3.2" fill="#f4f4ef"/>'; }).join('')
            + '<text x="' + (cx + 4) + '" y="14" fill="#a7b3aa" font-size="11" font-weight="700">long</text>'
            + '<text x="' + (cx + 4) + '" y="' + (Ht - 6) + '" fill="#a7b3aa" font-size="11" font-weight="700">short</text>'
            + '<text x="8" y="' + (cy - 5) + '" fill="#a7b3aa" font-size="11" font-weight="700">left</text>'
            + '<text x="' + (Wd - 8) + '" y="' + (cy - 5) + '" fill="#a7b3aa" font-size="11" font-weight="700" text-anchor="end">right</text></svg>';
    }
    function missFill(box, c, all, f, k, u) {
        var MP = Miss(); if (!box) return;
        if (!MP) { box.style.display = 'none'; return; }
        var carry = typeof c.carryNow === 'function' ? c.carryNow() : c.carry;
        var mf = missOval(c.golfer, c.club, carry), on = MP.isOn(c.golfer);
        box.style.display = '';
        box.textContent = '';
        var h = document.createElement('div'); h.className = 'gps-miss-h'; h.textContent = 'MY MISS'; box.appendChild(h);
        var line = document.createElement('div'); line.className = 'gps-miss-line'; line.setAttribute('data-miss-line', c.club);
        line.textContent = mf ? MP.bagLine(nameOf(c.club), carry, mf.hand, k !== 1 ? 'm' : 'yd', c.club)
            : !MP.isClub(c.club) ? nameOf(c.club) + ': My miss is for irons and wedges only'
            : nameOf(c.club) + ': no carry yet - type one in My bag, or use Range';
        box.appendChild(line);
        // 052 B's line from his marked shots (kept): "7-iron: 70% right, 9 yds avg · right misses 6 yds short".
        var st = missStats(c.golfer, c.club);
        if (st) { var sl = document.createElement('div'); sl.className = 'gps-miss-stats'; sl.setAttribute('data-miss-stats', c.club); sl.textContent = MP.statsLine(st, nameOf(c.club), k !== 1 ? 'm' : 'yd') + ' · from ' + st.n + ' marked shot' + (st.n === 1 ? '' : 's'); box.appendChild(sl); }
        if (mf) {
            var pic = document.createElement('div'); pic.className = 'gps-miss-pic'; pic.innerHTML = missSvg(mf, st); box.appendChild(pic);
        }
        var note = document.createElement('div'); note.className = 'gps-miss-note'; note.setAttribute('data-miss-info', '1');
        note.textContent = MP.infoText();
        box.appendChild(note);
        var row = document.createElement('div'); row.className = 'gps-miss-row';
        var lb = document.createElement('span'); lb.textContent = 'Show My miss on the map'; row.appendChild(lb);
        var sw = document.createElement('button'); sw.type = 'button'; sw.className = 'gps-ts-sw gps-miss-sw' + (on ? ' on' : ''); sw.setAttribute('data-shist-miss', '1');
        sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.setAttribute('aria-label', 'My miss on the map');
        sw.appendChild(document.createElement('i')); row.appendChild(sw);
        box.appendChild(row);
    }
    CSS += '#gps-overlay .gps-shist-miss{margin:2px 0 8px;padding:8px 10px;border-radius:12px;background:rgba(125,211,252,.08);border:1px solid rgba(125,211,252,.25);}'
        + '#gps-overlay .gps-miss-h{font:800 11px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em;color:#7dd3fc;margin-bottom:3px;}'
        + '#gps-overlay .gps-miss-line{font:800 14px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#f4f4ef;}'
        + '#gps-overlay .gps-miss-stats{font:700 12.5px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#d9e1db;margin-top:2px;}'
        + '#gps-overlay .gps-miss-pic svg{display:block;width:100%;height:auto;max-height:150px;margin:6px 0 2px;}'
        + '#gps-overlay .gps-miss-note{font:600 11.5px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;color:#a7b3aa;}'
        + '#gps-overlay .gps-miss-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;font:700 13.5px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;}';

    try { ensureCss(); } catch (e) {}
    W.HardPanShotBag = {
        LEARN_MIN: LEARN_MIN, QUALIFY: QUALIFY, WINDY_MPH: WINDY_MPH, api: WL,
        fits: fits, clubFit: clubFit, mergeBag: mergeBag, windLine: windLine, infoText: infoText, adjust: adjust,
        windWords: windWords, stillAirOf: stillAirOf, atBaseline: atBaseline, altDivOf: altDivOf, baselineFtOf: baselineFtOf, nameOf: nameOf, ensureCss: ensureCss,
        openHistory: histOpen, closeHistory: histClose, historyOpen: function () { return !!H; }, swipe: swipe, missOval: missOval, missStats: missStats
    };
})();
