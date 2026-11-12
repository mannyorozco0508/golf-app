// THE TOURNAMENT OFFER, 58A (Manny 2026-11-12): off by default; when the
// organizer turns it on with this event's code word, one price line joins
// the Get HardPan banner and the foot of the reasons card, in both founding
// states, iPhone (Redeem) and Android (one sentence, no code). Reached the way
// each person reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844,
// tap and type; no page function is called.
//
//  1 OFF BY DEFAULT: a record with no offer shows the banner exactly as live,
//    no "$" in the banner or the card; the owner's Setup shows the switch Off
//    and no code box
//  2 the owner turns it on: ONE update tournaments/SCR/offer {on:true}; the
//    next snapshot shows the code box; a code word writes {code} upper-cased;
//    an end date writes {endsAt}; the optional line writes {line}; the preview
//    reads the founding-open line
//  3 iPhone, founding OPEN (gps_meta/config/foundingOpen true): the banner's
//    second row is the line word for word; Get reads Redeem and links to the
//    Apple redeem URL with the code; the card foot has the line + the charity
//    line; "49.99" appears nowhere
//  4 founding CLOSED (flag false): the "then $49.99/yr" line; "24.99" nowhere
//  5 Android: the Android sentence, no redeem link anywhere, Get stays Get
//  6 ended (endsAt yesterday), off, or no code word: the banner is the live
//    one-liner and there is no "$"
//  7 app mode: nothing of it
//  8 no flag in the database: site-pricing.js decides (founding open today)
//  9 money = base
// 10 the owner signs in AFTER the record arrived (Manny's iPad, R7SK48): the
//    block draws with the switch Off and no offer record (added 2026-11-12)
// 11 Offer ends looks like the create form's Date box (appearance none, block,
//    48 px, its border and radius, fills its cell) with "No end date" while
//    empty, hidden once a date is in (Manny 2026-11-12, iPad: an empty grey bar)
// Lines re-pinned 2026-11-12 (Manny): "7 days free, then $19.99 your first
// year, then $24.99/yr" (founding closed: "then $49.99/yr", no "(regular
// price)"); the long note became "Price switches to $49.99/yr automatically
// once founding spots fill. HardPan collects nothing for charity." 
//
// Baseline against main 03231f51 (before the build), the first 9 tests:
// 3 PASS / 6 FAIL (tests 6, 7 and 9: without the build nothing ever shows).
// All 10 tests against preview-58 1be4e5bc (page swapped in by cp, restored by
// sha): 9 PASS / 1 FAIL (test 10, the block empty). With the fix: 10 PASS / 0 FAIL.
// All 11 tests (after the re-pins) against preview-58 8114178a: 4 PASS / 7 FAIL
// (tests 1, 2, 3, 4, 8, 10, 11: the old lines, the old note, the grey bar).
// With the build: 11 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const Q = 'tourney=SCR&team=4&k=' + F.KEY4;
// Re-pinned 2026-11-12 (Manny): the Apple offer starts with a 7-day free trial; founding closed reads "then $49.99/yr" with no "(regular price)".
const LINE_OPEN = 'Tournament players: 7 days free, then $19.99 your first year, then $24.99/yr. Renews until you cancel. New subscribers.';
const LINE_CLOSED = 'Tournament players: 7 days free, then $19.99 your first year, then $49.99/yr. Renews until you cancel. New subscribers.';
const AND_OPEN = 'Android: founding price $24.99/yr in HardPan. The tournament price arrives with the next app update.';
const REDEEM = 'https://apps.apple.com/redeem?ctx=offercodes&id=6808220335&code=HERO2026';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36';
const ua = (s) => `Object.defineProperty(navigator, 'userAgent', { get: function () { return ${JSON.stringify(s)}; } });`;
const fixture = (offer, foundingOpen) => {
    const db = Object.assign(F.scrambleDb({ ownerUid: 'u-org' }), { tournamentKeys: { SCR: { on: true, t: { team4: F.KEY4 } } } });
    if (offer) db.tournaments.SCR.offer = offer;
    if (typeof foundingOpen === 'boolean') db.gps_meta = { config: { foundingOpen } };
    return db;
};
const ON = { on: true, code: 'HERO2026', endsAt: '2027-01-31', line: '$5 of each goes to Hope Foundation' };
const CARD = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { bar: t('#getapp-bar'), offer: t('#getapp-offer'), offerLine: t('#getapp-offer b'), charity: t('#getapp-offer .getapp-charity'), android: t('#getapp-offer .getapp-and'),
    get: t('#getapp-get'), getHref: ($('#getapp-get') || {}).href || null, redeem: ($('#getapp-offer .getapp-redeem') || {}).href || null,
    cardOffer: t('#getapp-offer-getapp-card-card'), cardRedeem: ($('#getapp-offer-getapp-card-card .getapp-redeem') || {}).href || null, card: t('#getapp-card-card'),
    body: (document.body.innerText || '').replace(/\\s+/g, ' '), redeemLinks: document.querySelectorAll('a[href*="apps.apple.com/redeem"]').length,
    writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())` };
const ORG = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { block: shown($('#offer-setup')), sw: ($('#offer-on-switch') || {}).checked, label: t('#offer-on-label'), code: shown($('#offer-code')), see: t('#offer-see'), ro: t('#offer-ro'),
    writes: (window.__coldWrites || []).filter(function (w) { return !/^organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.insertText', params: { text } } }, { expression: `document.querySelector('${sel}').blur(), 1` }, { sleep: 250 }];
const card = async (db, steps, pre, query) => {
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', query || Q), db, auth: GOLFER, settleMs: 3000, steps: steps || [CARD], preScript: pre });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const sc = (sel) => ({ expression: `(function(){ var e = document.querySelector('${sel}'); if (e) e.scrollIntoView({block:'center'}); return !!e; })()` });

test('1 off by default: the live banner, no "$"; the owner sees the switch Off and no code box', async () => {
    const [a] = await card(fixture(null, true), [CARD], ua(UA_IPHONE));
    assert.match(a.bar, /^HP Get HardPan · live yardages, your card and the board in the app\. Why\? Get ✕$/);
    assert.equal(a.offer, null); assert.doesNotMatch(a.card || '', /\$/);
    assert.equal(a.get, 'Get');
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: fixture(null, true), auth: OWNER, settleMs: 3500, steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, sc('#offer-setup'), { sleep: 200 }, ORG] });
    assert.ok(r.ok, r.reason);
    const o = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    assert.equal(o.block, true, 'the block is on Setup'); assert.equal(o.sw, false); assert.equal(o.label, 'Off'); assert.equal(o.code, false);
});

test('2 the owner turns it on, types the code word, the end date and the line: one write each; the preview line', async () => {
    const base = fixture(null, true);
    const onRecord = Object.assign(JSON.parse(JSON.stringify(base.tournaments.SCR)), { offer: { on: true } });
    const steps = [{ tap: '#tab-btn-setup' }, { sleep: 300 }, sc('#offer-setup'), { sleep: 200 }, { tap: '#offer-setup .toggle-slider' }, { sleep: 300 }, ORG,   // the input is hidden; the slider is what a thumb hits
        { deliver: { path: 'tournaments/SCR', value: onRecord } }, { sleep: 300 }, sc('#offer-setup'), { sleep: 150 }, ORG]
        .concat(type('#offer-code', 'hero2026'), [{ expression: "var e = document.getElementById('offer-ends'); e.value = '2027-01-31'; e.dispatchEvent(new Event('change', { bubbles: true })); 1" }, { sleep: 250 }],
            type('#offer-line', '$5 of each goes to Hope Foundation'), [ORG]);
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: base, auth: OWNER, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    const del = r.value.find((v) => v && typeof v === 'object' && 'listeners' in v);
    assert.ok(del && del.listeners > 0 && !(del.threw || []).length, 'the next snapshot reached a listener: ' + JSON.stringify(del));
    const [afterSwitch, shownOn, done] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.deepEqual(afterSwitch.writes, [{ op: 'update', path: 'tournaments/SCR/offer', value: { on: true } }]);
    assert.equal(shownOn.code, true, 'the code box appears once the record says on');
    assert.match(shownOn.see, /not shown until the code word is in/);
    assert.deepEqual(done.writes.slice(1), [
        { op: 'update', path: 'tournaments/SCR/offer', value: { code: 'HERO2026' } },
        { op: 'update', path: 'tournaments/SCR/offer', value: { endsAt: '2027-01-31' } },
        { op: 'update', path: 'tournaments/SCR/offer', value: { line: '$5 of each goes to Hope Foundation' } }]);
    assert.match(done.ro, /set in App Store Connect/);
    assert.match(done.see, new RegExp('^Golfers see: ' + LINE_OPEN.replace(/[.$]/g, '\\$&')));
});

test('3 iPhone, founding open: the line in the banner, Redeem with the code, the card foot, no 49.99', async () => {
    const [a] = await card(fixture(ON, true), [CARD], ua(UA_IPHONE));
    assert.equal(a.offerLine, LINE_OPEN);
    assert.equal(a.charity, '$5 of each goes to Hope Foundation');
    assert.equal(a.get, 'Redeem'); assert.equal(a.getHref, REDEEM); assert.equal(a.redeem, REDEEM);
    assert.match(a.cardOffer, new RegExp('^' + LINE_OPEN.replace(/[.$]/g, '\\$&') + ' \\$5 of each goes to Hope Foundation Redeem in the App Store$'));
    assert.equal(a.cardRedeem, REDEEM);
    assert.doesNotMatch(a.body, /49\.99/);
    assert.equal(a.android, null);
});

test('4 founding closed: the regular-price line, no 24.99', async () => {
    const [a] = await card(fixture(ON, false), [CARD], ua(UA_IPHONE));
    assert.equal(a.offerLine, LINE_CLOSED);
    assert.doesNotMatch(a.body, /24\.99/);
    assert.equal(a.get, 'Redeem');
});

test('5 Android: one sentence, no code, no redeem link, Get stays Get', async () => {
    const [a] = await card(fixture(ON, true), [CARD], ua(UA_ANDROID));
    assert.equal(a.offerLine, LINE_OPEN);
    assert.equal(a.android, AND_OPEN);
    assert.equal(a.redeemLinks, 0); assert.doesNotMatch(a.body, /HERO2026/);
    assert.equal(a.get, 'Get'); assert.match(a.getHref, /play\.google\.com/);
});

test('6 ended, off, or no code word: nothing shows', async () => {
    for (const o of [Object.assign({}, ON, { endsAt: '2026-11-11' }), Object.assign({}, ON, { on: false }), Object.assign({}, ON, { code: '' })]) {
        const [a] = await card(fixture(o, true), [CARD], ua(UA_IPHONE));
        assert.equal(a.offer, null, JSON.stringify(o)); assert.equal(a.get, 'Get'); assert.doesNotMatch(a.body, /\$19\.99/);
    }
});

test('7 app mode: nothing of it', async () => {
    const [a] = await card(fixture(ON, true), [CARD], ua(UA_IPHONE), Q + '&app=1');
    assert.doesNotMatch(a.body, /19\.99|Redeem|HERO2026/);
});

test('8 no flag in the database: site-pricing.js decides', async () => {
    const pro = new Function('const window = {}; ' + fs.readFileSync(path.join(__dirname, 'site-pricing.js'), 'utf8') + '; return window.HARDPAN_SITE_PRICING.pro;')();
    const expected = pro.foundingOpen ? LINE_OPEN : LINE_CLOSED;
    const [a] = await card(fixture(ON), [CARD], ua(UA_IPHONE));
    assert.equal(a.offerLine, expected);
});

test('9 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});

// 10 (Manny 2026-11-12, iPad, owner of R7SK48: the heading showed with nothing
// under it). The record can arrive BEFORE the sign-in: its snapshot drew the
// block for a non-owner (empty), and the sign-in showed the Setup tab without
// drawing the block again. Arrive signed out, the owner signs in through the
// stand-in's door (no page function), tap Setup: the switch Off, its label,
// the off sentence, the note; no code box. No offer record at all.
test('10 the owner signs in AFTER the record arrived: the block draws, switch Off', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: fixture(null, true), auth: 'signed-out', settleMs: 3500,
        steps: [{ expression: `window.__signInAs(${JSON.stringify(OWNER)})` }, { sleep: 600 }, { tap: '#tab-btn-setup' }, { sleep: 300 }, sc('#offer-setup'), { sleep: 200 }, ORG,
            { expression: `(document.getElementById('offer-setup').innerText || '').replace(/\\s+/g, ' ').trim()` }] });
    assert.ok(r.ok, r.reason);
    const o = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    const text = r.value[r.value.length - 1];
    assert.equal(o.block, true, 'positive: the block is on Setup and drew');
    assert.equal(o.sw, false, 'the switch is there and Off: ' + JSON.stringify(o));
    assert.equal(o.label, 'Off');
    assert.equal(o.code, false);
    assert.match(text, /Off for every event until you turn it on\./);
    assert.match(text, /Price switches to \$49\.99\/yr automatically once founding spots fill\. HardPan collects nothing for charity\./);
    assert.doesNotMatch(text, /founding flag/, 'the long note is gone');
    assert.deepEqual(o.writes, [], 'drawing the block writes nothing');
});

// 11 (Manny 2026-11-12, iPad: "Offer ends" was an empty grey bar). The box
// looks like the create form's Date box (appearance none, block, 48 px, its
// border and radius, the width of its cell) and shows a placeholder while
// empty; a picked date hides it. Reached by tapping the switch on, no page
// function. Chrome cannot show the iPad's grey bar; it holds the CSS the
// fix rests on, which the iPad simulator check confirms by eye.
test('11 Offer ends looks like the create form\'s Date box, with a placeholder while empty', async () => {
    const READ = { expression: `JSON.stringify((function () {
  var i = document.getElementById('offer-ends'); if (!i) return { missing: true };
  var c = getComputedStyle(i), cell = i.closest('.of-grid > div'), ph = document.getElementById('offer-ends-ph');
  var shown = function (e) { if (!e) return false; var s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var ir = i.getBoundingClientRect();
  return { appearance: c.appearance || c.webkitAppearance, display: c.display, h: Math.round(ir.height), w: Math.round(ir.width), cellW: Math.round(cell.getBoundingClientRect().width),
    radius: c.borderTopLeftRadius, border: c.borderTopWidth, formBorder: getComputedStyle(document.getElementById('t-date')).borderTopWidth, formRadius: getComputedStyle(document.getElementById('t-date')).borderTopLeftRadius, ph: shown(ph) ? ph.innerText.trim() : null, value: i.value };
})())` };
    const db = fixture({ on: true, code: 'HERO2026' }, true);
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db, auth: OWNER, settleMs: 3500,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, sc('#offer-setup'), { sleep: 200 }, READ,
            // Headless Chrome takes no typed digits in this date box through the
            // harness (insertText, char and keyDown all left it empty), so the value
            // is set as test 2 sets it and the box's own input + change events fire.
            { expression: "var e = document.getElementById('offer-ends'); e.value = '2027-01-31'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); 1" }, { sleep: 200 }, READ] });
    assert.ok(r.ok, r.reason);
    const [a, b] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.ok(!a.missing, 'positive: the Offer ends box is on Setup');
    assert.equal(a.appearance, 'none'); assert.equal(a.display, 'block');
    assert.equal(a.h, 48, 'the create form\'s 48 px');
    assert.equal(a.radius, '10px'); assert.equal(a.radius, a.formRadius);
    assert.equal(a.border, a.formBorder, 'the create form Date box\'s border (Chrome at 1x draws 1.5 px as ' + a.formBorder + ')');
    assert.ok(Math.abs(a.w - a.cellW) <= 1, `fills its cell: ${a.w} vs ${a.cellW}`);
    assert.equal(a.ph, 'No end date', 'the placeholder while empty');
    assert.equal(b.value, '2027-01-31', 'positive: a date was picked: ' + JSON.stringify(b));
    assert.equal(b.ph, null, 'the placeholder hides once a date is in');
});
