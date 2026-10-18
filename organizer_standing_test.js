// ============================================================================
// THE STANDING LINE IS RETIRED (job 021, Manny 2026-10-17: games and bet tracking
// are free; GPS is the paid part).
//
// From 2026-09-20 this line said where an organizer's 21-day window stood -
// "Founder pass · setting up rounds is free", "Free trial · 6 days left to set up
// new rounds" - on the lobby, the Review step and Round Ready, right before the
// wall. The LIVE rules no longer have the window (console backup of 2026-10-17,
// checked with targaryen: a day-22 organizer can create a round), the wall is gone
// (organizer_gate_test.js), and a countdown to nothing would be a false sentence.
//
// WHAT STAYS, AND IS HELD HERE: the page still reads organizers/<uid> ONCE after
// authReady (readStanding) and standingOf still describes the record - the delete
// warning in account-exit.js reads whether a pass is live. Only the words go:
// standingLine is empty for every record, and all three mounts render empty.
//
// HARNESS. The record arrives through the page's own once() read of
// organizers/<uid> (the stub answers from __dbReads); the uid is the auth stub's
// 'anon-stub'. Nothing here calls the loader.
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

describe('THE PURE PART: every record, no line', () => {
    const RECORDS = [
        ['a founder pass', { firstSeenAt: NOW - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } }],
        ['a season pass', { firstSeenAt: NOW - 40 * DAY, pass: { expiresAt: Date.UTC(2027, 2, 4), kind: 'season' } }],
        ['an expired pass', { firstSeenAt: NOW - 3 * DAY, pass: { expiresAt: NOW - 1, kind: 'season' } }],
        ['day one of the old window', { firstSeenAt: NOW }],
        ['six days left of it', trialRecord(6)],
        ['one day left of it', trialRecord(1)],
        ['long past it', { firstSeenAt: NOW - 30 * DAY }],
        ['no record', null], ['a malformed record', { firstSeenAt: 'yesterday' }], ['an unknown read', undefined]
    ];
    RECORDS.forEach(([label, rec]) => test(label + ': nothing', () => assert.equal(line(rec), '')));
    test('standingOf still describes the record (the delete warning reads it) - the data path is untouched', () => {
        const g = gate();
        assert.equal(g.standingOf({ firstSeenAt: NOW - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } }, NOW).kind, 'pass');
        assert.equal(g.standingOf(trialRecord(6), NOW).kind, 'trial');
        assert.equal(g.standingOf({ firstSeenAt: NOW - 30 * DAY }, NOW).kind, 'ended');
        assert.equal(g.standingOf(null, NOW).kind, 'none');
        assert.equal(g.standingOf(undefined, NOW), null, 'unknown stays unknown');
        assert.equal(g.TRIAL_MS, 1814400000);
        assert.equal(g.NOTICE_DAYS, undefined, 'the notice window went with the line');
    });
    test('the repo rules no longer carry the window either (job 021; the live rules had already dropped it)', () => {
        ['database.rules.json', 'database.rules.stage2-ownersetup.json'].forEach(f => {
            const r = read(f);
            assert.match(r, /"organizers"/, f + ' was read');
            assert.ok(!/1814400000/.test(r), f + ' still has the 21-day window');
        });
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

describe('THE PAGE: one read, three empty mounts, for any record', () => {
    [['a founder pass', () => ({ firstSeenAt: Date.now() - 3 * DAY, pass: { expiresAt: 4102444800000, kind: 'founder' } })],
     ['five days left of the old window', () => nowRecord(5)],
     ['a fresh stamp (a reinstall)', () => ({ firstSeenAt: Date.now() })],
     ['no record', () => null]
    ].forEach(([label, rec]) => {
        test(label + ': the lobby, Round Ready and the Review step say nothing', async () => {
            const p = page(rec());
            await p.boot();
            p.run('renderWizardReview(); renderRoundReady({ players: [] });');
            assert.equal(p.lobby(), ''); assert.equal(p.rr(), ''); assert.equal(p.wz(), '');
            assert.equal((p.sb.__onceReads || []).length, 1, 'the record is still read, once');
        });
    });
    test('the read fails, or never answers: nothing, and the page does not hang', async () => {
        const a = page(nowRecord(3), { failRead: true }); await a.boot(); a.run('renderRoundReady({ players: [] });');
        assert.equal(a.rr(), '');
        const b = page(nowRecord(3), { hang: true }); await b.boot(); b.run('renderRoundReady({ players: [] }); renderWizardReview();');
        assert.equal(b.rr(), ''); assert.equal(b.wz(), '');
        assert.equal((b.sb.__onceReads || []).length, 1, 'the read was attempted');
    });
    test('no session (authReady rejects): nothing, and no read is attempted', async () => {
        const p = page(nowRecord(3), { noSession: true });
        await p.boot(); p.run('renderRoundReady({ players: [] });');
        assert.equal(p.rr(), '');
        assert.equal((p.sb.__onceReads || []).length, 0);
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
