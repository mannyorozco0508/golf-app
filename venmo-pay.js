// ============================================================================
// HardPan — PAY WITH VENMO (gps-venmo, 2026-10-11). DISPLAY ONLY.
//
// On the Results page: each "X → Y $N" in Who Pays Who, and each "X pays Y" on
// the Bingo Bango Bongo / Vegas cards, gets a "Pay with Venmo" link - shown only
// to X (the golfer this phone is: the scorecard's "This is me"), and only when Y
// has a Venmo username. No money moves through the app, there is no payment API,
// and nothing about a payment is stored; "Mark paid" lives on this phone only.
// settlement-engine.js and every money engine are untouched: this reads the
// rendered lines and adds a link beside them.
//
// USERNAMES (shared, so the payer can see the payee's):
//   trips/<trip>/venmo/<golfer name key> = "username"   - a round in a trip
//   events/<round>/venmo/<playerId>      = "username"   - a round not in a trip
// Both are writable under the current rules; no rules change.
//
// LINKS (checked 2026-10-11):
//   app  https://venmo.com/u/<user>?txn=pay&amount=N&note=...   Venmo's iOS app
//        claims /u/* (its apple-app-site-association), so a tap opens the app.
//   web  https://account.venmo.com/pay?txn=pay&recipients=<user>&amount=N&note=...
//        live: signs in and keeps the payment details.
//   NOT venmo://paycharge - reported broken for usernames since 2024.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function norm(n) { return String(n == null ? '' : n).trim().toLowerCase(); }
    // A Firebase key from a golfer's name: lower case, no . # $ [ ] /
    function nameKey(n) { return norm(n).replace(/[.#$\[\]\/]/g, '_').replace(/\s+/g, ' ').slice(0, 60); }
    // "@Manny-Orozco " -> "Manny-Orozco"; null when it can't be a Venmo username.
    function cleanUser(u) {
        var s = String(u == null ? '' : u).trim().replace(/^@+/, '').trim();
        return /^[A-Za-z0-9_-]{2,30}$/.test(s) ? s : null;
    }
    function amountText(a) { var n = Math.round(Number(a) * 100) / 100; return n % 1 ? n.toFixed(2) : String(n); }
    function links(user, amount, note) {
        var u = encodeURIComponent(user), q = 'txn=pay&amount=' + amountText(amount) + '&note=' + encodeURIComponent(note || 'HardPan');
        return { app: 'https://venmo.com/u/' + u + '?' + q, web: 'https://account.venmo.com/pay?' + q.replace('txn=pay&', 'txn=pay&recipients=' + u + '&') };
    }
    // Payee's username: the trip's list by name, else the round's by player id.
    function userFor(name, ctx) {
        var t = ctx.tripVenmo || {}, r = ctx.roundVenmo || {};
        if (t[nameKey(name)]) return cleanUser(t[nameKey(name)]);
        var p = (ctx.players || []).filter(function (x) { return norm(x.name) === norm(name); })[0];
        return p && r[String(p.id)] ? cleanUser(r[String(p.id)]) : null;
    }

    // ---- THE RESULTS PAGE ------------------------------------------------------
    var S = { db: null, code: null, data: null, tripCode: null, tripName: null, tripVenmo: {}, tripRef: null, looked: null };
    function meId() {
        var q = null;
        try { q = new URLSearchParams(W.location.search).get('me'); } catch (e) {}
        var id = q || (function () { try { return W.localStorage.getItem('golfapp_me_' + S.code); } catch (e) { return null; } })();
        var ps = (S.data && S.data.players) || [];
        return ps.some(function (p) { return String(p.id) === String(id); }) ? String(id) : null;
    }
    function me() { var id = meId(); return ((S.data && S.data.players) || []).filter(function (p) { return String(p.id) === id; })[0] || null; }
    function paidKey(from, to, amt) { return 'hardpan_venmo_paid_' + S.code + '_' + nameKey(from) + '_' + nameKey(to) + '_' + amountText(amt); }
    function isPaid(k) { try { return W.localStorage.getItem(k) === '1'; } catch (e) { return false; } }

    // The trip this round is in: the round says so, or the trip last opened on this
    // phone lists it. Read once per round.
    function findTrip() {
        if (S.looked === S.code) return;
        S.looked = S.code;
        var direct = S.data && S.data.tripCode;
        var last = null;
        try { last = W.localStorage.getItem('lastTripCode'); } catch (e) {}
        var use = function (t) {
            if (!t || !S.db) return;
            S.tripCode = String(t);
            S.db.ref('trips/' + S.tripCode + '/name').once('value').then(function (s) { S.tripName = s && s.val(); draw(); }, function () {});
            S.tripRef = S.db.ref('trips/' + S.tripCode + '/venmo');
            S.tripRef.on('value', function (s) { S.tripVenmo = (s && s.val()) || {}; draw(); });
        };
        if (direct) { use(direct); return; }
        if (last && S.db) S.db.ref('trips/' + last + '/rounds/' + S.code).once('value').then(function (s) { if (s && s.exists && s.exists()) use(last); }, function () {});
    }
    function ctx() { return { tripVenmo: S.tripVenmo, roundVenmo: (S.data && S.data.venmo) || {}, players: (S.data && S.data.players) || [] }; }

    function payHtml(from, to, amt) {
        var m = me();
        if (!m || norm(m.name) !== norm(from) || !(Number(amt) > 0)) return '';
        var user = userFor(to, ctx());
        if (!user) return '<div class="vm-line vm-ask">Ask ' + esc(to) + ' to add their Venmo in their profile.</div>';
        var note = 'HardPan · ' + (S.tripName || (S.data && S.data.eventName) || 'golf');
        var L = links(user, amt, note), k = paidKey(from, to, amt), paid = isPaid(k);
        return '<div class="vm-line">'
            + '<a class="vm-pay" href="' + esc(L.app) + '" target="_blank" rel="noopener">Pay $' + esc(amountText(amt)) + ' with Venmo</a>'
            + ' <a class="vm-web" href="' + esc(L.web) + '" target="_blank" rel="noopener">web</a>'
            + ' <button type="button" class="vm-paid" data-vm-paid="' + esc(k) + '" aria-pressed="' + paid + '">' + (paid ? '✓ Paid' : 'Mark paid') + '</button></div>';
    }
    // The rendered lines, read as written: "X → Y" / "$N" (Who Pays Who) and the
    // BBB / Vegas cards' "X pays Y" / "$N".
    function decorate(root) {
        root = root || W.document;
        Array.prototype.forEach.call(root.querySelectorAll('.vm-line'), function (el) { el.parentNode.removeChild(el); });
        Array.prototype.forEach.call(root.querySelectorAll('.settle-card'), function (card) {
            var head = card.querySelector('.settle-header');
            var wpw = head && /who pays who/i.test(head.textContent);
            var exg = card.classList.contains('exg-settle');
            if (!wpw && !exg) return;
            Array.prototype.forEach.call(card.querySelectorAll('.ledger-row'), function (row) {
                var spans = row.querySelectorAll('span');
                if (spans.length < 2) return;
                var who = spans[0].textContent, amt = parseFloat(String(spans[1].textContent).replace(/[^0-9.]/g, ''));
                var m = wpw ? /^(.+?)\s*→\s*(.+)$/.exec(who) : /^(.+?) pays (.+)$/.exec(who);
                if (!m) return;
                var h = payHtml(m[1].trim(), m[2].trim(), amt);
                if (h) row.insertAdjacentHTML('afterend', h);
            });
        });
        mine(root);
    }
    // "Your Venmo" (and "Which one are you?") - under Who Pays Who.
    function mine(root) {
        var old = root.getElementById ? root.getElementById('vm-mine') : null;
        if (old) old.parentNode.removeChild(old);
        var host = root.getElementById && root.getElementById('combined-settlement-summary');
        var ps = (S.data && S.data.players) || [];
        if (!host || ps.length < 2) return;
        var m = me(), h;
        if (!m) {
            h = '<div class="settle-card" id="vm-mine"><div class="settle-header">Venmo</div><div style="font-size:.85rem;margin:4px 0;">Which one are you? (for Pay with Venmo on your lines)</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + ps.map(function (p) { return '<button type="button" class="vm-me" data-vm-me="' + esc(p.id) + '">' + esc(p.name) + '</button>'; }).join('') + '</div></div>';
        } else {
            var cur = S.tripCode ? (S.tripVenmo || {})[nameKey(m.name)] : ((S.data && S.data.venmo) || {})[String(m.id)];
            h = '<div class="settle-card" id="vm-mine"><div class="settle-header">Your Venmo · ' + esc(m.name) + '</div>'
                + '<div style="font-size:.78rem;opacity:.8;margin:2px 0 6px;">So the golfers who owe you can tap Pay with Venmo. ' + (S.tripCode ? 'Shared with this trip.' : 'Shared with this round.') + '</div>'
                + '<div style="display:flex;gap:6px;align-items:center;"><span>@</span><input type="text" id="vm-user" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Venmo username" value="' + esc(cur || '') + '" style="flex:1;min-width:0;">'
                + '<button type="button" class="vm-save">Save</button></div><div id="vm-status" role="status" style="font-size:.78rem;margin-top:4px;"></div>'
                + '<button type="button" class="vm-me-clear" style="margin-top:6px;border:0;background:none;color:var(--text-muted);font-size:.78rem;">Not ' + esc(m.name) + '?</button></div>';
        }
        host.insertAdjacentHTML('beforeend', h);
    }
    function save() {
        var m = me(), el = W.document.getElementById('vm-user'), st = W.document.getElementById('vm-status');
        if (!m || !el || !S.db) return;
        var raw = el.value, u = raw.trim() === '' ? null : cleanUser(raw);
        if (raw.trim() !== '' && !u) { if (st) st.textContent = 'That doesn’t look like a Venmo username (letters, numbers, - and _).'; return; }
        var path = S.tripCode ? 'trips/' + S.tripCode + '/venmo/' + nameKey(m.name) : 'events/' + S.code + '/venmo/' + m.id;
        S.db.ref(path).set(u).then(function () { if (st) st.textContent = u ? '✓ Saved: @' + u : 'Removed'; }, function (e) { if (st) st.textContent = 'Not saved: ' + (e && e.message || e); });
    }
    function onClick(ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var b;
        if ((b = t.closest('[data-vm-paid]'))) { var k = b.getAttribute('data-vm-paid'); try { if (isPaid(k)) W.localStorage.removeItem(k); else W.localStorage.setItem(k, '1'); } catch (e) {} draw(); return; }
        if ((b = t.closest('[data-vm-me]'))) { try { W.localStorage.setItem('golfapp_me_' + S.code, b.getAttribute('data-vm-me')); } catch (e) {} draw(); return; }
        if (t.closest('.vm-me-clear')) { try { W.localStorage.removeItem('golfapp_me_' + S.code); } catch (e) {} draw(); return; }
        if (t.closest('.vm-save')) save();
    }
    var bound = false;
    function draw() { try { decorate(W.document); } catch (e) { /* the page stays as it was */ } }
    // Called by settlement.html after every render of the round.
    function onRound(db, code, data) {
        S.db = db; S.code = code; S.data = data || {};
        if (!bound && W.document) { bound = true; W.document.addEventListener('click', onClick); }
        findTrip();
        draw();
    }
    W.HardPanVenmo = { nameKey: nameKey, cleanUser: cleanUser, links: links, userFor: userFor, amountText: amountText, onRound: onRound, decorate: decorate, _state: function () { return S; } };
})();
