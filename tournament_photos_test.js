// ============================================================================
// E4 PHOTO WALL ON THE WEB (approved "as mocked" 2026-11-09): E4a post tab on
// the golfer's card, E4b the organizer's queue, E4c the public recap.
//
// EVERY TEST ARRIVES THROUGH A URL - the keyed team link, tournament.html?
// tourney=CODE as the owner or a visitor, tournament.html?tourney=CODE&recap=1 -
// and the page's OWN listeners are fired with data. Then only TAPS (the onclick
// of an element, from the page's markup or the markup it rendered). The
// callables are stand-ins recording what the page asked for (as in
// tournament_stripe_phase1_test.js). No test names a page function.
//
// WHAT mini-dom CANNOT PROVE: choosing a file, the canvas resize, the upload
// bytes, layout. Those are proven in Chrome by tournament_photo_exif_chrome_test.js
// (a photo with GPS EXIF in, no EXIF out, <= 1600 px, one upload then one
// database update) and measured by tools/tournament-photos-check.js (E4a-E4c
// screenshots).
//
// BASELINE (final file; tournament-scorecard.html + tournament.html swapped back
// to the E2 commit 77a216c2, restored by sha from a saved copy):
//   all 12 tests: 0 PASS / 12 FAIL.
//   after the build: all 12 tests: 12 PASS / 0 FAIL.
// NEGATIVE CONTROLS (each mutated in place, restored by copying a saved file
//   back, sha printed with RESTORED-OK): Photos tab on a link with no key -> P1;
//   the organizer's private listeners bound for a visitor -> Q5; a "Show all"
//   button -> Q2; reported photos not brought back -> Q4; the recap shows
//   unconfirmed contest leaders -> R1; the recap route removed -> R1-R4. All caught.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const CARD_HTML = fs.readFileSync(path.join(REPO_ROOT, 'tournament-scorecard.html'), 'utf8');
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const K4 = 'a'.repeat(32);
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const clone = (o) => JSON.parse(JSON.stringify(o));
const settle = () => new Promise((r) => setImmediate(r));
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

const teams = {};
for (let n = 1; n <= 18; n++) teams['team' + n] = { num: n, name: 'Team ' + n, players: n === 9 ? ['Ana Ruiz', 'Kim Park'] : ['Golfer ' + n], handicap: 0 };
const scores = {};
[1, 2, 3].forEach((h) => { scores['team9_h' + h] = PARS[h - 1] - 2; scores['team4_h' + h] = PARS[h - 1]; });
const EVENT = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, createdAt: 1, ownerUid: 'u-org',
    eventDate: '2026-11-21', startTime: '08:00', teams, scores,
    contests: { h7: { kind: 'kp', allowGps: true, winner: 'team7_p0', lockedAt: 9 }, h16: { kind: 'kp', allowGps: true, winner: 'team12_p1', lockedAt: 9 },
        h12: { kind: 'ld', fairwayOnly: true, allowGps: true, winner: 'team12_p0', lockedAt: 9 }, h3: { kind: 'kp', allowGps: true } } };
const ENTRIES = { h7: { team7_p0: { name: 'Dee Nguyen', team: 'team7', kind: 'kp', inches: 37, by: 'typed', at: 1 } },
    h16: { team12_p1: { name: 'Sam Ortiz', team: 'team12', kind: 'kp', inches: 144, by: 'gps', at: 2 } },
    h12: { team12_p0: { name: 'Pat Reyes', team: 'team12', kind: 'ld', yards: 301, by: 'gps', at: 3 } },
    h3: { team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 20, by: 'typed', at: 4 } } };
const PENDING = { '-Pa': { team: 'team4', caption: '7th tee', at: 1, w: 1600, h: 1200 }, '-Pb': { team: 'team9', caption: 'hole 12', at: 2, w: 1600, h: 1200 },
    '-Pc': { team: 'team12', caption: 'clubhouse', at: 3, w: 1200, h: 1600 } };
const SHOWN = {}; for (let i = 0; i < 14; i++) SHOWN['-S' + i] = { team: 'team' + (i + 1), caption: i === 0 ? 'Shotgun 8:00' : undefined, at: 10 + i, w: 1600, h: 1200 };
const HIDDEN = { '-H1': { team: 'team2', at: 1, w: 1, h: 1, hiddenAt: 5 }, '-H2': { team: 'team3', at: 1, w: 1, h: 1, hiddenAt: 5 } };

function load(page, search) {
    const sb = loadHtmlInlineScript(page, [], { search });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => { const n = make(tag); if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] }; return n; };
    sb.__calls = [];
    sb.firebase.functions = () => ({ httpsCallable: (name) => (data) => { sb.__calls.push({ name, data: clone(data) });
        return Promise.resolve({ data: name === 'photoLinks' ? { links: { '-Pa': 'https://signed.example/a', '-Pb': 'https://signed.example/b', '-Pc': 'https://signed.example/c' } } : { ok: true } }); } });
    return sb;
}
function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'the page registered no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
}
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
function tap(sb, markup, pick) {
    const tag = (markup.match(/<(button|span|a)\b[^>]*>/g) || []).find(pick);
    assert.ok(tag, 'nothing to tap');
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; });
    sb.__tapEl = { dataset: ds, textContent: '' };
    return vm.runInContext('(function () { ' + /\bonclick="([^"]*)"/.exec(tag)[1].replace(/&quot;/g, '"') + ' }).call(__tapEl)', sb);
}
const byId = (id) => (t) => new RegExp('\\bid="' + id + '"').test(t);

describe('E4a. THE GOLFER\'S PHOTOS TAB', () => {
    test('P1 a keyed team link draws Photos (Scorecard | Board | Photos, the E4a words); a link with no key draws none', () => {
        const sb = load('tournament-scorecard.html', `?tourney=PH1&team=4&k=${K4}`);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        assert.equal(shown(sb, 'tab-btn-photos'), true);
        assert.deepEqual(['scorecard', 'leaderboard', 'photos'].map((k) => el(sb, 'tab-btn-' + k).textContent), ['Scorecard', 'Board', 'Photos']);
        tap(sb, CARD_HTML, byId('tab-btn-photos'));
        assert.equal(shown(sb, 'tab-photos'), true);
        assert.equal(shown(sb, 'tab-scorecard'), false);
        const panel = plain(CARD_HTML.slice(CARD_HTML.indexOf('<div id="tab-photos"'), CARD_HTML.indexOf('<div class="ph-wall"')));
        assert.match(panel, /Caption \(optional\) Post to the event wall The organizer approves photos before anyone sees them\. Photos of other golfers: ask first\./);
        const bare = load('tournament-scorecard.html', '?tourney=PH1&team=4');
        fire(bare, /^tournaments\/PH1$/, Object.assign({}, EVENT, { contests: null }));
        assert.equal(shown(bare, 'tab-btn-photos'), false, 'no key, no Photos tab');
        assert.equal(el(bare, 'tab-btn-leaderboard').textContent, '🏆 Leaderboard', 'two tabs keep their words');
    });
    test('P2 Post with no photo chosen: a sentence, no upload, no write; opening the tab binds the public wall only', async () => {
        const sb = load('tournament-scorecard.html', `?tourney=PH1&team=4&k=${K4}`);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        tap(sb, CARD_HTML, byId('tab-btn-photos'));
        tap(sb, CARD_HTML, byId('photo-post'));
        await settle();
        assert.equal(el(sb, 'photo-msg').textContent, 'Choose a photo first.');
        assert.equal(sb.__dbWrites.length, 0);
        const paths = sb.__dbHandlers.map((h) => h.path).filter((p) => /tournamentPhotoMeta/.test(p));
        assert.deepEqual(paths, ['tournamentPhotoMeta/PH1/shown'], 'the golfer reads the shown wall and nothing else');
        fire(sb, /^tournamentPhotoMeta\/PH1\/shown$/, { '-S0': SHOWN['-S0'] });
        assert.match(html(sb, 'photo-wall'), /tournamentPhotos%2FPH1%2Fshown%2F-S0\.jpg\?alt=media/);
        assert.match(plain(html(sb, 'photo-wall')), /Team 1 · Shotgun 8:00 Report/);
    });
    test('P3 Report on the wall calls reportPhoto with the code and id, and says so', async () => {
        const sb = load('tournament-scorecard.html', `?tourney=PH1&team=4&k=${K4}`);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        tap(sb, CARD_HTML, byId('tab-btn-photos'));
        fire(sb, /^tournamentPhotoMeta\/PH1\/shown$/, { '-S0': SHOWN['-S0'] });
        tap(sb, html(sb, 'photo-wall'), (t) => /class="ph-report"/.test(t));
        await settle(); await settle();
        assert.deepEqual(sb.__calls, [{ name: 'reportPhoto', data: { code: 'PH1', photoId: '-S0' } }]);
        assert.equal(sb.__tapEl.textContent, 'Reported');
    });
});

describe('E4b. THE ORGANIZER\'S QUEUE', () => {
    function arriveOwner() {
        const sb = load('tournament.html', '?tourney=PH1');
        sb.__auth.setUser(ORGANIZER);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        tap(sb, ORG_HTML, byId('tab-btn-photos'));
        fire(sb, /^tournamentPhotoMeta\/PH1\/pending$/, PENDING);
        fire(sb, /^tournamentPhotoMeta\/PH1\/shown$/, SHOWN);
        fire(sb, /^tournamentPhotoMeta\/PH1\/hidden$/, HIDDEN);
        fire(sb, /^tournamentPhotoMeta\/PH1\/reports$/, {});
        return sb;
    }
    test('Q1 the owner taps Photos: "Photos waiting · 3", each with its label, Show and Hide, the counts line; links asked once', async () => {
        const sb = arriveOwner();
        await settle(); await settle();
        assert.equal(shown(sb, 'manage-tab-photos'), true);
        assert.equal(el(sb, 'photo-queue-title').textContent, 'Photos waiting · 3');
        const q = plain(html(sb, 'photo-queue'));
        assert.match(q, /Team 4 · 7th tee ✓ Show Hide Team 9 · hole 12 ✓ Show Hide Team 12 · clubhouse ✓ Show Hide/);
        assert.match(html(sb, 'photo-queue'), /src="https:\/\/signed\.example\/a"/, 'the pending photo is drawn from its signed link');
        assert.equal(plain(html(sb, 'photo-counts')), 'On the wall: 14 · Hidden: 2 every photo is checked');
        assert.equal(sb.__calls.filter((c) => c.name === 'photoLinks').length, 1);
        assert.deepEqual(sb.__calls[0].data, { code: 'PH1' });
    });
    test('Q2 no "approve all": every action names one photo', () => {
        const sb = arriveOwner();
        const tags = (html(sb, 'photo-queue') + ORG_HTML.slice(ORG_HTML.indexOf('<div id="manage-tab-photos"'), ORG_HTML.indexOf('</div>', ORG_HTML.indexOf('id="photo-counts"')))).match(/<button\b[^>]*>[^<]*/g) || [];
        assert.equal(tags.length, 6, 'positive: six buttons, two per photo');
        tags.forEach((t) => { assert.match(t, /data-photo="-P[abc]"/); assert.doesNotMatch(t, /\ball\b/i); });
    });
    test('Q3 Show runs approvePhoto, Hide runs hidePhoto, each for that one photo; the page writes nothing itself', async () => {
        const sb = arriveOwner();
        await settle();
        const before = sb.__dbWrites.length;
        tap(sb, html(sb, 'photo-queue'), (t) => /data-photo="-Pb"/.test(t) && /showPhoto/.test(t));
        await settle(); await settle();
        tap(sb, html(sb, 'photo-queue'), (t) => /data-photo="-Pc"/.test(t) && /hidePhoto/.test(t));
        await settle(); await settle();
        assert.deepEqual(sb.__calls.filter((c) => c.name !== 'photoLinks'), [
            { name: 'approvePhoto', data: { code: 'PH1', photoId: '-Pb' } }, { name: 'hidePhoto', data: { code: 'PH1', photoId: '-Pc' } }]);
        assert.equal(sb.__dbWrites.length, before, 'the move is the callable\'s, not the page\'s');
    });
    test('Q4 a REPORTED photo on the wall comes back into the queue, flagged', () => {
        const sb = arriveOwner();
        fire(sb, /^tournamentPhotoMeta\/PH1\/reports$/, { '-S0': { count: 2, lastAt: 9 } });
        assert.equal(el(sb, 'photo-queue-title').textContent, 'Photos waiting · 4');
        assert.match(plain(html(sb, 'photo-queue')), /Team 1 · Shotgun 8:00 Reported · 2 ✓ Show Hide/);
    });
    test('Q5 a visitor: no Photos tab, and nothing private is even asked for', () => {
        const sb = load('tournament.html', '?tourney=PH1');
        sb.__auth.setUser(null);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        assert.equal((el(sb, 'tab-btn-photos').style || {}).display, 'none');
        assert.deepEqual(sb.__dbHandlers.map((h) => h.path).filter((p) => /tournamentPhotoMeta/.test(p)), []);
        assert.equal(shown(sb, 'manage-tab-leaderboard'), true, 'positive: the visitor is on the board');
    });
});

describe('E4c. THE RECAP: tournament.html?tourney=CODE&recap=1', () => {
    function arriveRecap(user) {
        const sb = load('tournament.html', '?tourney=PH1&recap=1');
        sb.__auth.setUser(user === undefined ? null : user);
        fire(sb, /^tournaments\/PH1$/, EVENT);
        fire(sb, /^contestEntries\/PH1$/, ENTRIES);
        fire(sb, /^tournamentPhotoMeta\/PH1\/shown$/, { '-S0': SHOWN['-S0'], '-S6': { team: 'team7', at: 50, w: 1, h: 1 } });
        return sb;
    }
    test('R1 title, date line, winners (the board\'s rank 1), CONFIRMED contest winners only, shown photos, Share', () => {
        const sb = arriveRecap();
        assert.equal(shown(sb, 'recap-screen'), true);
        assert.equal(shown(sb, 'manage-screen'), false);
        assert.equal(el(sb, 'recap-title').textContent, 'Rattle Classic recap');
        assert.equal(el(sb, 'recap-sub').textContent, 'Sat Nov 21 · Papago · 18 teams');
        const w = plain(html(sb, 'recap-winners'));
        assert.match(w, /🏆 Winners Team 9 · Ruiz \/ Park -6/);
        assert.match(w, /⛳ KP 7 \/ 16 Dee Nguyen · Sam Ortiz/);
        assert.match(w, /🏌️ Long drive 12 Pat Reyes 301 yds/);
        assert.doesNotMatch(w, /Al Lopez/, 'hole 3 has no confirmed winner: not on the recap');
        const p = html(sb, 'recap-photos');
        assert.match(p, /shown%2F-S0\.jpg\?alt=media/); assert.match(p, /shown%2F-S6\.jpg/);
        assert.match(plain(p), /Team 1 · Shotgun 8:00 Report Team 7 Report/);
        assert.match(ORG_HTML, /id="recap-share"[^>]*>Share recap link</);
    });
    test('R2 read-only for EVERYONE, the owner included: no Show, Hide, Make winner, no private read', () => {
        const sb = arriveRecap(ORGANIZER);
        const all = html(sb, 'recap-winners') + html(sb, 'recap-photos');
        assert.ok(all.length > 100, 'positive: the recap rendered');
        assert.doesNotMatch(all, /showPhoto|hidePhoto|makeContestWinner|removeContestEntry/);
        assert.deepEqual(sb.__dbHandlers.map((h) => h.path).filter((p) => /tournamentPhotoMeta/.test(p)), ['tournamentPhotoMeta/PH1/shown']);
        assert.equal(sb.__dbHandlers.filter((h) => /^registrations|^tournamentKeys/.test(h.path)).length, 0);
    });
    test('R3 Report on a recap photo calls reportPhoto (no sign-in) and thanks the visitor', async () => {
        const sb = arriveRecap();
        tap(sb, html(sb, 'recap-photos'), (t) => /data-photo="-S6"/.test(t));
        await settle(); await settle();
        assert.deepEqual(sb.__calls, [{ name: 'reportPhoto', data: { code: 'PH1', photoId: '-S6' } }]);
        assert.equal(el(sb, 'recap-msg').textContent, 'Thanks. The organizer will look at it.');
    });
    test('R4 Share recap link hands over the read-only recap URL', async () => {
        const sb = arriveRecap();
        let copied = null;
        sb.navigator.clipboard = { writeText: (u) => { copied = u; return Promise.resolve(); } };
        tap(sb, ORG_HTML, byId('recap-share'));
        await settle();
        assert.match(String(copied), /tournament\.html\?tourney=PH1&recap=1$/);
    });
});
