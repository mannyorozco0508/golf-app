// ============================================================================
// A LINE THAT SAYS WHERE THE TRIAL STANDS (2026-09-20)
//
// The Wave 2 gate refuses a new round once an organizer's 21 days are up, and
// until now the wall was the first anyone heard of it - on a first tee, with the
// round typed in and not saved. Nothing read organizers/<uid>/firstSeenAt except
// the gate's own explainRefusal, after the refusal.
//
// organizers/<uid> is readable by its own uid (database.rules.json), so after
// authReady the page reads it ONCE (organizer-gate.js readStanding, raced
// against a short timer like explainRefusal) and says one line, on Round Ready
// and on the wizard's Review step - the two screens an organizer stands on
// right before the wall:
//
//   a live pass         "Founder pass · setting up rounds is free"
//                       (another kind: "Season pass · rounds free to set up until
//                       Mar 4, 2027")
//   inside the window   "Free trial · 6 days left to set up new rounds", every
//                       day of it (NOTICE_DAYS is 21, the whole window); "1 day
//                       left" on the last day
//   otherwise           nothing - ended (the wall speaks), no record (not an
//                       organizer), the read failed or timed out (say nothing
//                       rather than guess)
//
// THIS IS THE TELL for the uid problem: a pass is attached to the device's
// storage, not to Manny. A reinstall signs in as a new uid and the next round
// starts a fresh 21 days. A phone that said "Founder pass" yesterday and says
// "Free trial · 21 days left" today is how he finds out - a sentence APPEARING,
// which is why NOTICE_DAYS is the whole window and not a week (at 7 the fresh
// trial was silent for two weeks and the signal was an absence).
//
// HARNESS. The record arrives through the page's own once() read of
// organizers/<uid> (the stub answers from __dbReads); the uid is the auth
// stub's 'anon-stub'. The pure functions take `now` so a distance is a number,
// not a wait. No rules change - page-only, plus organizer-gate.js.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const settle = () => new Promise(r => setTimeout(r, 30));
const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);   // 2026-09-20T12:00Z
const TRIAL = 21 * DAY;

function gate() {
    const sb = { window: {}, setTimeout, clearTimeout, Date, Math, String, Number, Promise };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('organizer-gate.js'), sb, { filename: 'organizer-gate.js' });
    return sb.organizerGate;
}
const line = (record, now) => { const g = gate(); return g.standingLine(g.standingOf(record, now === undefined ? NOW : now)); };
const trialRecord = daysLeft => ({ firstSeenAt: NOW + daysLeft * DAY - TRIAL });   // ends exactly daysLeft days from NOW

describe('THE PURE PART: a record and a clock in, one line out', () => {
    test('a founder pass', () => {
        assert.equal(line({ firstSeenAt: NOW - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } }), 'Founder pass · setting up rounds is free');
    });
    test('another kind of pass names itself and its date', () => {
        assert.equal(line({ firstSeenAt: NOW - 40 * DAY, pass: { expiresAt: Date.UTC(2027, 2, 4), kind: 'season' } }), 'Season pass · rounds free to set up until Mar 4, 2027');
        assert.equal(line({ firstSeenAt: NOW - 40 * DAY, pass: { expiresAt: Date.UTC(2027, 2, 4) } }), 'Pass · rounds free to set up until Mar 4, 2027');
    });
    test('a pass that has EXPIRED is not a pass: the trial (or the wall) decides', () => {
        assert.equal(line({ firstSeenAt: NOW - 3 * DAY, pass: { expiresAt: NOW - 1, kind: 'season' } }), 'Free trial · 18 days left to set up new rounds');
        assert.equal(line({ firstSeenAt: NOW - 16 * DAY, pass: { expiresAt: NOW - 1 } }), 'Free trial · 5 days left to set up new rounds');
    });
    test('inside the window at several distances: counted every day of it, 21 down to 1', () => {
        assert.equal(line(trialRecord(21)), 'Free trial · 21 days left to set up new rounds');
        assert.equal(line(trialRecord(14)), 'Free trial · 14 days left to set up new rounds');
        assert.equal(line(trialRecord(8)), 'Free trial · 8 days left to set up new rounds');
        assert.equal(line(trialRecord(7)), 'Free trial · 7 days left to set up new rounds');
        assert.equal(line(trialRecord(6)), 'Free trial · 6 days left to set up new rounds');
        assert.equal(line(trialRecord(2)), 'Free trial · 2 days left to set up new rounds');
        assert.equal(line(trialRecord(1)), 'Free trial · 1 day left to set up new rounds');
    });
    test('a partial day counts as a day - it ends TODAY, so "1 day left", never "0 days"', () => {
        assert.equal(line({ firstSeenAt: NOW + 6 * 3600000 - TRIAL }), 'Free trial · 1 day left to set up new rounds');   // six hours left
        assert.equal(line({ firstSeenAt: NOW + 7 * DAY + 1 - TRIAL }), 'Free trial · 8 days left to set up new rounds', 'a hair over seven days is the eighth day');
        assert.equal(line({ firstSeenAt: NOW + 7 * DAY - TRIAL }), 'Free trial · 7 days left to set up new rounds');
        assert.equal(line({ firstSeenAt: NOW }), 'Free trial · 21 days left to set up new rounds', 'stamped this second: the whole window ahead, said');
    });
    test('the counting agrees with the rule, to the millisecond: the day the rule closes is the day the line stops', () => {
        // the rule: now < firstSeenAt + 1814400000
        const rec = { firstSeenAt: NOW - TRIAL + 1 };   // 1 ms left
        assert.equal(line(rec, NOW), 'Free trial · 1 day left to set up new rounds');
        assert.equal(line(rec, NOW + 1), '', 'closed: the wall speaks now, not this line');
    });
    test('outside the window: nothing (the wall is the sentence for that)', () => {
        assert.equal(line({ firstSeenAt: NOW - 30 * DAY }), '');
    });
    test('no record, a malformed record, an unknown read: nothing', () => {
        assert.equal(line(null), '');
        assert.equal(line({}), '');
        assert.equal(line({ firstSeenAt: 'yesterday' }), '');
        assert.equal(line(undefined), '');
        const g = gate();
        assert.equal(g.standingLine(g.standingOf(undefined, NOW)), '');
        assert.equal(g.standingOf(undefined, NOW), null, 'unknown stays unknown');
    });
    test('the two constants are the gate\'s: 21 days from the rule, and notice for all of them', () => {
        const g = gate();
        assert.equal(g.TRIAL_MS, 1814400000);
        assert.equal(g.NOTICE_DAYS, 21, 'the tell needs the trial line present from day one');
        assert.match(read('database.rules.json'), /firstSeenAt'\)\.val\(\) \+ 1814400000/);
    });
});

// ---------------------------------------------------------------------------
// admin.html: the line arrives through the page's own read, after authReady.
// THE PAGE LOADS ITSELF: loadOrganizerStanding() runs when admin.html's script
// runs, so everything a test needs to shape - the record, a failing or hanging
// read, a rejected session - is put in place BEFORE the page runs, through the
// harness's beforeRun hook. boot() only waits. Nothing here calls the loader.
function page(record, opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: o.search || '', beforeRun(sandbox) {
        if (record !== undefined) sandbox.__dbReads = { 'organizers/anon-stub': record };
        if (o.failRead) sandbox.__standingFail = true;
        if (o.hang) sandbox.__standingHang = true;
        if (o.noSession) { sandbox.__auth.setUser(null); sandbox.firebase.auth().signInAnonymously = () => Promise.reject(Object.assign(new Error('network'), { code: 'auth/network-request-failed' })); }
        // db is a lexical const in the page (`const db = firebase.database()`),
        // so wrap the factory: the stub's ref() is intercepted for the one path.
        const realDatabase = sandbox.firebase.database.bind(sandbox.firebase);
        sandbox.firebase.database = function () {
            const v = realDatabase();
            if (!v.__standingWrapped) {
                v.__standingWrapped = true;
                const realRef = v.ref.bind(v);
                v.ref = function (p) { const r = realRef(p); if (p === 'organizers/anon-stub') { const once = r.once.bind(r);
                    r.once = function () { (sandbox.__onceReads = sandbox.__onceReads || []).push(p);
                        if (sandbox.__standingFail) return Promise.reject(new Error('socket closed'));
                        if (sandbox.__standingHang) return new Promise(function () {});
                        return once.apply(r, arguments); }; }
                    return r; };
            }
            return v;
        };
    } });
    vm.runInContext("document.__mount(document.getElementById('lobby-standing')); document.__mount(document.getElementById('rr-standing')); document.__mount(document.getElementById('wz-standing'));", sb);
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        boot: async () => { for (let i = 0; i < 6; i++) await settle(); },
        lobby: () => String(vm.runInContext("document.getElementById('lobby-standing').textContent || ''", sb)).trim(),
        rr: () => String(vm.runInContext("document.getElementById('rr-standing').textContent || ''", sb)).trim(),
        wz: () => String(vm.runInContext("document.getElementById('wz-standing').textContent || ''", sb)).trim(),
    };
}
const nowRecord = daysLeft => ({ firstSeenAt: Date.now() + daysLeft * DAY - TRIAL });

describe('THE PAGE: Round Ready and the Review step say the same line, from one read', () => {
    test('a founder pass, on all three screens - the lobby the moment the read answers, with no render call', async () => {
        const p = page({ firstSeenAt: Date.now() - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } });
        await p.boot();
        assert.equal(p.lobby(), 'Founder pass · setting up rounds is free', 'the home screen, from the load alone');
        p.run('renderWizardReview(); renderRoundReady({ players: [] });');
        assert.equal(p.rr(), 'Founder pass · setting up rounds is free');
        assert.equal(p.wz(), 'Founder pass · setting up rounds is free');
    });
    test('five days left, and twenty days left, on all three screens', async () => {
        const a = page(nowRecord(5)); await a.boot(); a.run('renderWizardReview(); renderRoundReady({ players: [] });');
        assert.equal(a.lobby(), 'Free trial · 5 days left to set up new rounds');
        assert.equal(a.rr(), 'Free trial · 5 days left to set up new rounds');
        assert.equal(a.wz(), 'Free trial · 5 days left to set up new rounds');
        const b = page(nowRecord(20)); await b.boot(); b.run('renderWizardReview(); renderRoundReady({ players: [] });');
        assert.equal(b.lobby(), 'Free trial · 20 days left to set up new rounds');
        assert.equal(b.rr(), 'Free trial · 20 days left to set up new rounds'); assert.equal(b.wz(), 'Free trial · 20 days left to set up new rounds');
    });
    test('THE TELL: the same home screen, a fresh record with no pass - a sentence appears', async () => {
        const before = page({ firstSeenAt: Date.now() - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } });
        await before.boot();
        assert.equal(before.lobby(), 'Founder pass · setting up rounds is free');
        const after = page({ firstSeenAt: Date.now() });   // a reinstall: a new uid, a fresh stamp, no pass
        await after.boot();
        assert.equal(after.lobby(), 'Free trial · 21 days left to set up new rounds', 'day one of a trial this phone should not be on - the tell');
    });
    test('not an organizer (no record): nothing, on any screen', async () => {
        const p = page(null); await p.boot(); p.run('renderWizardReview(); renderRoundReady({ players: [] });');
        assert.equal(p.lobby(), ''); assert.equal(p.rr(), ''); assert.equal(p.wz(), '');
    });
    test('the read fails: nothing said, nothing guessed', async () => {
        const p = page(nowRecord(3), { failRead: true }); await p.boot(); p.run('renderRoundReady({ players: [] });');
        assert.equal(p.rr(), '');
    });
    test('the read never answers: nothing, and the page does not hang on it', async () => {
        // READ_MS is the gate's 2500 ms; the mounts stay empty throughout (the
        // timer resolves to unknown later, which also says nothing).
        const p = page(nowRecord(3), { hang: true });
        await p.boot(); p.run('renderRoundReady({ players: [] }); renderWizardReview();');
        assert.equal(p.rr(), ''); assert.equal(p.wz(), '');
        assert.equal((p.sb.__onceReads || []).length, 1, 'the read was attempted');
    });
    test('no session (authReady rejects): nothing, and no read is attempted', async () => {
        const p = page(nowRecord(3), { noSession: true });
        await p.boot(); p.run('renderRoundReady({ players: [] });');
        assert.equal(p.rr(), '');
        assert.equal((p.sb.__onceReads || []).length, 0);
    });
    test('the record is read ONCE, by the page on load, and rendered from memory on every screen after', async () => {
        const p = page(nowRecord(4));
        await p.boot();
        p.run('renderWizardReview(); renderRoundReady({ players: [] }); renderWizardReview();');
        assert.equal((p.sb.__onceReads || []).length, 1);
        assert.equal(p.wz(), 'Free trial · 4 days left to set up new rounds');
        assert.equal(p.rr(), 'Free trial · 4 days left to set up new rounds');
    });
    test('the mounts exist where the organizer stands: the lobby, Round Ready and the Review step, and nowhere the golfer does', () => {
        const a = read('admin.html');
        assert.match(a, /id="lobby-standing"/); assert.match(a, /id="rr-standing"/); assert.match(a, /id="wz-standing"/);
        // REPOINTED BY UI WAVE 7, and it needed repointing even though it was still
        // PASSING - which is the interesting part. #account-modal happens to sit
        // between the tiles and Resume in document order, so "above Resume, under
        // the tiles" stayed true by POSITION after the element moved inside that
        // modal, while the claim it was making - that the line is on the home screen
        // - had become false. An assertion that survives the thing it describes is
        // worse than one that fails.
        //
        // WHY IT MOVED: the standing line is what this account IS, not a control to
        // act on, and it sat above Resume where it read as one. It is in the Account
        // panel now. Same one read and the same writer - the id is unchanged, so
        // renderOrganizerStanding still writes the same string into the same three
        // places.
        const panelStart = a.indexOf('id="account-modal"');
        const panelEnd = a.indexOf('</div>', a.indexOf('id="email-link-status"'));
        assert.ok(panelStart > -1, 'the account panel is gone');
        assert.ok(a.indexOf('id="lobby-standing"') > panelStart,
            'the standing line is back on the home screen instead of in the Account panel');
        assert.ok(a.indexOf('id="lobby-standing"') < panelEnd,
            'the standing line is outside the account panel');
        assert.ok(a.indexOf('id="wz-standing"') < a.indexOf('id="main-save-btn"'), 'on Review, above the Save button');
        assert.doesNotMatch(read('index.html'), /rr-standing|wz-standing|loadOrganizerStanding/, 'the scorecard has no organizer line');
        assert.match(a, /loadOrganizerStanding\(\)/, 'the page loads it');
    });
});
