// ============================================================================
// TOURNAMENT REGISTRATION WAVE 2b — SILENCE IS THE FAILURE (2026-09-16)
//
// Registration happens on phones at a golf course on one bar of cell data.
// The compat SDK does not reject a set() it cannot send - it QUEUES it and
// the promise never settles - so a golfer tapped Sign up and saw nothing: no
// alert, no confirmation, no resolution. They tap again, text the organizer,
// show up assuming they are registered. Three things close that, in the
// order they matter:
//
//   1. requireOnlineForSignup - the repo's six-line guard, copied onto this
//      page as connectivity_safety_test.js requires (navigator.onLine read
//      directly, no GolfNet: a check that disappears when a script 404s is
//      not a check). Airplane mode / radio off -> the tap says so and writes
//      NOTHING. Its limit: one dead bar reads as online. Hence 3.
//   2. The Firebase refusal (the page thought the payload was fine, the
//      rules said no) is a sentence in the status line - persistent, re-
//      readable, one the golfer can act on - with the SDK code in small
//      type for the organizer. Never the SDK string in an alert.
//   3. The write races a 10-second timer. Unsettled -> "Still sending..."
//      and the button re-enables. The entry id is minted ONCE per form fill
//      and reused on every retry, so a queued write that lands later and a
//      second tap write the SAME entry - one registration, never two. When
//      the queued write finally settles, the status flips to confirmed (or
//      to the refusal) - if the page is still open. If the page was closed,
//      nothing can flip it; HANDOFF says so.
//
// Then the toggles: tournaments/$code/registrationFields, five booleans,
// absent = defaults (ghinOrHandicap, shirtSize, dinnerCount, teamPreference
// ON; holeSponsorship OFF). They govern the FORM only - a switched-off box is
// hidden, therefore not written, therefore never required. The rules type
// every key regardless (no rules change), and the desk shows whatever an
// entry carries - nothing hides data a golfer gave.
//
// THE HARNESS: sandbox.__dbHold makes a write's promise hang until the test
// settles it; sandbox.setTimeout is replaced after load so the 10 s timer is
// fired by hand. Both are the mechanism under test, not a shortcut past it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const SENTENCE = "Sign-up didn't go through. The organizer's list may have closed, or this page may be out of date - reload and try once more, or text the organizer your name, email and phone.";
const STILL = "Still sending... if this doesn't confirm in a moment, check your signal and tap Sign up again.";

function settle() { return Promise.resolve().then(() => new Promise((r) => setImmediate(r))); }
function teamRecord(o) { return Object.assign({ name: 'Signup Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 } } }, o || {}); }
function individualRecord(o) { return Object.assign({ name: 'Signup Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'net', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org', teams: {}, players: { p0: { id: 'p0', name: 'Ann Alpha', handicap: '8', addedAt: 1 } } }, o || {}); }
function arriveRegister(rec) { return loadHtmlInlineScript(PAGE, [], { search: '?register=REG1', beforeRun(sb) { sb.__dbReads = sb.__dbReads || {}; sb.__dbReads['tournaments/REG1'] = JSON.parse(JSON.stringify(rec)); } }); }
function arriveOwner(rec) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=OWN1' }); sb.__auth.setUser(ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/OWN1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
function fireRegistrations(sb, data) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && /registrations\/OWN1$/.test(h.path)); assert.ok(hs.length > 0, 'no registrations listener');
    hs.forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true }));
}
const el = (sb, id) => sb.document.getElementById(id);
const set = (sb, id, v) => { el(sb, id).value = v; };
const fill = (sb) => { set(sb, 'reg-name', 'Dee Delta'); set(sb, 'reg-email', 'dee@example.com'); set(sb, 'reg-phone', '555-0100'); };
const display = (sb, id) => (el(sb, id).style || {}).display || '';
const statusText = (sb) => String(el(sb, 'reg-status').innerHTML || el(sb, 'reg-status').textContent || '');
const regWrites = (sb) => sb.__dbWrites.filter((w) => w.op === 'set' && /^registrations\/REG1\/[^/]+$/.test(w.path));
// The 10-second timer, captured so the test fires it.
function captureTimers(sb) { const timers = []; sb.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }; sb.clearTimeout = () => {}; return timers; }
const fireTimer = (timers, ms) => { const t = timers.find((x) => x.ms === ms && !x.fired); assert.ok(t, 'no ' + ms + ' ms timer was armed'); t.fired = true; t.fn(); };
function held() { let resolve, reject; const p = new Promise((res, rej) => { resolve = res; reject = rej; }); p.catch(() => {}); return { p, resolve, reject }; }

// ---------------------------------------------------------------------------
describe('1. OFFLINE: the tap says so and writes nothing', () => {
    test('navigator.onLine false: an alert names what did NOT happen, no write, no status, the button stays enabled', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        sb.navigator.onLine = false;
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        sb.submitRegistration(); await settle();
        assert.equal(regWrites(sb).length, 0, 'nothing may be queued: ' + JSON.stringify(sb.__dbWrites));
        assert.ok(alerts.some((m) => /SIGN-UP NOT SENT/.test(m) && /offline/i.test(m) && /nothing was saved/i.test(m)), JSON.stringify(alerts));
        assert.equal(statusText(sb).trim(), '');
        assert.notEqual(el(sb, 'reg-submit').disabled, true);
    });
    test('the guard is the repo\'s own shape: navigator.onLine read directly, no GolfNet, before the payload is built', () => {
        const js = stripComments(read(PAGE));
        const at = js.indexOf('function requireOnlineForSignup(');
        assert.ok(at > 0, 'the guard exists');
        const body = js.slice(at, js.indexOf('\n    }', at));
        assert.match(body, /navigator\.onLine === false/); assert.ok(!/GolfNet/.test(body));
        const sub = js.slice(js.indexOf('function submitRegistration()'), js.indexOf('\n    function ', js.indexOf('function submitRegistration()') + 30));
        assert.ok(sub.indexOf("requireOnlineForSignup('SIGN-UP NOT SENT'") < sub.indexOf('buildRegistrationPayload()'), 'the guard runs before the payload is built');
    });
});

describe('2. THE FIREBASE REFUSAL is a sentence in the status line, not an SDK string in an alert', () => {
    test('PERMISSION_DENIED from set(): the sentence, the code in small type, red, no alert, button re-enabled', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        sb.__dbRefuse = (p, op) => (/^registrations\//.test(p) && op === 'set') ? Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }) : null;
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        sb.submitRegistration(); await settle(); await settle();
        assert.equal(alerts.length, 0, 'no alert for a failure the golfer did not cause: ' + JSON.stringify(alerts));
        const s = statusText(sb);
        assert.ok(s.includes(SENTENCE), s);
        assert.match(s, /reg-status-code[^>]*>\(PERMISSION_DENIED\)</, 'the SDK code, in small type, for the organizer');
        assert.ok(!/Permission denied/.test(s.replace(/\(PERMISSION_DENIED\)/, '')), 'the SDK sentence itself is not shown');
        assert.ok(/reg-status-error/.test(el(sb, 'reg-status').className || ''), 'styled as an error, persistent');
        assert.notEqual(el(sb, 'reg-submit').disabled, true);
    });
    test('the golfer\'s own blanks still alert (their failure to fix by retyping); the status line stays clear', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); set(sb, 'reg-name', ''); set(sb, 'reg-email', 'dee@example.com'); set(sb, 'reg-phone', '555-0100');
        const alerts = []; sb.alert = (m) => alerts.push(String(m)); sb.submitRegistration(); await settle();
        assert.equal(alerts.length, 1); assert.equal(statusText(sb).trim(), '');
    });
});

describe('3. THE TIMEOUT RACE and the minted-once entry id', () => {
    test('a write that never settles: "Sending" while in flight, the 10 s timer arms, then "Still sending..." and the button re-enables; nothing else claimed', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        const timers = captureTimers(sb); const h = held(); sb.__dbHold = (p, op) => (/^registrations\//.test(p) && op === 'set') ? h.p : null;
        sb.submitRegistration(); await settle();
        assert.equal(regWrites(sb).length, 1); assert.equal(el(sb, 'reg-submit').disabled, true, 'disabled while in flight');
        assert.match(statusText(sb), /Sending/);
        fireTimer(timers, 10000); await settle();
        assert.ok(statusText(sb).includes(STILL), statusText(sb)); assert.notEqual(el(sb, 'reg-submit').disabled, true, 're-enabled so the golfer can retry');
        assert.ok(!/signed up/i.test(statusText(sb)), 'nothing is claimed');
    });
    test('a second tap after the timeout writes the SAME entry (one id per form fill): two set() calls, one path', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        const timers = captureTimers(sb); const h1 = held(); const h2 = held(); let n = 0; sb.__dbHold = (p, op) => (/^registrations\//.test(p) && op === 'set') ? (++n === 1 ? h1.p : h2.p) : null;
        sb.submitRegistration(); await settle(); fireTimer(timers, 10000); await settle();
        sb.submitRegistration(); await settle();
        const w = regWrites(sb); assert.equal(w.length, 2); assert.equal(w[0].path, w[1].path, 'the id is reused - a queued write that lands later cannot make a second entry');
        assert.equal(w[0].value.fullName, w[1].value.fullName);
    });
    test('the queued write settles AFTER the timeout message: the status flips to confirmed, the fields clear, the next fill mints a NEW id', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        const timers = captureTimers(sb); const h = held(); let holdIt = true; sb.__dbHold = (p, op) => (holdIt && /^registrations\//.test(p) && op === 'set') ? h.p : null;
        sb.submitRegistration(); await settle(); fireTimer(timers, 10000); await settle();
        assert.ok(statusText(sb).includes(STILL));
        h.resolve(); await settle(); await settle();
        assert.match(statusText(sb), /signed up/i, 'the late acknowledgement flips the screen: ' + statusText(sb));
        assert.ok(!statusText(sb).includes(STILL));
        assert.equal(el(sb, 'reg-name').value, '', 'the form clears on confirmation');
        // a NEW fill mints a NEW id
        holdIt = false; fill(sb); sb.submitRegistration(); await settle();
        const w = regWrites(sb); assert.equal(w.length, 2); assert.notEqual(w[0].path, w[1].path, 'a confirmed entry releases its id; the next golfer on this phone gets a fresh one');
    });
    test('the queued write is REFUSED after the timeout message: the status flips to the refusal sentence', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        const timers = captureTimers(sb); const h = held(); sb.__dbHold = (p, op) => (/^registrations\//.test(p) && op === 'set') ? h.p : null;
        sb.submitRegistration(); await settle(); fireTimer(timers, 10000); await settle();
        h.reject(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' })); await settle(); await settle();
        assert.ok(statusText(sb).includes(SENTENCE), statusText(sb)); assert.ok(!statusText(sb).includes(STILL));
    });
    test('a write that settles in time: the timer is disarmed and never speaks', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb);
        const timers = captureTimers(sb); let cleared = 0; sb.clearTimeout = () => { cleared++; };
        sb.submitRegistration(); await settle(); await settle();
        assert.match(statusText(sb), /signed up/i); assert.ok(cleared >= 1, 'the timer was cleared on settlement');
        fireTimer(timers, 10000); await settle();   // even if it fired late, it must not overwrite the confirmation
        assert.match(statusText(sb), /signed up/i); assert.ok(!statusText(sb).includes(STILL));
    });
});

// ---------------------------------------------------------------------------
describe('4. THE TOGGLES govern the form only', () => {
    test('no registrationFields on the record: the defaults - ghin, shirt, dinner, team (team event) shown; sponsorship hidden', async () => {
        const sb = arriveRegister(teamRecord()); await settle();
        ['reg-handicap-wrap', 'reg-shirt-wrap', 'reg-dinner-wrap', 'reg-team-wrap'].forEach((id) => assert.notEqual(display(sb, id), 'none', id));
        assert.equal(display(sb, 'reg-sponsor-wrap'), 'none');
    });
    test('shirtSize off: the box is hidden and NOT written even when it holds a value; the signup still lands with the three requireds', async () => {
        const sb = arriveRegister(teamRecord({ registrationFields: { shirtSize: false } })); await settle();
        assert.equal(display(sb, 'reg-shirt-wrap'), 'none');
        fill(sb); set(sb, 'reg-shirt', 'XL'); set(sb, 'reg-dinner', '2');
        const alerts = []; sb.alert = (m) => alerts.push(String(m)); sb.submitRegistration(); await settle(); await settle();
        const w = regWrites(sb); assert.equal(w.length, 1); assert.equal(alerts.length, 0);
        assert.ok(!('shirtSize' in w[0].value)); assert.strictEqual(w[0].value.dinnerCount, 2, 'the others are untouched');
    });
    test('every optional off: only the three requireds and createdAt are written', async () => {
        const sb = arriveRegister(teamRecord({ registrationFields: { ghinOrHandicap: false, shirtSize: false, dinnerCount: false, teamPreference: false, holeSponsorship: false } })); await settle();
        ['reg-handicap-wrap', 'reg-shirt-wrap', 'reg-dinner-wrap', 'reg-team-wrap', 'reg-sponsor-wrap'].forEach((id) => assert.equal(display(sb, id), 'none', id));
        fill(sb); set(sb, 'reg-handicap', '9'); set(sb, 'reg-team-pref', 'Eagles');
        sb.submitRegistration(); await settle(); await settle();
        assert.deepEqual(Object.keys(regWrites(sb)[0].value).sort(), ['createdAt', 'email', 'fullName', 'phone']);
    });
    test('holeSponsorship ON: the wrap shows; true + sponsorName when ticked and named, false alone otherwise', async () => {
        let sb = arriveRegister(teamRecord({ registrationFields: { holeSponsorship: true } })); await settle();
        assert.notEqual(display(sb, 'reg-sponsor-wrap'), 'none');
        fill(sb); el(sb, 'reg-sponsor').checked = true; set(sb, 'reg-sponsor-name', 'Orozco Roofing'); sb.submitRegistration(); await settle(); await settle();
        let v = regWrites(sb)[0].value; assert.strictEqual(v.holeSponsorship, true); assert.equal(v.sponsorName, 'Orozco Roofing');
        sb = arriveRegister(teamRecord({ registrationFields: { holeSponsorship: true } })); await settle(); fill(sb); sb.submitRegistration(); await settle(); await settle();
        v = regWrites(sb)[0].value; assert.strictEqual(v.holeSponsorship, false); assert.ok(!('sponsorName' in v));
    });
    test('teamPreference ON on an INDIVIDUAL event stays hidden - the event gate still applies', async () => {
        const sb = arriveRegister(individualRecord({ registrationFields: { teamPreference: true } })); await settle();
        assert.equal(display(sb, 'reg-team-wrap'), 'none');
    });
    test('the three requireds have no switch: a record that tries to switch them off changes nothing', async () => {
        const sb = arriveRegister(teamRecord({ registrationFields: { fullName: false, email: false, phone: false } })); await settle();
        set(sb, 'reg-name', ''); set(sb, 'reg-email', 'dee@example.com'); set(sb, 'reg-phone', '555-0100');
        const alerts = []; sb.alert = (m) => alerts.push(String(m)); sb.submitRegistration(); await settle();
        assert.equal(regWrites(sb).length, 0); assert.equal(alerts.length, 1);
    });
});

describe('5. THE DESK: the organizer\'s switches, and answers that outlive a switch', () => {
    test('the switches render with the defaults and a tap writes exactly one key under registrationFields', async () => {
        const sb = arriveOwner(teamRecord()); await settle(); fireRegistrations(sb, {});
        const html = el(sb, 'registration-link-row').innerHTML   /* mini-dom: a parent's innerHTML does not reflect a child's, so the row the page writes is read */;
        assert.match(html, /Ask golfers for/);
        ['ghinOrHandicap', 'shirtSize', 'dinnerCount', 'teamPreference', 'holeSponsorship'].forEach((k) => assert.ok(html.includes(`setRegistrationField('${k}'`), k));
        assert.match(html, /id="reg-field-holeSponsorship" onchange=/, 'sponsorship default OFF (no checked attribute between the id and the handler)');
        assert.match(html, /id="reg-field-shirtSize" checked onchange=/, 'shirt default ON');
        sb.setRegistrationField('shirtSize', false); await settle();
        const w = sb.__dbWrites.filter((x) => /registrationFields/.test(x.path));
        assert.equal(w.length, 1); assert.equal(w[0].path, 'tournaments/OWN1/registrationFields/shirtSize'); assert.strictEqual(w[0].value, false); assert.equal(w[0].op, 'set');
    });
    test('a switch reflects the record; a non-owner cannot reach the write', async () => {
        const sb = arriveOwner(teamRecord({ registrationFields: { shirtSize: false, holeSponsorship: true } })); await settle(); fireRegistrations(sb, {});
        const html = el(sb, 'registration-link-row').innerHTML   /* mini-dom: a parent's innerHTML does not reflect a child's, so the row the page writes is read */;
        assert.match(html, /id="reg-field-shirtSize" onchange=/); assert.match(html, /id="reg-field-holeSponsorship" checked onchange=/);
        const sb2 = loadHtmlInlineScript(PAGE, [], { search: '?tourney=OWN1' });   // anonymous visitor
        sb2.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/OWN1$/.test(h.path)).forEach((h) => h.cb({ val: () => teamRecord(), exists: () => true }));
        sb2.setRegistrationField('shirtSize', false); await settle();
        assert.equal(sb2.__dbWrites.filter((x) => /registrationFields/.test(x.path)).length, 0, 'the page guard; the rules are the boundary (tournaments/$code is open by design, recorded in HANDOFF)');
    });
    test('an entry that answered shirt size before the switch went off is still listed with its answer', async () => {
        const sb = arriveOwner(teamRecord({ registrationFields: { shirtSize: false } })); await settle();
        fireRegistrations(sb, { e1: { fullName: 'Fay Foxtrot', email: 'fay@example.com', phone: '555-0100', shirtSize: 'L', createdAt: 10 }, e2: { fullName: 'Gus Golf', email: 'gus@example.com', phone: '555-0101', createdAt: 11 } });
        const list = el(sb, 'registration-list').innerHTML;
        assert.ok(list.includes('Shirt L'), 'the desk shows what the entry carries: ' + list);
        assert.equal((list.match(/Shirt /g) || []).length, 1, 'and nothing for the entry that never answered');
    });
});

describe('6. THE SEAMS', () => {
    const js = stripComments(read(PAGE));
    test('one id per form fill, released only on confirmation; the timer is 10 s; both outcomes render after a timeout', () => {
        assert.match(js, /const REG_SEND_TIMEOUT_MS = 10000;/);
        assert.match(js, /if \(!regPendingId\) regPendingId = mintId\('e'\);/);
        assert.match(js, /regPendingId = null;/);
        assert.match(js, /function showRegistrationRefusal\(err\)/);
    });
    test('the defaults are stated once and holeSponsorship is the only OFF', () => {
        assert.match(js, /const REG_FIELD_DEFAULTS = \{ ghinOrHandicap: true, shirtSize: true, dinnerCount: true, teamPreference: true, holeSponsorship: false \};/);
    });
    test('HANDOFF names the limit: a closed page cannot flip "Still sending" to confirmed', () => {
        assert.match(read('HANDOFF.md'), /Still sending/); assert.match(read('HANDOFF.md'), /registrationFields/);
    });
});
