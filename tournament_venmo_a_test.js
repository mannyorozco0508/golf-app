// ============================================================================
// VENMO A (Manny's pick 2026-11-15, ADVISOR-20261115-0919; built on preview-venmo-a
// after the phone test ADVISOR-20261115-1810 passed with the app scheme).
//
// THE SWITCH: VENMO_RULES_LIVE = false gates the two things the live rules refuse
// today - the golfer's payHandle (closed schema) and paidVia 'venmo' | 'paypal'
// (typed cash | stripe in the 2026-11-13 read-back). The pay line, the owner's
// handles and the pay-out ticks need no rules change and are live on the page.
//
// Option A puts pay links on the screens that exist: the organizer's handle on
// Setup (tournaments/<code>/payTo), "Pay your $100 buy-in to @handle" with
// Pay on Venmo / PayPal on the sign-up page, Venmo / PayPal / Cash as the Desk's
// paid tick (paidVia), and the owner's pay-out rows on a posted CASH prize
// (tournaments/<code>/prizePaidOut/<spot>). The golfer's own handle on the
// sign-up (registrations/<code>/<id>/payHandle) sits behind VENMO_RULES_LIVE =
// false until tools/venmo-rules-candidate.js is published: the entry schema is
// closed, so an unnamed key would refuse the whole sign-up.
//
// HOW EACH TEST ARRIVES: the URL a person opens (?register=CODE for a golfer,
// ?tourney=CODE for the organizer, then a TAP on the Desk tab), the page's own
// listeners fired with a record, and taps = the onclick text of the rendered
// element, run with `this` bound. The first test of each screen is the OFF
// state: an event with no handle reads as before. mini-dom: innerHTML is a
// string, no layout, static attributes unparsed; the Chrome shots in
// build-venmo-a/ are the pictures.
//
// BASELINE (final file, CLAUDE.md count rule), 2026-11-16 after Manny's two fixes
// and the switch flip: against preview-venmo-a eb616398 (tournament.html sha256
// 433b6fee..., swapped in by cp, restored by sha 77495f06): 13 tests - 5 pass /
// 8 fail. Passing there: V2, V3, V4, V8, V10 (true of the page either way).
// Failing there: V1 (switch), V5 / V6 / V7 / V9 (the ON page), V7a (no ON line to
// flip), V11 (the tile left the card payment out: $300 beside Fees collected
// $400), V12 (no tel in the input rule). On local-venmo-merge: 13 pass / 0 fail.
// Controls, each restored by sha: the tile's old filter back -> V7 + V11 red;
// tel dropped from the rule -> V12 red; the counts line counting its own way
// (paid with a method only) -> V11 red; the switch back to false -> 7 red.
// The first baseline (11 tests against main 2f732bb3, 1 pass / 10 fail; on
// preview-venmo-a 11 / 0) stands in the 2026-11-15 commit message.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');

const PAGE = 'tournament.html';
const HTML = fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');
const CODE = 'STK';
const clone = (o) => JSON.parse(JSON.stringify(o));
// THE SWITCH IS ON since the combined rules went live 2026-11-16 00:30 (the page as shipped). flipOff is the
// rollback: the page with the switch set back to false, which must write nothing the old rules would refuse.
const SWITCH_ON = 'const VENMO_RULES_LIVE = true;';
const flipOff = (code) => { const off = code.replace(SWITCH_ON, 'const VENMO_RULES_LIVE = false;'); if (off === code) throw new Error('no switch line'); return off; };

const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&rsquo;/g, '’').replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ').trim();
function onclickOf(markup, pick) {
    const tags = markup.match(/<(button|a|input|span)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    if (!tag) return null;
    const m = /\bonclick="([^"]*)"/.exec(tag);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
}
function tap(sb, markup, pick) {
    const code = onclickOf(markup, pick);
    assert.ok(code, 'nothing to tap in that markup');
    sb.__tapEl = {};
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
const byId = (id) => (tag) => new RegExp('\\bid="' + id + '"').test(tag);
const byClass = (c) => (tag) => new RegExp('class="[^"]*\\b' + c + '\\b').test(tag);
// a static input's onchange, run with this.value = v (the box the organizer types in)
function changeStatic(sb, id, v) {
    const m = new RegExp('id="' + id + '"[^>]*onchange="([^"]+)"').exec(HTML);
    assert.ok(m, 'no static onchange on #' + id);
    sb.__tapEl = { value: v };
    vm.runInContext('(function () { ' + m[1].replace(/&quot;/g, '"') + ' }).call(__tapEl)', sb);
}
const fire = (sb, re, val) => {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
};
const writes = (sb, re) => clone(sb.__dbWrites.filter((w) => re.test(w.path)));
function rowOf(markup, id) {
    const at = markup.indexOf('data-entry-id="' + id + '"');
    assert.ok(at !== -1, 'row ' + id + ' rendered');
    const next = markup.indexOf('data-entry-id="', at + 10);
    return markup.slice(at, next === -1 ? undefined : next);
}
const settle = () => new Promise((r) => setImmediate(r));

// ---- THE FIXTURE: the Starkey Cup of the prize build, $100 a golfer, the organizer's handle, five sign-ups ----
const PAY_TO = { venmo: 'Scott-Starkey', paypal: 'ScottStarkey' };
function rec(extra) { return F.starkey(Object.assign({ entryFee: 100, entryFeePer: 'golfer' }, extra || {})); }
function regs(extra) {
    const r = {
        e1: { fullName: 'Ana Diaz', email: 'ana@example.com', phone: '6025551001', createdAt: 1001, approvedAt: 2001, playerId: 'pA', paid: true, paidAt: 3001, paidVia: 'venmo' },
        e2: { fullName: 'Sam Ortiz', email: 'sam@example.com', phone: '6025551002', createdAt: 1002, approvedAt: 2002, playerId: 'pS', paid: true, paidAt: 3002, paidVia: 'cash' },
        e3: { fullName: 'Joe Fox', email: 'joe@example.com', phone: '6025551003', createdAt: 1003, approvedAt: 2003, playerId: 'pJ' },
        e4: { fullName: 'Lee Park', email: 'lee@example.com', phone: '6025551004', createdAt: 1004, approvedAt: 2004, playerId: 'pL', paid: true, paidAt: 3004, paidVia: 'paypal', payHandle: 'LeePark' },
        e5: { fullName: 'Dana Ruiz', email: 'dana@example.com', phone: '6025551005', createdAt: 1005, approvedAt: 2005, playerId: 'pD', paid: true, paidAt: 3005, paidVia: 'stripe', amountCents: 10000 }
    };
    return Object.assign(r, extra || {});
}
function arriveOwner(record, entries, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?tourney=' + CODE }, opts || {}));
    sb.__auth.setUser(F.OWNER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), record);
    if (entries !== null) fire(sb, new RegExp('^registrations/' + CODE + '$'), entries || regs());
    return sb;
}
function arriveSignup(record, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?register=' + CODE, beforeRun(s) { s.__dbReads = { ['tournaments/' + CODE]: clone(record) }; } }, opts || {}));
    return sb;
}
const deskTab = (sb) => tap(sb, HTML, byId('tab-btn-desk'));
// The owner posts the results (the page's own button), and the record comes back with them.
function postedCash(sb0) {
    const sb = sb0 || arriveOwner(rec({ prizeType: 'cash' }));
    [100, 60, 40].forEach((v, i) => { el(sb, 'payout-spot-' + i).value = String(v); });   // the owner's place boxes (mini-dom does not parse value="")
    vm.runInContext('savePayoutSpots()', sb);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), Object.assign(clone(sb.__dbWrites.find((w) => /payoutSpots$/.test(w.path)) ? rec({ prizeType: 'cash', payTo: PAY_TO, payoutSpots: [100, 60, 40] }) : rec({ prizeType: 'cash', payTo: PAY_TO })), {}));
    tap(sb, HTML, byId('prize-post-btn'));
    const w = writes(sb, /prizeResults$/);
    assert.equal(w.length, 1, 'Post results wrote once');
    const posted = clone(w[0].value); posted.postedAt = 1700000000000;
    return posted;
}

describe('V. VENMO A', () => {
    test('V1 the source: the switch is ON (the rules are live), the sentence on Setup, the Desk note, no money the page moves, no forbidden word', () => {
        assert.equal((HTML.match(/const VENMO_RULES_LIVE = true;/g) || []).length, 1);
        assert.equal((HTML.match(/const VENMO_RULES_LIVE = /g) || []).length, 1);
        assert.match(HTML, /Venmo&rsquo;s user agreement treats many entry fees into a personal account as business payments; a Venmo business profile \(1\.9% \+ \$0\.10 a payment\) is the account type for that\./);
        assert.match(HTML, /HardPan never holds or moves money; these buttons open Venmo or PayPal\./);
        assert.ok(HTML.includes("'venmo://paycharge?txn=pay&recipients='") && HTML.includes("'https://venmo.com/'") && HTML.includes("'https://www.paypal.com/paypalme/'"));
        const mine = HTML.slice(HTML.indexOf('// VENMO A (Manny'), HTML.indexOf('// ---- M3: THE DESK'));
        assert.ok(mine.length > 4000);
        assert.doesNotMatch(mine, /\b(bet|bets|wager\w*|pool|pools|protected|secure|locked|insignia)\b/i);
        assert.doesNotMatch(mine, /stripe\.|sk_live|sk_test/i);
    });

    test('V2 OFF, the organizer on the Desk with no handle on the event: the checkbox tick, the counts, no Venmo word, no method chips, no pay-out card', () => {
        const sb = arriveOwner(rec(), regs({ e1: Object.assign(regs().e1, { paidVia: null }) }));
        deskTab(sb);
        const list = html(sb, 'registration-list');
        assert.match(rowOf(list, 'e3'), /<input type="checkbox" onchange="setRegistrationPaid\('e3', this\.checked\)"> Paid/);
        assert.equal(plain(html(sb, 'registration-chips')), 'All 5 Unpaid 1 Paid 4 Approved 5 Not yet approved 0 Photos 0');
        assert.doesNotMatch(plain(html(sb, 'manage-tab-desk')), /venmo|paypal/i);
        assert.equal(html(sb, 'pay-in-tiles' in sb.document.__registry ? 'pay-in-tiles' : 'registration-counts').indexOf('in so far'), -1);
        assert.equal(el(sb, 'ev-pay-note').style.display, 'none');
        assert.equal(el(sb, 'ev-pay-venmo').value, '');
        assert.equal(el(sb, 'prize-payout-card').style.display, 'none');
        assert.deepEqual(writes(sb, /payTo|prizePaidOut|paidVia/), []);
    });

    test('V3 Setup: typing @Scott-Starkey writes payTo/venmo without the @, the note appears; a bad handle is not written; an empty box clears it', () => {
        const sb = arriveOwner(rec());
        changeStatic(sb, 'ev-pay-venmo', '@Scott-Starkey');
        changeStatic(sb, 'ev-pay-paypal', 'ScottStarkey');
        assert.deepEqual(writes(sb, /payTo/), [
            { path: 'tournaments/STK/payTo/venmo', op: 'set', value: 'Scott-Starkey' },
            { path: 'tournaments/STK/payTo/paypal', op: 'set', value: 'ScottStarkey' }]);
        sb.alert = () => {};
        changeStatic(sb, 'ev-pay-venmo', 'scott starkey!');
        assert.equal(writes(sb, /payTo/).length, 2, 'a handle with a space and a bang is not written');
        changeStatic(sb, 'ev-pay-paypal', '');
        assert.deepEqual(writes(sb, /payTo/).slice(-1), [{ path: 'tournaments/STK/payTo/paypal', op: 'set', value: null }]);
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec({ payTo: PAY_TO }));
        assert.equal(el(sb, 'ev-pay-venmo').value, '@Scott-Starkey');
        assert.equal(el(sb, 'ev-pay-note').style.display, 'block');
    });

    test('V4 the sign-up page, OFF: no pay line, no handle box, the payload as before', () => {
        const sb = arriveSignup(rec());
        return settle().then(() => {
            assert.equal(shown(sb, 'reg-form'), true);
            assert.equal(el(sb, 'reg-paylink').style.display, 'none');
            assert.equal(html(sb, 'reg-paylink'), '');
            assert.equal(el(sb, 'reg-payhandle-wrap').style.display, 'none');
            assert.doesNotMatch(plain(html(sb, 'register-screen')), /venmo|paypal/i);
        });
    });

    test('V5 the sign-up page with a handle: "Pay your $100 buy-in to @Scott-Starkey", Pay on Venmo opens the app scheme with the amount and the note (spaces kept), then the https page 1.2 s later; PayPal carries the amount only; the handle box stays hidden while the switch is off', async () => {
        const sb = arriveSignup(rec({ payTo: PAY_TO }));
        await settle();
        const box = html(sb, 'reg-paylink');
        assert.equal(el(sb, 'reg-paylink').style.display, '');
        assert.match(plain(box), /^Pay your \$100 buy-in to @Scott-Starkey \(Venmo\) or ScottStarkey \(PayPal\) ?\. The organizer marks you paid when it lands\. Pay on Venmo Pay on PayPal Venmo opens with the amount and a note \(this event and your name\) filled in\. PayPal carries the amount only: add your name in its note\. HardPan never holds or moves money\.$/);
        assert.equal(el(sb, 'reg-payhandle-wrap').style.display, '', 'the golfer handle box shows: the rules are live and the event has a handle');
        el(sb, 'reg-name').value = 'Dan Barker';
        tap(sb, box, byId('reg-pay-venmo'));
        assert.equal(sb.location.href, 'venmo://paycharge?txn=pay&recipients=Scott-Starkey&amount=100&note=Starkey%20Cup%20-%20Dan%20Barker');
        await new Promise((r) => setTimeout(r, 1400));
        assert.equal(sb.location.href, 'https://venmo.com/Scott-Starkey?txn=pay&amount=100&note=Starkey%20Cup%20-%20Dan%20Barker', 'the https page after the app did not take over');
        tap(sb, box, byId('reg-pay-paypal'));
        assert.equal(sb.location.href, 'https://www.paypal.com/paypalme/ScottStarkey/100USD');
        assert.deepEqual(sb.__dbWrites, [], 'a pay button writes nothing');
        // the per-team wording
        const team = arriveSignup(rec({ payTo: { venmo: 'Scott-Starkey' }, entryFee: 400, entryFeePer: 'team', scoringModel: 'team-v1', format: 'scramble' }));
        await settle();
        assert.match(plain(html(team, 'reg-paylink')), /^Pay your team’s \$400 entry to @Scott-Starkey ?\./);
        assert.doesNotMatch(html(team, 'reg-paylink'), /PayPal/);
    });

    test('V6 the sign-up payload: with the switch ON and a handle on the event the box shows and a typed @LeePark is written as payHandle; a bad handle is refused before the write; OFF it is never written', async () => {
        const on = arriveSignup(rec({ payTo: PAY_TO }));
        await settle();
        assert.equal(el(on, 'reg-payhandle-wrap').style.display, '');
        ['reg-name', 'reg-email', 'reg-phone'].forEach((id, i) => { el(on, id).value = ['Dan Barker', 'dan@example.com', '6025559999'][i]; });
        el(on, 'reg-payhandle').value = '@LeePark';
        on.navigator.onLine = true;
        tap(on, HTML, byId('reg-submit'));
        await settle();
        const w = writes(on, /^registrations\/STK\//);
        assert.equal(w.length, 1);
        assert.equal(w[0].value.payHandle, 'LeePark');
        assert.deepEqual(Object.keys(w[0].value).sort(), ['createdAt', 'email', 'fullName', 'payHandle', 'phone']);
        ['reg-name', 'reg-email', 'reg-phone'].forEach((id, i) => { el(on, id).value = ['Dan Barker', 'dan@example.com', '6025559999'][i]; });   // the first send cleared the boxes
        el(on, 'reg-payhandle').value = 'lee park!!';
        let said = ''; on.alert = (m) => { said = m; };
        tap(on, HTML, byId('reg-submit'));
        await settle();
        assert.match(said, /letters, numbers, dots, dashes and underscores/);
        assert.equal(writes(on, /^registrations\/STK\//).length, 1, 'nothing more was written');
        const off = arriveSignup(rec({ payTo: PAY_TO }), { transform: flipOff });   // the rollback page
        await settle();
        assert.equal(el(off, 'reg-payhandle-wrap').style.display, 'none', 'OFF hides the box again');
        ['reg-name', 'reg-email', 'reg-phone'].forEach((id, i) => { el(off, id).value = ['Dan Barker', 'dan@example.com', '6025559999'][i]; });
        el(off, 'reg-payhandle').value = '@LeePark';   // typed into a hidden box: never sent
        off.navigator.onLine = true;
        tap(off, HTML, byId('reg-submit'));
        await settle();
        const w2 = writes(off, /^registrations\/STK\//);
        assert.equal(w2.length, 1);
        assert.ok(!('payHandle' in w2[0].value), 'OFF: the closed schema is never asked for payHandle');
    });

    test('V7a the Desk with a handle on the ROLLBACK page (the switch set back to false): the cash tick as before, no Venmo button, no method chips, and setPaidVia refuses venmo / paypal in the page before the database would', () => {
        const sb = arriveOwner(rec({ payTo: PAY_TO }), undefined, { transform: flipOff });
        deskTab(sb);
        const list = html(sb, 'registration-list');
        assert.match(rowOf(list, 'e3'), /<input type="checkbox" onchange="setRegistrationPaid\('e3', this\.checked\)"> Paid/);
        assert.doesNotMatch(list, /reg-via-venmo|Paid \(Venmo\)/);
        assert.equal(plain(html(sb, 'registration-chips')), 'All 5 Unpaid 1 Paid 4 Approved 5 Not yet approved 0 Photos 0');
        assert.doesNotMatch(html(sb, 'registration-counts'), /in so far/);
        vm.runInContext("setPaidVia('e3', 'venmo')", sb);
        assert.deepEqual(writes(sb, /registrations\/STK\/e3$/), [], 'no value the live rules would refuse');
        vm.runInContext("setPaidVia('e3', 'cash')", sb);
        assert.equal(writes(sb, /registrations\/STK\/e3$/).length, 1, 'cash still writes');
    });

    test('V7 the Desk with a handle, rules live: Paid by Venmo / PayPal / Cash beside an unpaid golfer (one write each), Paid (Venmo) + Undo, the Stripe row untouched, the method chips, the in-so-far tile, the handle beside the name, the sentence', () => {
        const sb = arriveOwner(rec({ payTo: PAY_TO }));
        deskTab(sb);
        const list = html(sb, 'registration-list');
        const joe = rowOf(list, 'e3');
        assert.match(plain(joe), /Joe Fox Unpaid Paid by Venmo PayPal Cash/);
        assert.doesNotMatch(joe, /type="checkbox"/);
        tap(sb, joe, byClass('reg-via-venmo'));
        let w = writes(sb, /registrations\/STK\/e3$/);
        assert.equal(w.length, 1); assert.equal(w[0].op, 'update');
        assert.deepEqual(Object.keys(w[0].value).sort(), ['paid', 'paidAt', 'paidVia']);
        assert.equal(w[0].value.paidVia, 'venmo'); assert.equal(w[0].value.paid, true);
        assert.match(plain(rowOf(list, 'e1')), /Ana Diaz Paid \(Venmo\) Undo/);
        assert.match(plain(rowOf(list, 'e4')), /Lee Park Paid \(PayPal\) Undo/);
        assert.match(plain(rowOf(list, 'e4')), /@LeePark/, 'the golfer handle shows for the owner');
        assert.match(plain(rowOf(list, 'e2')), /Sam Ortiz Paid \(cash\) Undo/);
        const dana = rowOf(list, 'e5');
        assert.match(plain(dana), /Paid \(Stripe\) \$100 Refund/);
        assert.doesNotMatch(dana, /reg-via-/);
        tap(sb, rowOf(list, 'e1'), byClass('reg-undo-btn'));
        w = writes(sb, /registrations\/STK\/e1$/);
        assert.deepEqual(w[0].value, { paid: false, paidAt: null, paidVia: null });
        assert.equal(plain(html(sb, 'registration-chips')), 'All 5 Unpaid 1 Paid 4 Venmo 1 PayPal 1 Cash 1 Approved 5 Not yet approved 0 Photos 0');
        const counts = html(sb, 'registration-counts');
        // Manny 2026-11-16: the tile and the "Fees collected" line count the SAME payers - four paid, the card one too.
        assert.match(counts, /<b id="pay-tile-in">\$400<\/b><span>in so far \(4 paid · \$100 each\)<\/span>/, 'every paid entry times the fee, the card payment included');
        assert.match(counts, /<b id="pay-tile-by">1 · 1 · 1 · 1<\/b><span>Venmo · PayPal · cash · card<\/span>/, 'the split adds up to the four');
        assert.match(counts, /Fees collected \$400 · 4 paid × \$100 per golfer/);
        assert.match(el(sb, 'registration-desk-note').textContent, /Tap Venmo, PayPal or Cash beside a golfer when the money lands, then approve golfers into the field\. HardPan never holds or moves money; these buttons open Venmo or PayPal\.$/);
        const vm2 = arriveOwner(rec({ payTo: PAY_TO }), regs());
        vm.runInContext("setPaidVia('e5', 'venmo')", vm2);
        assert.deepEqual(writes(vm2, /e5$/), [], 'a Stripe entry is never re-marked here');
    });

    test('V8 a visitor on the board, handle set: no pay control, no handle, no Venmo word', () => {
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=' + CODE });
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec({ payTo: PAY_TO, prizeType: 'cash' }));
        const page = plain(html(sb, 'manage-screen'));
        assert.doesNotMatch(page, /venmo|paypal|Scott-Starkey|Pay out/i);
        assert.equal(el(sb, 'prize-payout-card').style.display, 'none');
        assert.ok(!sb.__dbHandlers.some((h) => /^registrations\//.test(h.path)), 'a visitor never asks for the sign-ups');
    });

    test('V9 the owner\'s pay-out rows on a posted CASH prize: Pay $100 on Venmo for the winner with a handle, Mark paid out for the others, the tick writes prizePaidOut/<spot>, the line counts ticks; credit shows no card', async () => {
        const posted = postedCash(arriveOwner(rec({ prizeType: 'cash', payTo: PAY_TO })));
        const regsWithHandle = regs({ e1: Object.assign(regs().e1, { payHandle: 'AnaDiaz' }) });
        const sb = arriveOwner(rec({ prizeType: 'cash', payTo: PAY_TO, prizeResults: posted }), regsWithHandle);
        const card = html(sb, 'prize-payout-card');
        assert.equal(el(sb, 'prize-payout-card').style.display, 'block');
        assert.match(plain(card), /^Pay out HardPan never holds or moves money; these buttons open Venmo or PayPal with the amount filled in, and the tick is yours\. 1st · A Flight · Ana Diaz @AnaDiaz · \$100 Pay \$100 on Venmo on PayPal Mark paid out 2nd · A Flight · Sam Ortiz · \$60 Mark paid out/);
        assert.match(plain(card), /Paid out \$0 of \$\d+ · (\d+) of \1 left$/);
        const rowAna = card.slice(card.indexOf('data-spot="place-0-1-pA"'), card.indexOf('data-spot="place-0-2-pS"'));
        tap(sb, rowAna, byClass('pz-pay-venmo'));
        assert.equal(sb.location.href, 'venmo://paycharge?txn=pay&recipients=AnaDiaz&amount=100&note=Starkey%20Cup%20-%20Ana%20Diaz%20prize');
        const rowSam = card.slice(card.indexOf('data-spot="place-0-2-pS"'), card.indexOf('data-spot="', card.indexOf('data-spot="place-0-2-pS"') + 10));
        tap(sb, rowSam, byClass('pz-mark-out'));
        const w = writes(sb, /prizePaidOut/);
        assert.equal(w.length, 1);
        assert.equal(w[0].path, 'tournaments/STK/prizePaidOut/place-0-2-pS');
        assert.equal(w[0].value.via, 'marked'); assert.ok(w[0].value.at > 0);
        const total = Number(/Paid out \$0 of \$(\d+)/.exec(plain(card))[1]);
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec({ prizeType: 'cash', payTo: PAY_TO, prizeResults: posted, prizePaidOut: { 'place-0-2-pS': { at: 1700000100000, via: 'marked' } } }));
        const after = plain(html(sb, 'prize-payout-card'));
        assert.match(after, /2nd · A Flight · Sam Ortiz · \$60 Paid out \w+ \d+ Undo/);
        assert.match(after, new RegExp('Paid out \\$60 of \\$' + total + ' · \\d+ of \\d+ left$'));
        const n = /· (\d+) of (\d+) left$/.exec(after);
        assert.equal(Number(n[2]) - Number(n[1]), 1, 'one tick, one fewer left');
        const credit = arriveOwner(rec({ payTo: PAY_TO, prizeResults: Object.assign({}, posted, { prizeType: 'credit' }) }), regsWithHandle);
        assert.equal(el(credit, 'prize-payout-card').style.display, 'none', 'a credit prize is never paid out by Venmo');
        assert.doesNotMatch(html(credit, 'prize-payout-card'), /Venmo/);
    });

    test('V10 nothing new is written without a tap: arriving as the owner with a handle set writes neither payTo nor prizePaidOut nor paidVia', () => {
        const posted = postedCash(arriveOwner(rec({ prizeType: 'cash', payTo: PAY_TO })));
        const sb = arriveOwner(rec({ prizeType: 'cash', payTo: PAY_TO, prizeResults: posted }));
        deskTab(sb);
        assert.deepEqual(writes(sb, /payTo|prizePaidOut|paidVia|registrations/), []);
    });

    // Manny 2026-11-16, before the merge: (1) the Desk's two totals must count the same payers; (2) the sign-up
    // Phone box must be styled like the other fields.
    test('V11 the Desk totals agree whatever mix of ticks is in: the "in so far" tile, its split and the "Fees collected" line are one count, and no card figure shows when no card payment is in', () => {
        // regs(): Ana Venmo, Sam cash, Joe unpaid, Lee PayPal, Dana card (Stripe); plus an old checkbox tick with no
        // method (Bo) and a second unpaid golfer (Cy): 7 sign-ups, 5 paid, $100 a golfer.
        const mix = regs({
            e6: { fullName: 'Bo Hale', email: 'bo@example.com', phone: '6025551006', createdAt: 1006, approvedAt: 2006, playerId: 'pF', paid: true, paidAt: 3006 },
            e7: { fullName: 'Cy Nash', email: 'cy@example.com', phone: '6025551007', createdAt: 1007, approvedAt: 2007, playerId: 'pG', paid: false },
        });
        const sb = arriveOwner(rec({ payTo: PAY_TO }), mix);
        deskTab(sb);
        const counts = html(sb, 'registration-counts');
        const tile = /<b id="pay-tile-in">\$([\d,]+)<\/b><span>in so far \((\d+) paid · \$100 each\)<\/span>/.exec(counts);
        const line = /Fees collected \$([\d,]+) · (\d+) paid × \$100 per golfer/.exec(counts);
        const main = /(\d+) signups · (\d+) paid · /.exec(plain(counts));
        assert.ok(tile && line && main, 'the tile, the fees line and the count line all render');
        assert.equal(tile[2], '5'); assert.equal(line[2], tile[2]); assert.equal(main[2], tile[2]);
        assert.equal(tile[1], '500'); assert.equal(line[1], tile[1]);
        const by = /<b id="pay-tile-by">([\d · ]+)<\/b><span>([^<]+)<\/span>/.exec(counts);
        assert.equal(by[1], '1 · 1 · 2 · 1'); assert.equal(by[2], 'Venmo · PayPal · cash · card');
        assert.equal(by[1].split(' · ').reduce((a, n) => a + Number(n), 0), 5, 'the split adds up to the count');
        assert.equal(plain(html(sb, 'registration-chips')), 'All 7 Unpaid 2 Paid 5 Venmo 1 PayPal 1 Cash 2 Approved 7 Not yet approved 0 Photos 0');
        // no card payment in: three figures, three words
        const noCard = regs({ e5: Object.assign(regs().e5, { paid: false, paidVia: null, amountCents: null }) });
        const sb2 = arriveOwner(rec({ payTo: PAY_TO }), noCard);
        deskTab(sb2);
        const c2 = html(sb2, 'registration-counts');
        assert.match(c2, /<b id="pay-tile-in">\$300<\/b><span>in so far \(3 paid · \$100 each\)<\/span>/);
        assert.match(c2, /<b id="pay-tile-by">1 · 1 · 1<\/b><span>Venmo · PayPal · cash<\/span>/);
        assert.match(c2, /Fees collected \$300 · 3 paid × \$100 per golfer/);
    });

    test('V12 the sign-up Phone box takes the page\'s input rule like Full name and Email (the rule names input[type="tel"]); both tel boxes are type="tel"', () => {
        // Source half (CLAUDE.md: a source scan beside the rendered check). The one rule that styles the sign-up
        // boxes (width, padding, border, radius, 16px) must list tel with text and email; before 2026-11-16 it did
        // not, and the Phone box showed in the browser's default border beside two styled ones. The rendered half
        // is the Chrome computed-style read in build-venmo-a/phone-box-styles.json.
        const at = HTML.indexOf('input[type="text"], input[type="number"], input[type="email"]');
        assert.ok(at > 0, 'the sign-up input rule exists');
        const selector = HTML.slice(at, HTML.indexOf('{', at));
        assert.match(selector, /input\[type="tel"\]/, 'tel is in the same selector list');
        assert.match(selector, /input\[type="email"\]/);
        assert.match(HTML.slice(HTML.indexOf('{', at), HTML.indexOf('}', at)), /width: 100%; padding: 10px; border: 1px solid var\(--border-mid\)/);
        assert.match(HTML, /<input type="tel" id="reg-phone" placeholder="Mobile number"/);
        assert.match(HTML, /<input type="tel" id="reg-edit-phone"/);
        assert.equal((HTML.match(/<input type="tel"/g) || []).length, 2, 'the two phone boxes, both covered');
    });
});
