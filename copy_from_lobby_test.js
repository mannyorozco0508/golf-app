// ============================================================================
// START FROM A PREVIOUS ROUND - copyFrom gets a lobby field, and survives the tile
//
// THE GAP (recon, 2026-09-13): admin.html?game=NEW&copyFrom=OLD has always
// prefilled a new round from an old one, but nothing on the Consumer lobby
// emitted it (the field was removed 2026-08-10), and trip.html's "copy from
// round" select sent ?trip=T&copyFrom=OLD to a lobby that minted a code and
// navigated WITHOUT copyFrom - so that select had never prefilled anything.
//
// THE FIX (admin.html only): a lobby field, startFromPreviousRound(), that
// checks the source (exists, has golfers), THEN mints, THEN navigates with
// both params; and createRoom carries copyFrom onto the minted URL. The
// arrival guard is untouched: the copy still runs only on a code with no
// players.
//
// HARNESS. The sandbox's window is the sandbox, so `window.location.href = x`
// lands in sb.location.href and the destination can be read. The db stub's
// once() is patched per code to answer exists / no players / not found; the
// issuer is real (code-issuer.js) and asks that same stub whether the minted
// code is free.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const run = (sb, e) => vm.runInContext(e, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const CD = makeCourseData(18);
const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [2, 9, 15, 4], 101, ['A', 'B', 'A', 'B']);
const SOURCE = { eventName: 'Thu', gameFormat: 'stroke', activeCourseKey: 'comm_links', courseName: 'Test Links', players: J(PLAYERS),
    courseData: CD, scores: { p101_h1: 4 }, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, groupSizeOverrides: { 0: 2, 1: 2 } };

// A lobby (no ?game), with the db stub answering per code: records[code] is the
// round, or null for "no such round". Every other code is free (the issuer's
// existence check reads null).
function lobby(records, search) {
    const sb = loadHtmlInlineScript('admin.html', [], search ? { search } : undefined);
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function (m) { window.__alerts.push(String(m)); }; window.__alerts = []; window.__once = [];');
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        const m = /^events\/([A-Z0-9]+)$/.exec(p);
        r.once = () => {
            run(sb, 'window.__once.push(' + JSON.stringify(p) + ')');
            const rec = m && Object.prototype.hasOwnProperty.call(records, m[1]) ? records[m[1]] : null;
            return Promise.resolve({ val: () => (rec ? J(rec) : null), exists: () => rec != null });
        };
        return r;
    };
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    return sb;
}
const settle = () => new Promise(r => setTimeout(r, 40));
const dest = (sb) => String(sb.location.href);
const alerts = (sb) => J(run(sb, 'window.__alerts'));
const onces = (sb) => J(run(sb, 'window.__once'));
const params = (href) => Object.fromEntries([...new URLSearchParams(href.split('?')[1] || '')]);

describe('FIX 1 - the lobby field', () => {
    test('a valid source: the source is read, a NEW code is minted, and the page navigates with BOTH params', async () => {
        const sb = lobby({ OLDR1: SOURCE });
        run(sb, "document.getElementById('copy-code-input').value = 'oldr1'; startFromPreviousRound(document.getElementById('copy-code-btn'))");
        await settle();
        const p = params(dest(sb));
        assert.match(dest(sb), /^admin\.html\?game=/, 'navigated to the wizard: ' + dest(sb));
        assert.equal(p.copyFrom, 'OLDR1');
        assert.match(p.game, /^[A-Z0-9]{6}$/, 'a minted six-character code: ' + p.game);
        assert.notEqual(p.game, 'OLDR1');
        assert.equal(p.eventType, 'quick');
        assert.deepEqual(alerts(sb), []);
        // ORDER: the source was read BEFORE the issuer checked the new code.
        const reads = onces(sb);
        assert.equal(reads[0], 'events/OLDR1', 'the source is checked first: ' + JSON.stringify(reads));
        assert.ok(reads.slice(1).some(r => r === 'events/' + p.game), 'then the minted code was checked free');
    });
    test('a pasted link works as a code too', async () => {
        const sb = lobby({ OLDR2: SOURCE });
        run(sb, "document.getElementById('copy-code-input').value = 'https://x.test/index.html?game=OLDR2&group=1'; startFromPreviousRound(document.getElementById('copy-code-btn'))");
        await settle();
        assert.equal(params(dest(sb)).copyFrom, 'OLDR2');
    });
    test('the copied wizard: arriving on the minted URL shows the banner and the roster with tags, at Step 3', async () => {
        const sb = lobby({ OLDR3: SOURCE }, '?game=NEWR3&copyFrom=OLDR3');
        run(sb, 'document.__mount(document.getElementById("player-list"));');
        await settle(); await settle();
        assert.equal(run(sb, "document.getElementById('copy-from-banner').style.display"), 'block');
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 4);
        assert.deepEqual(J(run(sb, 'captureCurrentPlayerInputs().map(function (p) { return [p.id, p.flight]; })')), [[101, 'A'], [102, 'B'], [103, 'A'], [104, 'B']]);
        assert.equal(run(sb, 'loadedExistingRound'), false, 'a copy is a NEW round');
    });
    test('a source that does not exist: nothing minted, nothing navigated, the organizer is told', async () => {
        const sb = lobby({});
        const before = dest(sb);
        run(sb, "document.getElementById('copy-code-input').value = 'NOPE99'; startFromPreviousRound(document.getElementById('copy-code-btn'))");
        await settle();
        assert.equal(dest(sb), before, 'no navigation');
        assert.deepEqual(onces(sb), ['events/NOPE99'], 'only the source was read - the issuer was never asked');
        assert.equal(alerts(sb).length, 1);
        assert.match(alerts(sb)[0], /No round with the code NOPE99/);
        assert.match(alerts(sb)[0], /Nothing was started/);
        assert.equal(run(sb, "document.getElementById('copy-code-btn').getAttribute('aria-disabled')"), null, 'the button is usable again');
    });
    test('a source that exists but has no golfers: rejected the same way', async () => {
        const sb = lobby({ EMPTY1: { eventName: 'E', gameFormat: 'stroke', courseData: CD } });
        const before = dest(sb);
        run(sb, "document.getElementById('copy-code-input').value = 'EMPTY1'; startFromPreviousRound(document.getElementById('copy-code-btn'))");
        await settle();
        assert.equal(dest(sb), before);
        assert.deepEqual(onces(sb), ['events/EMPTY1']);
        assert.match(alerts(sb)[0], /has no golfers to copy/);
    });
    test('an empty field asks for a code and reads nothing', async () => {
        const sb = lobby({ OLDR1: SOURCE });
        run(sb, "document.getElementById('copy-code-input').value = ''; startFromPreviousRound(document.getElementById('copy-code-btn'))");
        await settle();
        assert.deepEqual(onces(sb), []);
        assert.match(alerts(sb)[0], /Enter the code/);
    });
    test('the arrival guard is untouched: a source typo that names a LIVE round cannot open it as an edit, because the NEW code is the one that opens', async () => {
        // The minted code has no players, so the copy runs; the source is only read.
        const sb = lobby({ OLDR4: SOURCE }, '?game=NEWR4&copyFrom=OLDR4');
        run(sb, 'document.__mount(document.getElementById("player-list"));');
        await settle(); await settle();
        assert.equal(run(sb, 'currentMode'), 'NEWR4');
        assert.equal(run(sb, 'loadedExistingRound'), false);
        assert.ok(!sb.__dbWrites.some(w => w.path.startsWith('events/OLDR4')), 'nothing written to the source');
        assert.match(ADMIN, /if \(!data\.players \|\| data\.players\.length === 0\) \{\s*if \(copyFromCode\) \{/, 'the copy runs only on a code with no players');
    });
});

describe('FIX 2 - createRoom carries copyFrom (the trip path)', () => {
    test('arriving from trip.html as ?trip=T1&copyFrom=OLDT1, the tile mints and the minted URL carries trip AND copyFrom', async () => {
        const sb = lobby({ OLDT1: SOURCE }, '?trip=T1&copyFrom=OLDT1');
        run(sb, "selectHomeWidget('quick')");          // the tile's own handler -> createRoom
        await settle();
        const p = params(dest(sb));
        assert.match(p.game, /^[A-Z0-9]{6}$/);
        assert.equal(p.trip, 'T1');
        assert.equal(p.copyFrom, 'OLDT1');
        assert.equal(p.eventType, 'quick');
    });
    test('a plain tile tap carries nothing extra', async () => {
        const sb = lobby({});
        run(sb, "selectHomeWidget('quick')");
        await settle();
        const p = params(dest(sb));
        assert.deepEqual(Object.keys(p).sort(), ['eventType', 'game']);
    });
    test('the other params this page reads are the lobby\'s own (group, fresh) or chosen by the tile (eventType): none is dropped', () => {
        const reads = [...ADMIN.matchAll(/urlParams\.get\('([A-Za-z]+)'\)/g)].map(m => m[1]);
        assert.deepEqual([...new Set(reads)].sort(), ['copyFrom', 'eventType', 'fresh', 'game', 'group', 'trip']);
        const cr = ADMIN.slice(ADMIN.indexOf('async function createRoom('), ADMIN.indexOf('function reportCodeIssueFailure('));
        assert.match(cr, /if \(tripLinkCode\) dest \+= `&trip=\$\{tripLinkCode\}`;/);
        assert.match(cr, /if \(copyFromCode\) dest \+= `&copyFrom=\$\{encodeURIComponent\(copyFromCode\)\}`;/);
    });
});

describe('THE SEAM (source)', () => {
    test('the lobby has the field, the order is check -> mint -> navigate, and one parser serves both code fields', () => {
        assert.match(ADMIN, /<input type="text" id="copy-code-input"/);
        assert.match(ADMIN, /onclick="startFromPreviousRound\(this\)"/);
        const fn = ADMIN.slice(ADMIN.indexOf('async function startFromPreviousRound('), ADMIN.indexOf('\n    function ', ADMIN.indexOf('async function startFromPreviousRound(') + 10));
        const iRead = fn.indexOf("db.ref('events/' + code).once('value')");
        const iPlayers = fn.indexOf('source.players.length === 0');
        const iMint = fn.indexOf('issueUniqueCode(');
        const iNav = fn.indexOf('window.location.href = dest');
        assert.ok(iRead > 0 && iPlayers > iRead && iMint > iPlayers && iNav > iMint, 'read ' + iRead + ' < players ' + iPlayers + ' < mint ' + iMint + ' < navigate ' + iNav);
        assert.match(fn, /&copyFrom=\$\{code\}/);
        assert.equal((ADMIN.match(/parseRoundCodeInput\(/g) || []).length, 3, 'defined once, called from both fields');
    });
});
