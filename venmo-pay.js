// ============================================================================
// HardPan - SETTLE UP WITH VENMO / CASH APP (2.1 part D; from the parked
// gps-venmo branch, b4fdf29 + 7b73602). LINKS ONLY.
//
// On the Results page (settlement.html), once the round is final: one "Settle up"
// card with the FEWEST PAYMENTS, read from what the page already shows - the
// Who Pays Who lines (money-engine's simplifyDebts output, used exactly as is)
// and, when the round has Bingo Bango Bongo / Vegas, their "X pays Y" lines kept
// SEPARATE, under their own game, exactly as their cards say ("Settle this game
// separately") - never netted into Who Pays Who (URGENT-045, Manny's default).
// Nothing here computes a result: settlement-engine.js and every money engine
// are untouched; this reads the rendered lines.
//
// Per payment, for the golfer this phone is ("This is me": golfapp_me_<round>):
//   You pay Y  -> "Pay with Venmo" (Y's Venmo) / "Cash App" (Y's cashtag)
//   X pays you -> "Request on Venmo" (X's Venmo)
//   either     -> "✓ Mark paid" - stored on the round, so the whole group sees it.
// Each link opens Venmo / Cash App with the person, the amount and the note
// "HardPan · <course> <date>" filled in. The golfer confirms in that app. No
// money passes through HardPan, there is no payment API, and nothing about a
// payment is stored except the group's "paid" tick.
//
// WORDING: "Settle up" / "Square up". Never the words for staking money - the
// test reads this file's strings for them.
//
// WHERE. URGENT-045 re-check of the LIVE rules (/.settings/rules, 2026-10-20): the
// ORGANIZER's phone can write all of these; another golfer's phone is REFUSED on an
// owned round and on a trip (database.rules.json in the repo was out of date). The
// additive rules change is a PROPOSAL only: docs/045-venmo-rules-proposal.md. Until
// it is published, a refused write says so on the card (nothing breaks):
//   events/<round>/venmo/<playerId>    = "username"   a round not in a trip
//   events/<round>/cashapp/<playerId>  = "cashtag"
//   trips/<trip>/venmo/<name key>      = "username"   a round in a trip
//   trips/<trip>/cashapp/<name key>    = "cashtag"
//   events/<round>/settleUp/<from~to~cents> = { by: <playerId>, at: <ms> }   Who Pays Who
//   events/<round>/settleUp/<game~from~to~cents>  (game = bbb | vegas)       a game's own line
// THE PROFILE: the golfer's own usernames are kept on this phone
// (hardpan_pay_profile) and shared into a round only once this phone knows which
// golfer it is in that round. No location, nothing else.
//
// LINKS (checked 2026-10-11 on gps-venmo):
//   Venmo pay      https://venmo.com/u/<user>?txn=pay&amount=N&note=...
//   Venmo request  https://venmo.com/u/<user>?txn=charge&amount=N&note=...
//                  Venmo's iOS app claims /u/* (apple-app-site-association).
//                  NOT venmo://paycharge (reported broken for usernames since 2024).
//   Cash App       https://cash.app/$<cashtag>/N  (Cash App takes no note in a link)
//
// SWITCH: gps-config.js venmo (false = nothing at all on the page).
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function norm(n) { return String(n == null ? '' : n).trim().toLowerCase(); }
    // A Firebase key from a golfer's name: lower case, no . # $ [ ] /
    function nameKey(n) { return norm(n).replace(/[.#$\[\]\/~]/g, '_').replace(/\s+/g, ' ').slice(0, 60); }
    // "@Manny-Orozco " -> "Manny-Orozco"; null when it can't be a Venmo username.
    function cleanUser(u) {
        var s = String(u == null ? '' : u).trim().replace(/^@+/, '').trim();
        return /^[A-Za-z0-9_-]{2,30}$/.test(s) ? s : null;
    }
    // "$Manny22 " -> "Manny22"; a cashtag is 1-20 letters / numbers / - _ with a letter in it.
    function cleanCash(u) {
        var s = String(u == null ? '' : u).trim().replace(/^\$+/, '').trim();
        return /^[A-Za-z0-9_-]{1,20}$/.test(s) && /[A-Za-z]/.test(s) ? s : null;
    }
    function amountText(a) { var n = Math.round(Number(a) * 100) / 100; return n % 1 ? n.toFixed(2) : String(n); }
    function cents(a) { return Math.round(Number(a) * 100); }

    // ---- THE LINKS ---------------------------------------------------------------
    function venmoLink(user, amount, note, request) {
        return 'https://venmo.com/u/' + encodeURIComponent(user) + '?txn=' + (request ? 'charge' : 'pay')
            + '&amount=' + amountText(amount) + '&note=' + encodeURIComponent(note || 'HardPan');
    }
    function cashLink(tag, amount) { return 'https://cash.app/$' + encodeURIComponent(tag) + '/' + amountText(amount); }
    // Kept for the parked branch's callers: { app, web } for a Venmo payment.
    function links(user, amount, note) {
        var app = venmoLink(user, amount, note, false);
        return { app: app, web: 'https://account.venmo.com/pay?txn=pay&recipients=' + encodeURIComponent(user) + '&amount=' + amountText(amount) + '&note=' + encodeURIComponent(note || 'HardPan') };
    }

    // ---- THE NOTE: "HardPan · <course> <date>" -------------------------------------
    function dateLabel(data, now) {
        var d = null, v = data && (data.date || data.roundDate);
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
        if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        else if (data && typeof data.createdAt === 'number') d = new Date(data.createdAt);
        if (!d || isNaN(d.getTime())) d = new Date(now == null ? Date.now() : now);
        return MONTHS[d.getMonth()] + ' ' + d.getDate();
    }
    function courseLabel(data) { return String((data && data.courseName) || 'Golf').replace(/\s+/g, ' ').trim().slice(0, 48); }
    function noteFor(data, now) { return 'HardPan · ' + courseLabel(data) + ' ' + dateLabel(data, now); }

    // ---- THE PAYMENTS, FROM THE PAGE'S OWN LINES -------------------------------------
    // lines: [{ from, to, amount, src: 'wpw' | 'exg', game?, gameLabel? }]. Who Pays Who
    // is already the fewest payments (simplifyDebts) and is returned AS IS. A BBB /
    // Vegas line is returned AS IS too, with its game: those games are settled
    // separately (their cards say so), so nothing is netted or combined.
    function fewest(lines) {
        lines = (lines || []).filter(function (l) { return l && l.from && l.to && norm(l.from) !== norm(l.to) && cents(l.amount) > 0; });
        var wpw = lines.filter(function (l) { return l.src !== 'exg'; }), exg = lines.filter(function (l) { return l.src === 'exg'; });
        return wpw.map(function (l) { return { from: l.from, to: l.to, amount: cents(l.amount) / 100 }; })
            .concat(exg.map(function (l) { return { from: l.from, to: l.to, amount: cents(l.amount) / 100, game: l.game || 'game', gameLabel: l.gameLabel || 'Other game' }; }));
    }
    // The rendered lines, read as written: Who Pays Who's "X → Y" / "$N" and the
    // BBB / Vegas cards' "X pays Y" / "$N". URGENT-045: on the #31 receipt (option A,
    // html.hp-rcpt) Who Pays Who is the receipt's own "Settle up" block
    // (.hp-rc-settle .hp-rc-pay, the same transactions), read the same way.
    function readLines(root) {
        var out = [];
        Array.prototype.forEach.call(root.querySelectorAll('.hp-rc-settle .hp-rc-pay'), function (row) {
            if (row.closest && row.closest('#vm-mount')) return;
            var spans = row.querySelectorAll('span');
            if (spans.length < 2) return;
            var m = /^(.+?)\s*→\s*(.+)$/.exec(spans[0].textContent), amt = parseFloat(String(spans[1].textContent).replace(/[^0-9.]/g, ''));
            if (m && amt > 0) out.push({ from: m[1].trim(), to: m[2].trim(), amount: amt, src: 'wpw' });
        });
        Array.prototype.forEach.call(root.querySelectorAll('.settle-card'), function (card) {
            if (card.closest && card.closest('#vm-mount')) return;
            var head = card.querySelector('.settle-header');
            var wpw = !!(head && /who pays who/i.test(head.textContent));
            var exg = card.classList.contains('exg-settle');
            if (!wpw && !exg) return;
            var gameLabel = exg && head ? head.textContent.split(' · ')[0].trim() : '';
            var game = /bingo|bbb/i.test(gameLabel) ? 'bbb' : /vegas/i.test(gameLabel) ? 'vegas' : 'game';
            Array.prototype.forEach.call(card.querySelectorAll('.ledger-row'), function (row) {
                var spans = row.querySelectorAll('span');
                if (spans.length < 2) return;
                var who = spans[0].textContent, amt = parseFloat(String(spans[1].textContent).replace(/[^0-9.]/g, ''));
                var m = wpw ? /^(.+?)\s*→\s*(.+)$/.exec(who) : /^(.+?) pays (.+)$/.exec(who);
                if (!m || !(amt > 0)) return;
                var l = { from: m[1].trim(), to: m[2].trim(), amount: amt, src: wpw ? 'wpw' : 'exg' };
                if (!wpw) { l.game = game; l.gameLabel = gameLabel; }
                out.push(l);
            });
        });
        return out;
    }
    // A game's own line gets its game in front, so it never shares a tick with a
    // Who Pays Who line of the same golfers and amount.
    function payKey(from, to, amount, game) { return (game ? game + '~' : '') + nameKey(from) + '~' + nameKey(to) + '~' + cents(amount); }
    function keyOf(p) { return payKey(p.from, p.to, p.amount, p.game); }

    // Usernames for a golfer: the trip's list by name first, else the round's by player id.
    function handlesFor(name, ctx) {
        var p = (ctx.players || []).filter(function (x) { return norm(x.name) === norm(name); })[0];
        var pid = p ? String(p.id) : null, k = nameKey(name);
        var pick = function (trip, round, clean) {
            if (trip && trip[k] && clean(trip[k])) return clean(trip[k]);
            return pid && round && round[pid] ? clean(round[pid]) : null;
        };
        return { venmo: pick(ctx.tripVenmo, ctx.roundVenmo, cleanUser), cashapp: pick(ctx.tripCash, ctx.roundCash, cleanCash) };
    }
    function userFor(name, ctx) { return handlesFor(name, ctx).venmo; }

    // ---- THIS PHONE'S PROFILE (Venmo / Cash App, optional) ---------------------------
    var PROFILE = 'hardpan_pay_profile';
    function getProfile() {
        try { var p = JSON.parse(W.localStorage.getItem(PROFILE) || '{}') || {}; return { venmo: cleanUser(p.venmo), cashapp: cleanCash(p.cashapp) }; } catch (e) { return { venmo: null, cashapp: null }; }
    }
    function setProfile(p) {
        var v = { venmo: cleanUser(p && p.venmo), cashapp: cleanCash(p && p.cashapp) };
        try { if (v.venmo || v.cashapp) W.localStorage.setItem(PROFILE, JSON.stringify(v)); else W.localStorage.removeItem(PROFILE); } catch (e) {}
        return v;
    }
    function enabled() { var c = W.HARDPAN_GPS_CONFIG; return !(c && c.venmo === false); }

    // ---- THE RESULTS PAGE ------------------------------------------------------
    var S = { db: null, code: null, data: null, tripCode: null, tripName: null, tripVenmo: {}, tripCash: {}, looked: null, shared: null, msg: '', pending: {} };
    function players() { return (S.data && S.data.players) || []; }
    function meId() {
        var q = null;
        try { q = new URLSearchParams(W.location.search).get('me'); } catch (e) {}
        var id = q || (function () { try { return W.localStorage.getItem('golfapp_me_' + S.code); } catch (e) { return null; } })();
        return players().some(function (p) { return String(p.id) === String(id); }) ? String(id) : null;
    }
    function me() { var id = meId(); return players().filter(function (p) { return String(p.id) === id; })[0] || null; }
    function ctx() {
        var d = S.data || {};
        return { tripVenmo: S.tripCode ? S.tripVenmo : {}, tripCash: S.tripCode ? S.tripCash : {}, roundVenmo: d.venmo || {}, roundCash: d.cashapp || {}, players: players() };
    }
    function paidMark(k) { if (Object.prototype.hasOwnProperty.call(S.pending, k)) return S.pending[k]; var s = (S.data && S.data.settleUp) || {}; return s[k] || null; }

    // The trip this round is in: the round says so, or the trip last opened on this
    // phone lists it. Read once per round.
    function findTrip() {
        if (S.looked === S.code) return;
        S.looked = S.code;
        var direct = S.data && S.data.tripCode, last = null;
        try { last = W.localStorage.getItem('lastTripCode'); } catch (e) {}
        var use = function (t) {
            if (!t || !S.db) return;
            S.tripCode = String(t);
            S.db.ref('trips/' + S.tripCode + '/name').once('value').then(function (s) { S.tripName = s && s.val(); }, function () {});
            S.db.ref('trips/' + S.tripCode + '/venmo').on('value', function (s) { S.tripVenmo = (s && s.val()) || {}; draw(); });
            S.db.ref('trips/' + S.tripCode + '/cashapp').on('value', function (s) { S.tripCash = (s && s.val()) || {}; draw(); });
        };
        if (direct) { use(direct); return; }
        if (last && S.db) S.db.ref('trips/' + last + '/rounds/' + S.code).once('value').then(function (s) { if (s && s.exists && s.exists()) use(last); }, function () {});
    }
    function pathsFor(m) {
        return S.tripCode
            ? { venmo: 'trips/' + S.tripCode + '/venmo/' + nameKey(m.name), cashapp: 'trips/' + S.tripCode + '/cashapp/' + nameKey(m.name) }
            : { venmo: 'events/' + S.code + '/venmo/' + m.id, cashapp: 'events/' + S.code + '/cashapp/' + m.id };
    }
    function shareHandles(m, v) {
        var P = pathsFor(m);
        return Promise.all([S.db.ref(P.venmo).set(v.venmo || null), S.db.ref(P.cashapp).set(v.cashapp || null)]);
    }
    // The golfer added their usernames once (on any round): this round's group gets
    // them too - only on a phone that knows which golfer it is here.
    function autoShare() {
        var m = me();
        if (!m || !S.db || S.shared === S.code + ':' + m.id) return;
        var prof = getProfile();
        if (!prof.venmo && !prof.cashapp) return;
        var have = handlesFor(m.name, ctx());
        S.shared = S.code + ':' + m.id;
        if ((prof.venmo || null) === have.venmo && (prof.cashapp || null) === have.cashapp) return;
        var P = pathsFor(m), w = [];
        if (prof.venmo && !have.venmo) w.push(S.db.ref(P.venmo).set(prof.venmo));
        if (prof.cashapp && !have.cashapp) w.push(S.db.ref(P.cashapp).set(prof.cashapp));
        w.forEach(function (p) { if (p && p.catch) p.catch(function () {}); });
    }

    function btn(cls, href, label) { return '<a class="vm-btn ' + cls + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>'; }
    function rowHtml(p, m, note) {
        var c = ctx(), k = keyOf(p), mark = paidMark(k);
        var iPay = !!m && norm(m.name) === norm(p.from), iGet = !!m && norm(m.name) === norm(p.to);
        var who = iPay ? 'You pay ' + esc(p.to) : iGet ? esc(p.from) + ' pays you' : esc(p.from) + ' pays ' + esc(p.to);
        var cls = iPay ? 'vm-owe' : iGet ? 'vm-get' : '';
        var by = mark && players().filter(function (x) { return String(x.id) === String(mark.by); })[0];
        var h = '<div class="vm-row' + (mark ? ' vm-done' : '') + '" data-vm-row="' + esc(k) + '"><div class="vm-head"><span class="vm-who">' + who + '</span><span class="vm-amt ' + cls + '">$' + esc(amountText(p.amount)) + '</span></div>';
        if (mark) h += '<div class="vm-state">✓ Paid' + (by ? ' · marked by ' + esc(by.name) : '') + '</div>';
        var acts = [];
        if (iPay && !mark) {
            var to = handlesFor(p.to, c);
            if (to.venmo) acts.push(btn('vm-venmo', venmoLink(to.venmo, p.amount, note, false), 'Pay with Venmo'));
            if (to.cashapp) acts.push(btn('vm-cash', cashLink(to.cashapp, p.amount), 'Cash App'));
            if (!to.venmo && !to.cashapp) h += '<div class="vm-ask">Ask ' + esc(p.to) + ' to add their Venmo or Cash App on this page.</div>';
        }
        if (iGet && !mark) {
            var from = handlesFor(p.from, c);
            if (from.venmo) acts.push(btn('vm-req', venmoLink(from.venmo, p.amount, note, true), 'Request on Venmo'));
        }
        if (iPay || iGet) acts.push('<button type="button" class="vm-btn vm-paid" data-vm-paid="' + esc(k) + '" aria-pressed="' + !!mark + '">' + (mark ? 'Undo paid' : '✓ Mark paid') + '</button>');
        if (acts.length) h += '<div class="vm-acts">' + acts.join('') + '</div>';
        return h + '</div>';
    }
    function settleHtml(pays, m) {
        var note = noteFor(S.data);
        var isMine = function (p) { return !!m && (norm(p.from) === norm(m.name) || norm(p.to) === norm(m.name)); };
        var done = pays.filter(function (p) { return paidMark(keyOf(p)); }).length;
        var wpw = pays.filter(function (p) { return !p.game; });
        var mine = wpw.filter(isMine), rest = wpw.filter(function (p) { return !isMine(p); });
        // On the #31 receipt the block above is already called "Settle up".
        var rc = !!(W.document && W.document.querySelector('.hp-rc-settle'));
        var h = '<div class="settle-card vm-settle" id="vm-settle"><div class="settle-header">' + (rc ? 'Square up with Venmo / Cash App' : 'Settle up') + '</div>'
            + '<div class="vm-sub">' + esc(courseLabel(S.data)) + ' · ' + esc(dateLabel(S.data)) + ' · ' + (wpw.length ? 'fewest payments · ' : '') + done + ' of ' + pays.length + ' paid</div>'
            + mine.map(function (p) { return rowHtml(p, m, note); }).join('')
            + (rest.length ? (mine.length ? '<div class="vm-group">The rest of the group</div>' : '') + rest.map(function (p) { return rowHtml(p, m, note); }).join('') : '');
        // BBB / Vegas: their own lines, under their own game, as their cards say.
        var games = [];
        pays.forEach(function (p) { if (p.game && games.indexOf(p.gameLabel) < 0) games.push(p.gameLabel); });
        games.forEach(function (g) {
            var gp = pays.filter(function (p) { return p.game && p.gameLabel === g; });
            gp = gp.filter(isMine).concat(gp.filter(function (p) { return !isMine(p); }));
            h += '<div class="vm-group vm-game">' + esc(g) + ' · settled separately</div>' + gp.map(function (p) { return rowHtml(p, m, note); }).join('');
        });
        return h + (S.refusedMsg ? '<div class="vm-ask" role="status">' + esc(S.refusedMsg) + '</div>' : '')
            + '<div class="vm-foot">Opens Venmo or Cash App with the person, amount and note (“' + esc(note) + '”) filled in. You confirm there. No money passes through HardPan.</div></div>';
    }
    function profileHtml(m) {
        var ps = players();
        if (!m) {
            return '<div class="settle-card vm-mine" id="vm-mine"><div class="settle-header">Which one are you?</div><div class="vm-sub">So your own payments show Pay with Venmo / Cash App.</div>'
                + '<div class="vm-acts">' + ps.map(function (p) { return '<button type="button" class="vm-btn vm-me" data-vm-me="' + esc(p.id) + '">' + esc(p.name) + '</button>'; }).join('') + '</div></div>';
        }
        var cur = handlesFor(m.name, ctx()), prof = getProfile();
        return '<div class="settle-card vm-mine" id="vm-mine"><div class="settle-header">Your Venmo / Cash App</div>'
            + '<div class="vm-sub">' + esc(m.name) + ' · optional. So the golfers who owe you can square up in one tap. Kept on this phone for your next rounds and shared with this ' + (S.tripCode ? 'trip' : 'round') + '’s group.</div>'
            + '<label class="vm-field"><span>@</span><input type="text" id="vm-user" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Venmo username" value="' + esc(cur.venmo || prof.venmo || '') + '"></label>'
            + '<label class="vm-field"><span>$</span><input type="text" id="vm-cash" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Cash App $cashtag" value="' + esc(cur.cashapp || prof.cashapp || '') + '"></label>'
            + '<div class="vm-acts"><button type="button" class="vm-btn vm-save">Save</button><button type="button" class="vm-btn vm-me-clear">Not ' + esc(m.name) + '?</button></div>'
            + '<div id="vm-status" role="status" class="vm-sub">' + esc(S.msg) + '</div></div>';
    }
    function mount(root) {
        var host = root.getElementById('vm-mount');
        if (host) return host;
        var anchor = root.getElementById('combined-settlement-summary');
        if (!anchor || !anchor.parentNode) return null;
        host = root.createElement('div'); host.id = 'vm-mount';
        anchor.parentNode.insertBefore(host, anchor.nextSibling);
        return host;
    }
    // Its own mount, right after Who Pays Who: every Results section keeps its exact
    // text, and the PDF (which reads the Results mounts by id) never carries a link.
    function render(root) {
        root = root || W.document;
        var host = mount(root);
        if (!host) return;
        var pays = enabled() ? fewest(readLines(root)) : [];
        if (!pays.length || players().length < 2) { host.innerHTML = ''; return; }
        var m = me();
        host.innerHTML = settleHtml(pays, m) + profileHtml(m);
    }
    function save() {
        var m = me(), d = W.document, el = d.getElementById('vm-user'), ec = d.getElementById('vm-cash');
        if (!m || !el || !ec || !S.db) return;
        var rv = el.value.trim(), rc = ec.value.trim(), v = cleanUser(rv), c = cleanCash(rc);
        var st = d.getElementById('vm-status');
        if (rv && !v) { if (st) st.textContent = 'That doesn’t look like a Venmo username (letters, numbers, - and _).'; return; }
        if (rc && !c) { if (st) st.textContent = 'That doesn’t look like a Cash App $cashtag (up to 20 letters and numbers).'; return; }
        setProfile({ venmo: v, cashapp: c });
        S.shared = S.code + ':' + m.id;
        shareHandles(m, { venmo: v, cashapp: c }).then(function () {
            S.msg = (v || c) ? '✓ Saved' + (v ? ' · Venmo @' + v : '') + (c ? ' · Cash App $' + c : '') : 'Removed';
            var s2 = W.document.getElementById('vm-status'); if (s2) s2.textContent = S.msg;
        }, function (e) {
            S.msg = refused(e) ? 'Kept on this phone. The group can’t see it yet: only the organizer’s phone can save it to this ' + (S.tripCode ? 'trip' : 'round') + ' for now.' : 'Not saved: ' + (e && e.message || e);
            var s2 = W.document.getElementById('vm-status'); if (s2) s2.textContent = S.msg;
        });
    }
    function markPaid(k) {
        var m = me();
        if (!m || !S.db || !/^[^.#$\[\]\/]+$/.test(k)) return;
        var cur = paidMark(k);
        var v = cur ? null : { by: String(m.id), at: Date.now() };
        // Shown at once (the round itself is not touched here); the round's own
        // listener brings everyone's phone the same tick.
        S.pending[k] = v;
        draw();
        var p = S.db.ref('events/' + S.code + '/settleUp/' + k).set(v);
        // Refused (today's live rules: only the organizer's phone): the tick goes back
        // and the card says why, instead of a tick that vanishes on the next update.
        if (p && p.catch) p.catch(function (e) {
            delete S.pending[k];
            S.refusedMsg = refused(e) ? 'Only the organizer’s phone can mark payments for now.' : 'Not saved: ' + (e && e.message || e);
            draw();
        });
    }
    function refused(e) { return /permission|denied/i.test(String((e && (e.code || e.message)) || e)); }
    function onClick(ev) {
        var t = ev.target;
        if (!t || !t.closest || !t.closest('#vm-mount')) return;
        var b;
        if ((b = t.closest('[data-vm-paid]'))) { markPaid(b.getAttribute('data-vm-paid')); return; }
        if ((b = t.closest('[data-vm-me]'))) { try { W.localStorage.setItem('golfapp_me_' + S.code, b.getAttribute('data-vm-me')); } catch (e) {} S.msg = ''; autoShare(); draw(); return; }
        if (t.closest('.vm-me-clear')) { try { W.localStorage.removeItem('golfapp_me_' + S.code); } catch (e) {} S.msg = ''; draw(); return; }
        if (t.closest('.vm-save')) save();
    }
    var CSS = '#vm-mount .vm-sub{font-size:.78rem;color:var(--text-muted);margin:2px 0 8px;}'
        + '#vm-mount .vm-row{padding:10px 0;border-top:1px solid var(--border-mid);}'
        + '#vm-mount .vm-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:800;}'
        + '#vm-mount .vm-amt.vm-owe{color:#b3261e;} #vm-mount .vm-amt.vm-get{color:#1b7a3d;}'
        + '#vm-mount .vm-done .vm-who,#vm-mount .vm-done .vm-amt{opacity:.55;}'
        + '#vm-mount .vm-state{font-size:.8rem;font-weight:700;color:var(--brand-green);margin-top:2px;}'
        + '#vm-mount .vm-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}'
        + '#vm-mount .vm-btn{flex:1 1 40%;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:12px;border:1px solid var(--border-mid);background:var(--bg-card);color:inherit;font-weight:800;font-size:.95rem;text-decoration:none;cursor:pointer;text-align:center;}'
        + '#vm-mount .vm-venmo{background:#008CFF;border-color:#008CFF;color:#fff !important;}'
        + '#vm-mount .vm-cash{background:#00C244;border-color:#00C244;color:#fff !important;}'
        + '#vm-mount .vm-req,#vm-mount .vm-paid{background:rgba(15,76,58,.1);border-color:transparent;color:var(--brand-green);}'
        + '#vm-mount .vm-paid[aria-pressed=true]{background:transparent;border-color:var(--border-mid);color:var(--text-muted);font-weight:700;}'
        + '#vm-mount .vm-me{flex:0 1 auto;} #vm-mount .vm-me-clear{flex:0 1 auto;border:0;background:none;color:var(--text-muted);font-weight:600;}'
        + '#vm-mount .vm-group{font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);margin-top:10px;}'
        + '#vm-mount .vm-ask{font-size:.82rem;color:var(--text-muted);font-style:italic;margin-top:4px;}'
        + '#vm-mount .vm-foot{font-size:.76rem;color:var(--text-muted);margin-top:10px;}'
        + '#vm-mount .vm-field{display:flex;gap:6px;align-items:center;margin:6px 0;font-weight:800;} #vm-mount .vm-field input{flex:1;min-width:0;min-height:40px;font-size:16px;}'
        + '@media print{#vm-mount{display:none !important;}}';
    function style() {
        if (W.document.getElementById('vm-style')) return;
        var st = W.document.createElement('style'); st.id = 'vm-style'; st.textContent = CSS;
        W.document.head.appendChild(st);
    }
    var bound = false;
    function draw() {
        // Typing in a box is never wiped by a redraw from another phone's write.
        var a = W.document.activeElement;
        if (a && (a.id === 'vm-user' || a.id === 'vm-cash')) return;
        try { render(W.document); } catch (e) { /* the page stays as it was */ }
    }
    // Called by settlement.html after every render of the round.
    function onRound(db, code, data) {
        if (!enabled()) { var h = W.document && W.document.getElementById('vm-mount'); if (h) h.innerHTML = ''; return; }
        if (S.code !== code) { S.tripCode = null; S.tripVenmo = {}; S.tripCash = {}; S.msg = ''; S.refusedMsg = ''; }
        S.db = db; S.code = code; S.data = data || {}; S.pending = {};
        if (!bound && W.document) { bound = true; W.document.addEventListener('click', onClick); style(); }
        findTrip();
        autoShare();
        draw();
    }
    W.HardPanVenmo = { nameKey: nameKey, cleanUser: cleanUser, cleanCash: cleanCash, links: links, venmoLink: venmoLink, cashLink: cashLink,
        userFor: userFor, handlesFor: handlesFor, amountText: amountText, noteFor: noteFor, dateLabel: dateLabel, fewest: fewest, readLines: readLines,
        payKey: payKey, keyOf: keyOf, getProfile: getProfile, setProfile: setProfile, onRound: onRound, render: render, _state: function () { return S; } };
})();
