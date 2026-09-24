// ============================================================================
// THE supersededBy GUARD (2026-09-22, v191)
//
// WHAT HAPPENED 2026-09-21: the Sunday-night round ZZ47KK (its links already
// in the group text) was replaced Monday morning by X7Z8HM; three groups
// opened the old link and scored the whole way on the wrong code. Nothing in
// the app said the round had been replaced.
//
// THE GUARD, two halves:
//   admin.html - on saving a NEW round, the wizard looks for a round THIS
//   DEVICE saved in the last 7 days (localStorage golfapp_saved_rounds,
//   written at every successful save - a device-local list, so "owned" means
//   saved here; a round made on another device is not seen, stated), reads
//   each, keeps one that is this uid's (ownerUid), UNFINISHED (some golfer
//   is missing some hole) and shares at least half the new roster's names
//   (normalised: case, spaces, a trailing dot). Round Ready then shows
//     ☑ Retire ZZ47KK — anyone who opens it is sent here.
//   CHECKED BY DEFAULT: the write events/ZZ47KK/supersededBy = "X7Z8HM"
//   fires when the row renders; unticking writes null (undo); ticking again
//   writes it back. One key on the old round, nothing else.
//   index.html - a round carrying supersededBy shows a full-width banner
//   "This round was replaced by X7Z8HM — tap to open your group there"
//   (index.html?game=X7Z8HM, &group= carried), every score box disabled on
//   both views (the Full Card cell is what Hole View clones), saveScore refused
//   even from the console (canWritePlayer), and the group picker shows the
//   banner instead of the groups. A round without the key is untouched.
//
// No engine, no rules. Names: helpers/wizard-saved-round.js rosters.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
const CD = makeCourseData(18);
const DAY = 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
describe('THE DETECTION (admin.html, pure)', () => {
    const sb = loadHtmlInlineScript('admin.html', []);
    const names = (...n) => n.map((name, i) => ({ id: 101 + i, name }));
    const overlap = (a, b) => run(sb, 'rosterOverlap(' + JSON.stringify(a) + ', ' + JSON.stringify(b) + ')');
    const rosterOverlapOf = overlap;
    test('name overlap counts normalised names: case, spaces, a trailing dot', () => {
        assert.equal(overlap(names('Randy T', 'Marty', 'Mike'), names('randy t', 'MARTY.', 'Mike ', 'Glen')), 3);
        assert.equal(overlap(names('Ann', 'Ben'), names('Cal', 'Dee')), 0);
        assert.equal(overlap([], names('Ann')), 0);
    });
    test('roundUnfinished: any golfer missing any hole; every card in = finished; no players = not a round to retire', () => {
        const full = wizardSavedRound({ code: 'F', courseData: CD, thru: 18 });
        assert.equal(run(sb, 'roundUnfinished(' + JSON.stringify(full) + ')'), false);
        const part = wizardSavedRound({ code: 'P', courseData: CD, thru: 9 });
        assert.equal(run(sb, 'roundUnfinished(' + JSON.stringify(part) + ')'), true);
        const none = wizardSavedRound({ code: 'N', courseData: CD, thru: 0 });
        assert.equal(run(sb, 'roundUnfinished(' + JSON.stringify(none) + ')'), true);
        assert.equal(run(sb, 'roundUnfinished({ players: [], courseData: [], scores: {} })'), false);
    });
    test('supersedeCandidate: this uid, unfinished, < 7 days, at least half the names, not the new code itself', () => {
        const NEW = wizardSavedRound({ code: 'NEW1', courseData: CD, thru: 0 });
        const old = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9, ownerUid: 'me' });
        const now = Date.now();
        const pick = (entries, records) => run(sb, 'supersedeCandidate(' + JSON.stringify(NEW) + ', "NEW1", "me", ' + JSON.stringify(entries) + ', ' + JSON.stringify(records) + ', ' + now + ')');
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], { OLD1: old }), 'OLD1');
        assert.equal(pick([{ code: 'OLD1', at: now - 8 * DAY }], { OLD1: old }), null, 'CONTROL: 8 days old');
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], { OLD1: Object.assign({}, old, { ownerUid: 'somebody-else' }) }), null, 'CONTROL: another owner');
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], { OLD1: wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 18, ownerUid: 'me' }) }), null, 'CONTROL: finished');
        // 23 golfers: half is 12. Rename 12 -> 11 shared (below); restore one -> 12 shared (at).
        const few = J(old); few.players = few.players.map((p, i) => (i < 12 ? Object.assign({}, p, { name: 'Stranger ' + i }) : p));
        assert.equal(rosterOverlapOf(NEW.players, few.players), 11);
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], { OLD1: few }), null, 'CONTROL: fewer than half the names');
        const half = J(few); half.players[11] = old.players[11];
        assert.equal(rosterOverlapOf(NEW.players, half.players), 12);
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], { OLD1: half }), 'OLD1');
        assert.equal(pick([{ code: 'NEW1', at: now }], { NEW1: old }), null, 'never itself');
        assert.equal(pick([{ code: 'OLD1', at: now - DAY }], {}), null, 'a record that did not load is not a candidate');
        assert.equal(pick([{ code: 'OLD2', at: now - DAY }, { code: 'OLD1', at: now - 2 * DAY }], { OLD1: old, OLD2: Object.assign({}, old, { supersededBy: 'X' }) }), 'OLD1', 'an already-retired round is skipped');
    });
    test('the device list: a save appends {code, at, names}, keeps 7 days, dedupes by code', () => {
        const sb2 = loadHtmlInlineScript('admin.html', [], { localStorage: true });
        const now = Date.now();
        run(sb2, "localStorage.setItem('golfapp_saved_rounds', JSON.stringify([{ code: 'STALE', at: " + (now - 9 * DAY) + " }, { code: 'KEEP', at: " + (now - DAY) + " }]))");
        run(sb2, "recordSavedRound('KEEP', " + now + ")");
        run(sb2, "recordSavedRound('FRESH', " + now + ")");
        const list = JSON.parse(run(sb2, "localStorage.getItem('golfapp_saved_rounds')"));
        assert.deepEqual(list.map(e => e.code), ['KEEP', 'FRESH']);
        assert.equal(list[0].at, now, 'KEEP moved to now');
    });
});

// ---------------------------------------------------------------------------
// The save path: the wizard saves a NEW round while the device remembers an old
// one saved yesterday; the old record is answered through db.ref().once.
async function wizardSave(opts) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=new1', localStorage: true, beforeRun(sandbox) {
        sandbox.localStorage.setItem('golfapp_saved_rounds', JSON.stringify(opts.list || []));
        const realDatabase = sandbox.firebase.database;
        sandbox.firebase.database = Object.assign(function () {
            const dbi = realDatabase(); const origRef = dbi.ref.bind(dbi);
            dbi.ref = (p) => { const r = origRef(p); const m = /^events\/([A-Z0-9]+)$/.exec(p);
                if (m && opts.records && opts.records[m[1]]) { const rec = opts.records[m[1]]; r.once = () => Promise.resolve({ val: () => J(rec), exists: () => true }); }
                if (p === 'events/NEW1') r.once = () => Promise.resolve({ val: () => null, exists: () => false });
                return r; };
            return dbi;
        }, realDatabase);
    } });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; uiToast = function () {}; window.organizerGate.ensureOrganizer = function () { return Promise.resolve("me"); };');
    await tick(30);
    run(sb, 'document.__mount(document.getElementById("player-list")); document.__mount(document.getElementById("rr-retire"));');
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + "; courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links';");
    // the roster: rows with real inputs
    sb.__names = opts.names;
    run(sb, "document.getElementById('player-list').innerHTML = ''; __names.forEach(function (n) { addPlayerRow(n, '', '', 'red', false, true, __names.length, true); }); document.querySelectorAll('.player-row').forEach(function (row, i) { if (!row.querySelector('.p-name-input')) { var e = document.createElement('input'); e.className = 'p-name-input'; e.value = __names[i]; row.appendChild(e); } if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ''; row.appendChild(h); } });");
    run(sb, 'saveSettings();');
    await tick(80);
    const writes = () => J(sb.__dbWrites);
    const retire = () => String(run(sb, "document.getElementById('rr-retire').innerHTML"));
    return { sb, writes, retire };
}
const NAMES23 = wizardSavedRound({ code: 'X', courseData: CD }).players.map(p => p.name);

describe('THE SAVE (admin.html): Round Ready offers to retire the old round, checked, and writes the one key', () => {
    test('a new round sharing the roster with yesterday\'s unfinished round: the row, checked, and events/OLD1/supersededBy = NEW1 written once', async () => {
        const old = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9, ownerUid: 'me' });
        const r = await wizardSave({ names: NAMES23, list: [{ code: 'OLD1', at: Date.now() - DAY }], records: { OLD1: old } });
        assert.match(r.retire(), /<input type="checkbox" id="rr-retire-box" checked[^>]*>/);
        assert.match(r.retire(), /Retire OLD1 — anyone who opens it is sent here\./);
        const w = r.writes().filter(x => x.path === 'events/OLD1/supersededBy');
        assert.deepEqual(w.map(x => [x.op, x.value]), [['set', 'NEW1']]);
        assert.ok(!r.writes().some(x => /^events\/OLD1\/(?!supersededBy)/.test(x.path)), 'nothing else on the old round');
    });
    test('untick: the key is cleared (null); tick again: written back', async () => {
        const old = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9, ownerUid: 'me' });
        const r = await wizardSave({ names: NAMES23, list: [{ code: 'OLD1', at: Date.now() - DAY }], records: { OLD1: old } });
        run(r.sb, "retireRound('OLD1', false)"); await tick();
        run(r.sb, "retireRound('OLD1', true)"); await tick();
        const w = r.writes().filter(x => x.path === 'events/OLD1/supersededBy').map(x => x.value);
        assert.deepEqual(w, ['NEW1', null, 'NEW1']);
    });
    test('CONTROL - a finished old round: no row, no write', async () => {
        const old = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 18, ownerUid: 'me' });
        const r = await wizardSave({ names: NAMES23, list: [{ code: 'OLD1', at: Date.now() - DAY }], records: { OLD1: old } });
        assert.equal(r.retire(), '');
        assert.ok(!r.writes().some(x => /supersededBy/.test(x.path)));
    });
    test('CONTROL - a different roster: no row, no write', async () => {
        const old = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9, ownerUid: 'me' });
        const r = await wizardSave({ names: NAMES23.map((n, i) => 'Other ' + i), list: [{ code: 'OLD1', at: Date.now() - DAY }], records: { OLD1: old } });
        assert.equal(r.retire(), '');
        assert.ok(!r.writes().some(x => /supersededBy/.test(x.path)));
    });
    test('CONTROL - nothing remembered on this device: no row, no read of any other round', async () => {
        const r = await wizardSave({ names: NAMES23, list: [], records: {} });
        assert.equal(r.retire(), '');
        assert.ok(!r.writes().some(x => /supersededBy/.test(x.path)));
    });
    test('the save remembered the new round on this device', async () => {
        const r = await wizardSave({ names: NAMES23, list: [], records: {} });
        const list = JSON.parse(run(r.sb, "localStorage.getItem('golfapp_saved_rounds')"));
        assert.deepEqual(list.map(e => e.code), ['NEW1']);
    });
});

// ---------------------------------------------------------------------------
function scorecard(data, search, opts) {
    const sb = loadHtmlInlineScript('index.html', [], { search });
    if (opts && opts.dismissed) run(sb, "sessionStorage.setItem('groupPickDismissed:' + currentMode, '1')");
    run(sb, "['superseded-banner', 'card-body', 'group-pick-body', 'group-pick-overlay', 'group-filter-container'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && /^events\/[A-Z0-9]+$/.test(x.path));
    h.cb({ val: () => J(data), exists: () => true });
    const el = id => document(sb, id);
    return { sb, banner: String(run(sb, "document.getElementById('superseded-banner').innerHTML")), bannerDisplay: run(sb, "document.getElementById('superseded-banner').style.display"),
        card: String(run(sb, "document.getElementById('card-body').innerHTML")), picker: String(run(sb, "document.getElementById('group-pick-body').innerHTML")), pickerDisplay: run(sb, "document.getElementById('group-pick-overlay').style.display") };
}
const boxes = html => (html.match(/<input[^>]*class="score-input"[^>]*>/g) || []);

describe('THE SCORECARD (index.html): a retired round says so and takes no score', () => {
    const OLD = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9, overrides: { supersededBy: 'NEW1' } });
    test('bare link: the banner with the link, every box disabled, the picker shows the banner instead of groups', () => {
        const s = scorecard(OLD, '?game=old1');
        assert.equal(s.bannerDisplay, 'block');
        assert.match(s.banner, /<a class="superseded-link" href="index\.html\?game=NEW1">This round was replaced by NEW1 — tap to open your group there<\/a>/);
        assert.ok(boxes(s.card).length >= 18 * 23, 'the card rendered: ' + boxes(s.card).length + ' boxes');
        assert.ok(boxes(s.card).every(b => / disabled/.test(b)), 'every score box is disabled');
        assert.equal(s.pickerDisplay, 'flex');
        assert.match(s.picker, /replaced by NEW1 — tap to open your group there/);
        assert.doesNotMatch(s.picker, /group-pick-btn|Group 1/);
    });
    test('group link: the banner carries &group=3, the group\'s own boxes are disabled too', () => {
        const s = scorecard(OLD, '?game=old1&group=3');
        assert.match(s.banner, /href="index\.html\?game=NEW1&group=3"/);
        assert.ok(boxes(s.card).length >= 18 * 4);
        assert.ok(boxes(s.card).every(b => / disabled/.test(b)), 'CONTROL: the scorekeeper\'s own boxes must be locked');
    });
    test('saveScore refuses on a retired round even when called directly (defence in depth)', () => {
        const s = scorecard(OLD, '?game=old1&group=3');
        assert.equal(run(s.sb, 'canWritePlayer(' + OLD.players[9].id + ')'), false);
        const before = s.sb.__dbWrites.length;
        run(s.sb, 'saveScore(' + OLD.players[9].id + ', 1, 4)');
        assert.equal(s.sb.__dbWrites.length, before, 'no score written');
    });
    test('CONTROL - a round WITHOUT supersededBy: no banner, the group\'s boxes enabled, the picker lists groups', () => {
        const live = wizardSavedRound({ code: 'OLD1', courseData: CD, thru: 9 });
        const s = scorecard(live, '?game=old1&group=3');
        assert.equal(s.bannerDisplay, 'none'); assert.equal(s.banner, '');
        assert.ok(boxes(s.card).some(b => !/ disabled/.test(b)), 'the scorekeeper can score');
        assert.equal(run(s.sb, 'canWritePlayer(' + live.players[9].id + ')'), true);
        const bare = scorecard(live, '?game=old1');
        assert.match(bare.picker, /group-pick-btn/);
    });
    test('the sentence, on the page and in the picker, once each (source)', () => {
        const src = read('index.html');
        assert.equal((src.match(/tap to open your group there/g) || []).length, 1, 'one builder for the banner text');
        assert.match(src, /id="superseded-banner"/);
    });
});
