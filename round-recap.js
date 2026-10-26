// ============================================================================
// THE ROUND RECAP AS ONE IMAGE (URGENT-045 #4, HardPan)
//
// Manny: "I wanna wow the new users." After the round (the Receipt) and from
// Home > History, ONE picture for the group text: the course and the day, the
// scorecard (golfers x holes, Out / In / Total, net), who won what, and the
// money (Settle up). Share sheet, and Save to Photos.
//
// PURE DISPLAY. IT IS READ OFF THE RENDERED RECEIPT, NOT WORKED OUT AGAIN -
// trip-recap-image.js's rule and native-export.js's before it: "if the Receipt
// is wrong, the PDF is wrong in exactly the same way, which is the correct
// failure." A second path to the same money is how a $10 Nassau once showed
// $30 against a Receipt that paid $45. So every figure in the picture is a
// string this page already put on screen:
//   course, day, chips   #receipt-export-head (buildReceiptHeader + HpRcpt)
//   the holes            #receipt-scorecard, the Full Scorecard (scorecard-rows.js)
//   net                  #hp-rc-scores, FINAL SCORES (HpRcpt.scoresHtml)
//   who won what         #money-pool-section and #settle-content (the game cards)
//   the money            #combined-settlement-summary (HpRcpt.settleUp = Who Pays
//                        Who) - or, on a pool round nobody pays anybody, Pay out
// Nothing here adds, rounds or compares a number. Nothing is written anywhere.
//
// THREE PARTS, AND ONLY THE FIRST AND LAST NEED A BROWSER:
//   extract(doc)            reads the Receipt into plain data
//   layout(rec, measure)    PURE: every rectangle, ring and string, and the height
//   draw(model, canvas)     puts it on a canvas; records every string it drew in
//                           canvas.__recapText (the test reads that back)
// HardPanRecap.render(roundData, opts) (at the foot of this file) wraps the three.
// THIS FILE IS THE IMAGE ONLY (Manny's split, URGENT-045): the Share recap button,
// the History entry, the share sheet and Save to Photos live with the share
// helper (branch 045-recap-share), which calls render(). It loads inside
// settlement.html's GPS block - HardPan only, the #31 Receipt (html.hp-rcpt).
// ============================================================================
(function (W) {
    'use strict';

    // THE 2.0 PALETTE - the #31 Receipt's own tokens (settlement.html, html.hp-rcpt).
    var C = {
        bg: '#f2f4ef', card: '#ffffff', line: '#dfe5df', soft: '#eef1ee', chip: '#e9eee9',
        ink: '#13241d', green: '#0f4c3a', muted: '#5d6b64', kick: '#666677', lime: '#d4f27c',
        limeInk: '#10392d', pos: '#0f7a3f', neg: '#b3261e', onGreen: '#cfe3d8'
    };
    var FACE = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
    var WIDTH = 1080, PAD = 40, CPAD = 28;
    var IW = WIDTH - PAD * 2 - CPAD * 2;   // the width inside a card
    // iOS refuses a canvas over 16,777,216 pixels; a field of 14 with two skins
    // flights runs long, so the scale steps down rather than the picture failing.
    var MAX_PIXELS = 16000000;

    function font(size, weight) { return (weight || 400) + ' ' + size + 'px ' + FACE; }

    // ---------------------------------------------------------------------------
    // READ THE RECEIPT
    // ---------------------------------------------------------------------------
    // innerText, never textContent: a hidden row has textContent and no innerText,
    // which is the right answer for a line nobody can see. Non-breaking spaces (the
    // game cards keep "Test A" on one line with one) become plain spaces.
    function T(el) {
        if (!el) return '';
        var s = (el.innerText !== undefined && el.innerText !== null) ? el.innerText : el.textContent;
        return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }
    // The game kicker is uppercase by CSS only; its words are read as written.
    function Tc(el) { return el ? String(el.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
    function kids(el) { return el ? Array.prototype.slice.call(el.children || []) : []; }
    function all(root, sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }
    // Headings lose their leading emoji (the picture's kickers carry none, like the
    // Receipt's own); the words and the figures stay exactly as shown.
    function noLeadIcon(s) {
        return String(s || '').replace(/^[^A-Za-z0-9$+\-−(]+/, '').trim();
    }
    var MARKS = ['mark-eagle', 'mark-birdie', 'mark-double', 'mark-bogey'];
    function markOf(td) {
        for (var i = 0; i < MARKS.length; i++) if (td.classList && td.classList.contains(MARKS[i])) return MARKS[i].slice(5);
        return '';
    }
    function query(k) { try { return new URLSearchParams(W.location.search).get(k); } catch (e) { return null; } }

    // THE DAY. The round's own day where this phone has one - the same stamp Home >
    // History lists the round under (front-door.js, hardpan_round_seen_v1) - so a
    // recap sent from History a week later does not say today. Otherwise the
    // Receipt's own date line.
    function roundDate(code, receiptDate) {
        try {
            var m = JSON.parse(W.localStorage.getItem('hardpan_round_seen_v1') || '{}');
            var t = m && Number(m[String(code || '').toUpperCase()]);
            if (t > 0) return new Date(t).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        } catch (e) {}
        return receiptDate;
    }

    function readCard(doc) {
        var table = doc.querySelector('#receipt-scorecard table.receipt-table');
        if (!table) return null;
        var cols = [], par = [], golfers = [];
        all(table, 'tr').forEach(function (tr) {
            var cells = kids(tr);
            if (!cells.length) return;
            var first = T(cells[0]);
            if (first === 'HOLE') { cols = cells.slice(1).map(function (c) { return { label: T(c), sec: !!(c.classList && c.classList.contains('rt-sec')) }; }); return; }
            if (first === 'PAR') { par = cells.slice(1).map(T); return; }
            if (first === 'HCP') return;
            if (tr.classList && tr.classList.contains('rt-net')) return;   // NET comes from FINAL SCORES, below
            golfers.push({ name: first, out: !!(tr.classList && tr.classList.contains('golfer-out')),
                cells: cells.slice(1).map(function (c) { return { v: T(c), mark: markOf(c) }; }) });
        });
        if (!cols.length || !golfers.length) return null;
        // FINAL SCORES, row for row (both are scorecard-rows.js's golfers, in its order):
        // the net total and the handicap shown beside the name.
        var fs = all(doc, '#hp-rc-scores tbody tr');
        var hasNet = fs.length === golfers.length;
        golfers.forEach(function (g, i) {
            var tr = fs[i];
            if (!hasNet || !tr) return;
            var hc = tr.querySelector('.hp-rc-hcp');
            g.hcp = T(hc);
            g.net = T(tr.querySelector('td.n'));
            g.toPar = T(tr.querySelector('td.p'));
            var nm = T(tr.querySelector('td.nm'));
            g.fsName = g.hcp && nm.slice(-g.hcp.length) === g.hcp ? nm.slice(0, nm.length - g.hcp.length).trim() : nm;
        });
        // TWO NINES, SPLIT WHERE THE CARD SPLITS (after OUT): front = 1-9 + OUT,
        // back = 10-18 + IN + TOT (+ NET). A nine-hole card is one table.
        var outAt = -1;
        cols.forEach(function (c, i) { if (outAt < 0 && c.sec && c.label === 'OUT') outAt = i; });
        var ranges = (outAt >= 0 && outAt < cols.length - 1) ? [[0, outAt + 1], [outAt + 1, cols.length]] : [[0, cols.length]];
        var nines = ranges.map(function (r, ri) {
            var last = ri === ranges.length - 1;
            return {
                cols: cols.slice(r[0], r[1]).concat(last && hasNet ? [{ label: 'NET', sec: true, net: true }] : []),
                par: par.slice(r[0], r[1]).concat(last && hasNet ? [''] : []),
                rows: golfers.map(function (g) { return g.cells.slice(r[0], r[1]).concat(last && hasNet ? [{ v: g.net || '', mark: '', net: true }] : []); })
            };
        });
        return { golfers: golfers.map(function (g) { return { name: g.name, hcp: g.hcp || '', out: g.out, fsName: g.fsName, net: g.net, toPar: g.toPar }; }), nines: nines, hasNet: hasNet };
    }

    // WHO WON WHAT: every game card in the order the Receipt shows them (the pool
    // games, then the matches - html.hp-rcpt's order), lines as drawn.
    function readGames(doc) {
        var out = [];
        ['#money-pool-section', '#settle-content'].forEach(function (sel) {
            var root = doc.querySelector(sel);
            if (!root) return;
            all(root, '.hp-rc-game, .settle-card').forEach(function (card) {
                if (!T(card)) return;
                if (card.classList.contains('hp-rc-game')) {
                    var g = { head: Tc(card.querySelector('.hp-rc-k')), rows: [], total: null, why: '' };
                    var body = card.querySelector('.hp-rc-card');
                    kids(body).forEach(function (el) {
                        var cl = el.classList;
                        if (cl.contains('hp-rc-note')) g.rows.push({ left: T(el), right: '', tone: 'note' });
                        else if (cl.contains('hp-rc-ln')) {
                            var s = kids(el);
                            var r = s[1];
                            g.rows.push({ left: T(s[0]), right: T(r), tone: r && r.classList.contains('pos') ? 'pos' : 'mut' });
                        } else if (cl.contains('hp-rc-tot')) {
                            var t = kids(el);
                            g.total = { left: T(t[0]), right: T(t[1]) };
                        } else if (cl.contains('hp-rc-why')) g.why = T(el);
                    });
                    out.push(g);
                    return;
                }
                if (card.closest && card.closest('.hp-rc-game')) return;
                var gh = card.querySelector('.game-head');
                var head = gh ? [Tc(card.querySelector('.game-title')), Tc(card.querySelector('.game-pot'))].filter(Boolean).join(' · ')
                    : Tc(card.querySelector('.settle-header'));
                var rows = [];
                kids(card).forEach(function (el) {
                    if (!el.classList.contains('ledger-row') || el.classList.contains('skins-carry-row')) return;
                    if (!T(el)) return;
                    var s = kids(el);
                    if (s.length >= 2) rows.push({ left: T(s[0]).replace(/:$/, ''), right: T(s[s.length - 1]), tone: s[s.length - 1].classList.contains('val-neg') ? 'neg' : 'pos' });
                    else rows.push({ left: T(el), right: '', tone: 'mut' });
                });
                if (head || rows.length) out.push({ head: noLeadIcon(head), rows: rows, total: null, why: '' });
            });
        });
        return out;
    }

    // THE MONEY: Settle up (Who Pays Who's own transactions), line for line. A pool
    // round where nobody pays anybody has no Settle up; its money is Pay out.
    function readMoney(doc) {
        var settle = doc.querySelector('#combined-settlement-summary .hp-rc-settle');
        if (settle) {
            return { kind: 'settle', head: 'Settle up',
                rows: all(settle, '.hp-rc-pay').map(function (p) { var s = kids(p); return { left: T(s[0]), right: T(s[1]) }; }),
                meta: T(settle.querySelector('.hp-rc-meta')) };
        }
        var po = doc.querySelector('#results-top .payout-card');
        if (po && T(po)) {
            return { kind: 'payout', head: 'Pay out' + (T(po.querySelector('.po-total')) ? ' · ' + T(po.querySelector('.po-total')) : ''),
                rows: all(po, '.po-row > summary').map(function (s) { return { left: T(s.querySelector('.po-name')), right: T(s.querySelector('.po-amt')) }; }),
                meta: T(po.querySelector('.po-none')) };
        }
        return null;
    }

    function extract(doc) {
        doc = doc || W.document;
        var head = doc.getElementById('receipt-export-head');
        if (!head) return null;
        var dateEl = head.querySelector('.receipt-head-date');
        var city = T(head.querySelector('.hp-rc-city'));
        var dateText = T(dateEl);
        if (city && dateText.slice(-city.length) === city) dateText = dateText.slice(0, dateText.length - city.length).trim();
        var code = String(query('game') || '').toUpperCase();
        var rec = {
            code: code,
            course: T(head.querySelector('.receipt-head-course')),
            date: roundDate(code, dateText),
            receiptDate: dateText,
            city: city.replace(/^·\s*/, ''),
            chips: all(head, '.hp-rc-chip').map(T).filter(Boolean),
            card: readCard(doc),
            games: readGames(doc),
            money: readMoney(doc)
        };
        if (!rec.course || !rec.card) return null;   // no card, no recap: a course name on a blank picture is worse than none
        return rec;
    }

    // ---------------------------------------------------------------------------
    // LAYOUT (pure). measure(fontString, text) -> width in px. Without one, a
    // character-count estimate (tests); the page passes the real canvas's.
    // ---------------------------------------------------------------------------
    function approxMeasure(f, text) {
        var m = /(\d+)px/.exec(f), size = m ? Number(m[1]) : 16, bold = /^(7|8|9)00/.test(f);
        return String(text || '').length * size * (bold ? 0.6 : 0.55);
    }
    function fitText(measure, f, text, room) {
        var s = String(text || '');
        if (measure(f, s) <= room) return s;
        while (s.length > 1 && measure(f, s + '…') > room) s = s.slice(0, -1);
        return s.replace(/[\s·,.-]+$/, '') + '…';
    }
    // Word wrap into at most maxLines lines; the last one is shortened if it must be.
    function wrap(measure, f, text, room, maxLines) {
        var words = String(text || '').split(' '), lines = [], cur = '';
        for (var i = 0; i < words.length; i++) {
            var next = cur ? cur + ' ' + words[i] : words[i];
            if (!cur || measure(f, next) <= room) { cur = next; continue; }
            lines.push(cur); cur = words[i];
            if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
        }
        if (cur) lines.push(cur);
        return lines.map(function (l, k) { return k === lines.length - 1 ? fitText(measure, f, l, room) : l; });
    }

    // NAMES STAY TELLABLE APART (#2): "Test A" and "Test B" must never both come out
    // "Test…". The name column's font steps down until every name fits whole, and
    // only then is anything shortened.
    function nameFont(measure, names, room) {
        for (var size = 28; size >= 20; size -= 2) {
            var f = font(size, 700);
            if (names.every(function (n) { return measure(f, n) <= room; })) return { f: f, size: size };
        }
        return { f: font(20, 700), size: 20 };
    }

    function layout(rec, measure) {
        if (!rec || !rec.card) return null;
        var M = measure || approxMeasure;
        var ops = [], y = 0;
        var text = function (o) { o.op = 'text'; ops.push(o); return o; };
        var rect = function (o) { o.op = 'rect'; ops.push(o); return o; };

        // ---- THE HEAD: deep green band, lime wordmark, the course and the day ----
        var band = rect({ x: 0, y: 0, w: WIDTH, h: 0, fill: C.green });
        y = 72;
        text({ x: PAD, y: y, text: 'HARDPAN', font: font(26, 800), color: C.lime, spacing: 6, role: 'brand' });
        text({ x: WIDTH - PAD, y: y, text: 'ROUND RECAP', font: font(22, 800), color: C.onGreen, align: 'right', spacing: 4, role: 'kicker' });
        y += 24;
        wrap(M, font(60, 800), rec.course, WIDTH - PAD * 2, 2).forEach(function (l) {
            y += 68;
            text({ x: PAD, y: y, text: l, font: font(60, 800), color: '#ffffff', role: 'course' });
        });
        y += 48;
        text({ x: PAD, y: y, text: fitText(M, font(30, 500), rec.date + (rec.city ? ' · ' + rec.city : ''), WIDTH - PAD * 2), font: font(30, 500), color: C.onGreen, role: 'date' });
        if (rec.chips && rec.chips.length) {
            y += 28;
            var cx = PAD, cf = font(24, 700), ch = 46;
            rec.chips.forEach(function (c) {
                var w = Math.min(M(cf, c) + 36, WIDTH - PAD * 2);
                if (cx + w > WIDTH - PAD) { cx = PAD; y += ch + 10; }
                var final = /^final$/i.test(c);
                rect({ x: cx, y: y, w: w, h: ch, r: ch / 2, fill: final ? C.lime : 'rgba(255,255,255,0.14)' });
                text({ x: cx + w / 2, y: y + 31, text: fitText(M, cf, c, w - 36), font: cf, color: final ? C.limeInk : '#ffffff', align: 'center', role: 'chip' });
                cx += w + 10;
            });
            y += ch;
        }
        y += 44;
        band.h = y;
        y += 36;

        var kicker = function (label) {
            text({ x: PAD + 4, y: y + 22, text: label.toUpperCase(), font: font(22, 800), color: C.kick, spacing: 3, role: 'kicker' });
            y += 40;
        };
        var card = function (fill) { return rect({ x: PAD, y: y, w: WIDTH - PAD * 2, h: 0, r: 24, fill: fill || C.card, stroke: fill ? null : C.line }); };

        // ---- THE SCORECARD: golfers x holes, two nines, Out / In / Tot, net -------
        var sc = rec.card;
        kicker('Scorecard');
        var box = card();
        y += CPAD - 6;
        var HOLE_W = 56, SEC_W = 76;
        var widest = sc.nines.reduce(function (m, n) {
            return Math.max(m, n.cols.reduce(function (s, c) { return s + (c.sec ? SEC_W : HOLE_W); }, 0));
        }, 0);
        var NAME_W = IW - widest;
        var nf = nameFont(M, sc.golfers.map(function (g) { return g.name; }), NAME_W - 10);
        sc.nines.forEach(function (nine, ni) {
            if (ni > 0) y += 26;
            var x0 = PAD + CPAD, xs = [], x = x0 + NAME_W;
            nine.cols.forEach(function (c) { var w = c.sec ? SEC_W : HOLE_W; xs.push({ x: x, w: w, c: c }); x += w; });
            var top = y, HEAD_H = 46, PAR_H = 40, ROW_H = 60;
            var tableH = HEAD_H + PAR_H + ROW_H * sc.golfers.length;
            // the totals columns sit on a soft band, as the Receipt's rt-sec cells do
            xs.forEach(function (col) { if (col.c.sec) rect({ x: col.x + 2, y: top, w: col.w - 4, h: tableH, r: 10, fill: col.c.net ? '#e6f3d2' : C.soft }); });
            text({ x: x0, y: top + 32, text: 'HOLE', font: font(20, 800), color: C.kick, spacing: 2, role: 'colhead' });
            xs.forEach(function (col) { text({ x: col.x + col.w / 2, y: top + 32, text: col.c.label, font: font(col.c.sec ? 20 : 22, 800), color: col.c.net ? C.green : C.kick, align: 'center', role: 'colhead' }); });
            var py = top + HEAD_H;
            text({ x: x0, y: py + 28, text: 'Par', font: font(22, 600), color: C.muted, role: 'par' });
            xs.forEach(function (col, i) { if (nine.par[i]) text({ x: col.x + col.w / 2, y: py + 28, text: nine.par[i], font: font(22, 600), color: C.muted, align: 'center', role: 'par' }); });
            var gy = py + PAR_H;
            sc.golfers.forEach(function (g, gi) {
                ops.push({ op: 'line', x1: x0, y1: gy, x2: x0 + IW, y2: gy, color: C.soft, w: 2 });
                var base = gy + 40;
                var nm = text({ x: x0, y: base, text: fitText(M, nf.f, g.name, NAME_W - 10), font: nf.f, color: g.out ? C.muted : C.ink, role: 'name', gi: gi });
                if (g.hcp && ni === 0) {
                    var nw = M(nf.f, nm.text), hf = font(20, 500);
                    if (nw + 8 + M(hf, g.hcp) <= NAME_W - 10) text({ x: x0 + nw + 8, y: base, text: g.hcp, font: hf, color: C.muted, role: 'hcp', gi: gi });
                }
                nine.rows[gi].forEach(function (cell, ci) {
                    var col = xs[ci], cxm = col.x + col.w / 2, cym = gy + ROW_H / 2;
                    if (cell.mark === 'birdie' || cell.mark === 'eagle') {
                        ops.push({ op: 'ring', cx: cxm, cy: cym, r: 21, color: C.neg, w: 2.5 });
                        if (cell.mark === 'eagle') ops.push({ op: 'ring', cx: cxm, cy: cym, r: 26, color: C.neg, w: 2.5 });
                    } else if (cell.mark === 'bogey' || cell.mark === 'double') {
                        ops.push({ op: 'box', x: cxm - 20, y: cym - 20, w: 40, h: 40, color: C.neg, w2: 2.5 });   // URGENT-081: the circles' red and line
                        if (cell.mark === 'double') ops.push({ op: 'box', x: cxm - 25, y: cym - 25, w: 50, h: 50, color: C.neg, w2: 2.5 });
                    }
                    text({ x: cxm, y: base, text: cell.v, font: font(col.c.sec ? 28 : 27, col.c.sec ? 800 : 500), color: cell.net ? C.green : C.ink, align: 'center',
                        role: cell.net ? 'net' : (col.c.sec ? 'sec' : 'hole'), gi: gi, col: col.c.label });
                });
                gy += ROW_H;
            });
            y = top + tableH;
        });
        y += CPAD;
        box.h = y - box.y;
        y += 30;

        // ---- WHO WON WHAT: each game, its lines as the Receipt words them --------
        if (rec.games && rec.games.length) {
            kicker('Who won what');
            rec.games.forEach(function (g) {
                var gb = card();
                y += CPAD;
                if (g.head) {
                    wrap(M, font(26, 800), g.head, IW, 2).forEach(function (l, i) {
                        y += i === 0 ? 26 : 34;
                        text({ x: PAD + CPAD, y: y, text: l, font: font(26, 800), color: C.ink, role: 'game-head' });
                    });
                    y += 14;
                }
                g.rows.forEach(function (r, ri) {
                    var lf = r.tone === 'note' ? font(22, 500) : font(26, 500), rf = font(26, 800);
                    var rw = r.right ? M(rf, r.right) : 0;
                    var room = IW - (rw ? rw + 24 : 0);
                    var lines = wrap(M, lf, r.left, Math.max(room, IW * 0.4), 2);
                    if (ri > 0 || g.head) ops.push({ op: 'line', x1: PAD + CPAD, y1: y, x2: PAD + CPAD + IW, y2: y, color: C.soft, w: 2 });
                    var ly = y + 38;
                    lines.forEach(function (l, li) {
                        text({ x: PAD + CPAD, y: ly + li * 34, text: l, font: lf, color: r.tone === 'note' ? C.muted : C.ink, role: 'game-line' });
                    });
                    if (r.right) text({ x: PAD + CPAD + IW, y: ly, text: r.right, font: rf, color: r.tone === 'pos' ? C.pos : (r.tone === 'neg' ? C.neg : C.muted), align: 'right', role: 'game-money' });
                    y += 20 + lines.length * 34;
                });
                if (g.total) {
                    y += 6;
                    ops.push({ op: 'line', x1: PAD + CPAD, y1: y, x2: PAD + CPAD + IW, y2: y, color: C.line, w: 3 });
                    y += 40;
                    text({ x: PAD + CPAD, y: y, text: g.total.left, font: font(28, 800), color: C.green, role: 'game-total' });
                    text({ x: PAD + CPAD + IW, y: y, text: g.total.right, font: font(28, 800), color: C.green, align: 'right', role: 'game-total-money' });
                    y += 10;
                }
                if (g.why) {
                    wrap(M, font(22, 500), g.why, IW, 2).forEach(function (l) { y += 32; text({ x: PAD + CPAD, y: y, text: l, font: font(22, 500), color: C.muted, role: 'game-why' }); });
                }
                y += CPAD;
                gb.h = y - gb.y;
                y += 16;
            });
            y += 14;
        }

        // ---- THE MONEY: Settle up, on the deep green, the figure in lime ----------
        var mo = rec.money;
        if (mo && mo.rows && mo.rows.length) {
            var mb = card(C.green);
            y += CPAD + 22;
            text({ x: PAD + CPAD, y: y, text: mo.head.toUpperCase(), font: font(22, 800), color: C.lime, spacing: 3, role: 'money-head' });
            y += 12;
            mo.rows.forEach(function (r, ri) {
                if (ri > 0) ops.push({ op: 'line', x1: PAD + CPAD, y1: y, x2: PAD + CPAD + IW, y2: y, color: 'rgba(255,255,255,0.16)', w: 2 });
                var rf = font(36, 800), rw = M(rf, r.right);
                y += 56;
                text({ x: PAD + CPAD, y: y, text: fitText(M, rf, r.left, IW - rw - 24), font: rf, color: '#ffffff', role: 'money-line' });
                text({ x: PAD + CPAD + IW, y: y, text: r.right, font: rf, color: C.lime, align: 'right', role: 'money-amount' });
                y += 18;
            });
            if (mo.meta) { y += 30; text({ x: PAD + CPAD, y: y, text: fitText(M, font(22, 500), mo.meta, IW), font: font(22, 500), color: C.onGreen, role: 'money-meta' }); }
            y += CPAD;
            mb.h = y - mb.y;
            y += 16;
        }

        y += 34;
        text({ x: WIDTH / 2, y: y, text: 'HardPan' + (rec.code ? ' · Round ' + rec.code : ''), font: font(22, 600), color: C.muted, align: 'center', role: 'foot' });
        y += 44;
        return { width: WIDTH, height: Math.ceil(y), bg: C.bg, ops: ops };
    }

    // ---------------------------------------------------------------------------
    // DRAW
    // ---------------------------------------------------------------------------
    function scaleFor(model) { return Math.max(1, Math.min(2, Math.sqrt(MAX_PIXELS / (model.width * model.height)))); }
    function roundRect(g, x, y, w, h, r) {
        r = Math.min(r || 0, w / 2, h / 2);
        g.beginPath();
        g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
        g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
        g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
        g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
        g.closePath();
    }
    function draw(model, canvas) {
        if (!model || !canvas) return null;
        var scale = scaleFor(model);
        canvas.width = Math.round(model.width * scale);
        canvas.height = Math.round(model.height * scale);
        var g = canvas.getContext('2d');
        if (!g) return null;
        var drawn = [];
        g.scale(scale, scale);
        g.fillStyle = model.bg;
        g.fillRect(0, 0, model.width, model.height);
        g.textBaseline = 'alphabetic';
        model.ops.forEach(function (o) {
            if (o.op === 'rect') {
                roundRect(g, o.x, o.y, o.w, o.h, o.r || 0);
                if (o.fill) { g.fillStyle = o.fill; g.fill(); }
                if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 2; g.stroke(); }
            } else if (o.op === 'line') {
                g.beginPath(); g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2);
                g.strokeStyle = o.color; g.lineWidth = o.w || 1; g.stroke();
            } else if (o.op === 'ring') {
                g.beginPath(); g.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
                g.strokeStyle = o.color; g.lineWidth = o.w || 2; g.stroke();
            } else if (o.op === 'box') {
                roundRect(g, o.x, o.y, o.w, o.h, 4);
                g.strokeStyle = o.color; g.lineWidth = o.w2 || 2; g.stroke();
            } else if (o.op === 'text') {
                g.font = o.font;
                g.fillStyle = o.color;
                g.textAlign = o.align || 'left';
                try { g.letterSpacing = (o.spacing || 0) + 'px'; } catch (e) {}
                g.fillText(o.text, o.x, o.y);
                drawn.push({ text: o.text, role: o.role || '', gi: o.gi, col: o.col });
            }
        });
        try { g.letterSpacing = '0px'; } catch (e) {}
        canvas.__recapText = drawn;
        return canvas;
    }

    function measurer() {
        try {
            var g = W.document.createElement('canvas').getContext('2d');
            if (g) return function (f, t) { g.font = f; return g.measureText(String(t || '')).width; };
        } catch (e) {}
        return approxMeasure;
    }

    // THE ROUND THE RECEIPT IS SHOWING MUST BE THE ROUND ASKED FOR. render() is
    // handed roundData, but draws only what the Receipt on this page shows - so a
    // Receipt for another round (or none) is refused, never drawn under this
    // round's name.
    function sameRound(roundData, rec) {
        if (!roundData) return true;
        var want = String(roundData.courseName || '').replace(/\s+/g, ' ').trim();
        if (want && rec.course && want !== rec.course) return false;
        var players = Array.isArray(roundData.players) ? roundData.players.filter(function (p) { return p && String(p.name || '').trim(); }) : [];
        if (players.length && rec.card && rec.card.golfers.length !== players.length) return false;
        return true;
    }

    function slug(rec) {
        var s = String(rec.course || 'round').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
        return 'hardpan-recap-' + (s || 'round') + (rec.code ? '-' + rec.code.toLowerCase() : '') + '.png';
    }

    // ---------------------------------------------------------------------------
    // THE API (URGENT-045 #4, image half)
    //
    //   HardPanRecap.render(roundData, opts) -> Promise<{ blob, dataUrl, width, height,
    //                                                     name, text, record }>
    //
    // roundData  the round (currentData on the Receipt) - used to check the Receipt
    //            on the page is THIS round; no figure is taken from it.
    // opts.doc   the Document holding the rendered HardPan Receipt (settlement.html
    //            with html.hp-rcpt). Default: this page's document. A caller that is
    //            not on the Receipt (Home > History) opens settlement.html?game=CODE
    //            (or loads it in a frame) and calls render there, once the Receipt is
    //            drawn (#receipt-scorecard table and #hp-rc-scores table present).
    // opts.code  the round code for the foot line / file name (default ?game=).
    // Resolves { blob (image/png), dataUrl, width, height (pixels), name (a file name
    // for the share sheet), text (every string drawn, in order, with its role),
    // record (what was read off the Receipt) }. Rejects with Error('not-ready') when
    // the Receipt is not drawn yet or is not a finished HardPan Receipt, and
    // Error('wrong-round') when it shows another round. Writes nothing, asks nothing
    // of the network or of location.
    // ---------------------------------------------------------------------------
    function render(roundData, opts) {
        var o = opts || {};
        return new Promise(function (resolve, reject) {
            var doc = o.doc || W.document;
            var rec = null;
            try { rec = extract(doc); } catch (e) { rec = null; }
            if (!rec) { reject(new Error('not-ready')); return; }
            if (o.code) rec.code = String(o.code).toUpperCase();
            if (!sameRound(roundData, rec)) { reject(new Error('wrong-round')); return; }
            var model = layout(rec, measurer());
            var cv = W.document.createElement('canvas');
            if (!draw(model, cv)) { reject(new Error('no-canvas')); return; }
            var dataUrl = cv.toDataURL('image/png');
            var done = function (blob) {
                resolve({ blob: blob || null, dataUrl: dataUrl, width: cv.width, height: cv.height, name: slug(rec), text: cv.__recapText, record: rec });
            };
            try { cv.toBlob(done, 'image/png'); } catch (e) { done(null); }
        });
    }

    W.HardPanRecap = { render: render, extract: extract, layout: layout, draw: draw,
        _approxMeasure: approxMeasure, _wrap: wrap, _fitText: fitText, _nameFont: nameFont, _scaleFor: scaleFor, PALETTE: C };
})(typeof window !== 'undefined' ? window : this);
