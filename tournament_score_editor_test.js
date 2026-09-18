// ============================================================================
// THE ORGANIZER'S CORRECTION PATH, AND THE HONEST LINKS (Option A, 2026-09-16)
//
// tournaments/$code is world-writable to anyone holding the code - scores,
// names, rosters, course, round status - and the scorecard link (&team=N)
// is one door of several. Option A does not close the house; it stops the
// app lying about the walls, and gives the organizer a way to fix a score
// that is not "open the team's link":
//
//   1. A score editor on tournament.html's SETUP tab - the one panel the page
//      REMOVES from the DOM for anyone but the signed-in owner. It writes the
//      SAME path the team's link writes, through pure builders in tournament-
//      engine.js (tournamentScorePath, teamHoleKey, teamPlayerHoleKey,
//      playerHoleKey). The scorecard keeps its own scorePath, pinned by two
//      suites; the PARITY test below is what holds the two together (the
//      repo's rule for intentional duplication). It refuses SETUP and CLOSED
//      rounds the way the card does. It is a CORRECTION tool and says so: the
//      team and group links are how scoring happens.
//   2. The scorecard says what it is: "Anyone with this link can score this
//      card." The padlocks that headed the link sections on tournament.html
//      go - a claim in a glyph, past a test that scans sentences.
//   3. HANDOFF carries the honest scope and why B and C were not picked.
//
// The write on tournament.html is a second copy of a three-line writer
// (ref.remove() for an empty box, ref.set(parseInt) otherwise) - said
// plainly, and asserted to match the card's rule.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'tournament.html';
const CARD = 'tournament-scorecard.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const markupOf = (f) => read(f).replace(/<script[\s\S]*?<\/script>/g, '');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function settle() { return Promise.resolve().then(() => new Promise((r) => setImmediate(r))); }
function scramble(o) { return Object.assign({ name: 'Fix Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 0 } },
    scores: { team1_h1: 4, team2_h1: 5 } }, o || {}); }
function bestball(o) { return Object.assign(scramble({ format: 'bestball' }), o || {}); }
function individual(o) { return Object.assign({ name: 'Fix Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org', teams: {},
    players: { p0: { id: 'p0', name: 'Ann Alpha', handicap: '8', addedAt: 1 }, p1: { id: 'p1', name: 'Bo Bravo', handicap: '4', addedAt: 2 } },
    scoringGroups: { g1: { name: 'Group 1', playerIds: ['p0', 'p1'] } }, scores: { p0_h1: 4 } }, o || {}); }
function multiRound(o) {
    const r = scramble({ eventModel: 'round-v1', rounds: {
        r1: { name: 'Saturday', status: 'closed', courseName: 'Cameron', courseData: COURSE, format: 'scramble', teams: scramble().teams, scores: { team1_h1: 4 } },
        r2: { name: 'Sunday', status: 'open', courseName: 'Cameron', courseData: COURSE, format: 'scramble', teams: scramble().teams, scores: {} },
        r3: { name: 'Monday', status: 'setup', courseName: 'Cameron', courseData: COURSE, format: 'scramble', teams: scramble().teams, scores: {} } } });
    delete r.scores; return Object.assign(r, o || {});
}
function arriveOwner(rec, user) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=OWN1' });
    sb.__auth.setUser(user === undefined ? ORGANIZER : user);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/OWN1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const scoreWrites = (sb) => sb.__dbWrites.filter((w) => /\/scores\//.test(w.path));

// The scorecard's own scorePath, run in the card's realm exactly as the card runs it.
function cardScorePath(code, roundId, suffix) {
    const sb = loadHtmlInlineScript(CARD, [], { search: `?tourney=${code}&team=1` + (roundId ? `&round=${roundId}` : '') });
    return String(vm.runInContext(`scorePath(${JSON.stringify(suffix)})`, sb));
}

// ---------------------------------------------------------------------------
describe('THE ENGINE\'S PATH BUILDERS, and PARITY with the card\'s scorePath', () => {
    const eng = loadJsFile('tournament-engine.js');
    const run = (c) => vm.runInContext(c, eng);
    test('tournamentScorePath: root for a single-round event, rounds/<rid>/scores for a multi-round one', () => {
        assert.equal(run("tournamentScorePath('ABCD', null, 'team1_h1')"), 'tournaments/ABCD/scores/team1_h1');
        assert.equal(run("tournamentScorePath('ABCD', 'r2', 'team1_h1')"), 'tournaments/ABCD/rounds/r2/scores/team1_h1');
        assert.equal(run("tournamentScorePath('ABCD', '', 'p0_h3')"), 'tournaments/ABCD/scores/p0_h3', 'an empty round id is no round');
    });
    test('the three key shapes are the production keys, byte for byte', () => {
        assert.equal(run('teamHoleKey(2, 5)'), 'team2_h5');
        assert.equal(run('teamPlayerHoleKey(2, 1, 5)'), 'team2_p1_h5');
        assert.equal(run("playerHoleKey('p0', 5)"), 'p0_h5');
    });
    test('PARITY: the card\'s scorePath and the engine\'s builder agree on every shape, single and multi-round', () => {
        [['team1_h1', null], ['team1_h1', 'r2'], ['team1_p0_h7', null], ['team1_p0_h7', 'r2'], ['p0_h3', null], ['p0_h3', 'r1']].forEach(([suffix, rid]) => {
            assert.equal(cardScorePath('ABCD', rid, suffix), run(`tournamentScorePath('ABCD', ${JSON.stringify(rid)}, ${JSON.stringify(suffix)})`), suffix + ' / ' + rid);
        });
    });
    test('the card\'s scorePath is untouched (the two suites that pin it keep their anchors)', () => {
        const card = stripComments(read(CARD));
        assert.match(card, /function scorePath\(suffix\) \{[\s\S]*?return myRoundId\s*\? `tournaments\/\$\{currentCode\}\/rounds\/\$\{myRoundId\}\/scores\/\$\{suffix\}`\s*: `tournaments\/\$\{currentCode\}\/scores\/\$\{suffix\}`;/);
    });
});

// ---------------------------------------------------------------------------
describe('THE EDITOR lives on Setup and writes the path the link would', () => {
    test('the owner sees "Correct a scorecard" on the Setup panel, worded as a correction tool that names the links as the way scoring happens', () => {
        const sb = arriveOwner(scramble()); const html = el(sb, 'score-corrector').innerHTML;
        assert.match(html, /Correct a scorecard/);
        assert.match(html, /team and group links are how scoring happens/i);
        assert.match(html, /fixing a score/i);
        assert.ok(!/Enter scores|Score the field|Keep score here/i.test(html), 'nothing suggests it is a primary path');
        assert.match(html, /id="sc-target"/); assert.match(html, /id="sc-holes"/);
    });
    test('scramble, team 2, hole 5: one set() at tournaments/OWN1/scores/team2_h5 - the card\'s path for &team=2', async () => {
        const sb = arriveOwner(scramble()); sb.correctTeamScore(2, 5, '6'); await settle();
        const w = scoreWrites(sb); assert.equal(w.length, 1);
        assert.equal(w[0].path, cardScorePath('OWN1', null, 'team2_h5')); assert.equal(w[0].op, 'set'); assert.strictEqual(w[0].value, 6);
    });
    test('an emptied box REMOVES the score, as the card does; text and zero write nothing', async () => {
        const sb = arriveOwner(scramble()); sb.correctTeamScore(1, 1, ''); await settle();
        let w = scoreWrites(sb); assert.equal(w.length, 1); assert.equal(w[0].op, 'remove'); assert.equal(w[0].path, 'tournaments/OWN1/scores/team1_h1');
        sb.correctTeamScore(1, 2, 'abc'); sb.correctTeamScore(1, 3, '0'); await settle();
        assert.equal(scoreWrites(sb).length, 1, 'a non-score is not a remove either');
    });
    test('best ball: per-golfer keys team2_p1_h5', async () => {
        const sb = arriveOwner(bestball()); sb.correctTeamPlayerScore(2, 1, 5, '4'); await settle();
        const w = scoreWrites(sb); assert.equal(w.length, 1); assert.equal(w[0].path, cardScorePath('OWN1', null, 'team2_p1_h5')); assert.strictEqual(w[0].value, 4);
    });
    test('individual: the golfer\'s id in the key, and a golfer not in the chosen group is refused', async () => {
        const sb = arriveOwner(individual()); sb.correctPlayerScore('g1', 'p1', 3, '5'); await settle();
        let w = scoreWrites(sb); assert.equal(w.length, 1); assert.equal(w[0].path, cardScorePath('OWN1', null, 'p1_h3'));
        sb.correctPlayerScore('g1', 'p9', 3, '5'); await settle();
        assert.equal(scoreWrites(sb).length, 1, 'p9 is not in g1');
    });
    test('multi-round: the OPEN round writes under rounds/<rid>/scores; a CLOSED and a SETUP round refuse, and the boxes say why', async () => {
        const sb = arriveOwner(multiRound());
        sb.correctTeamScore(2, 5, '6', 'r2'); await settle();
        let w = scoreWrites(sb); assert.equal(w.length, 1); assert.equal(w[0].path, cardScorePath('OWN1', 'r2', 'team2_h5'));
        sb.correctTeamScore(2, 5, '6', 'r1'); sb.correctTeamScore(2, 5, '6', 'r3'); await settle();
        assert.equal(scoreWrites(sb).length, 1, 'closed and setup rounds take no correction');
        sb.selectCorrectionRound('r1'); sb.selectCorrectionTarget('team:2'); const html = el(sb, 'score-corrector').innerHTML;   // mini-dom: read the mount the page writes
        assert.match(html, /closed/i); assert.match(html, /Open it above/i); assert.match(html, /disabled/);
    });
    test('the boxes the owner types into are wired to the writers (the entry point is the box, not a function only tests call)', () => {
        const sb = arriveOwner(scramble()); sb.selectCorrectionTarget('team:2');
        const html = el(sb, 'score-corrector').innerHTML;   // mini-dom: read the mount the page writes
        assert.match(html, /onchange="correctTeamScore\(2, 1, this\.value/);
        assert.equal((html.match(/onchange="correctTeamScore\(2, /g) || []).length, 18, 'one box per hole');
        assert.match(html, /value="5"/, 'team 2\'s existing 5 on hole 1 is shown');
    });
});

describe('THE GATE: nobody but the owner reaches the editor', () => {
    test('a signed-out visitor: the Setup panel, and the editor with it, is not in the DOM', async () => {
        const sb = arriveOwner(scramble(), null); await settle();
        // The panel is removed (mini-dom answers null for a removed id, as the
        // browser does); its descendants stay reachable in mini-dom's registry, so
        // the corrector is asserted EMPTY - the page rendered nothing for a
        // non-owner - and, in the browser, gone with its parent.
        assert.equal(el(sb, 'manage-tab-setup'), null, 'the Setup panel is removed');
        assert.equal(String(el(sb, 'score-corrector').innerHTML || ''), '');
    });
    test('an anonymous session is nobody here; a stranger with an email is nobody; the writer itself refuses both', async () => {
        for (const who of [{ uid: 'anon-1', isAnonymous: true, email: null }, { uid: 'u-stranger', email: 'x@example.com', isAnonymous: false }]) {
            const sb = arriveOwner(scramble(), who); await settle();
            assert.equal(el(sb, 'manage-tab-setup'), null, JSON.stringify(who));
            assert.equal(String(el(sb, 'score-corrector').innerHTML || ''), '', JSON.stringify(who));
            sb.correctTeamScore(2, 5, '6'); await settle();
            assert.equal(scoreWrites(sb).length, 0, 'the writer checks canManage() itself: ' + JSON.stringify(who));
        }
    });
    test('a LEGACY tournament (no ownerUid) gets NO editor since the narrowing (2026-09-18) - the rules refuse every write on it, so the page offers none', () => {
        const rec = scramble(); delete rec.ownerUid;
        const sb = arriveOwner(rec, null);
        assert.equal(el(sb, 'manage-tab-setup'), null, 'the Setup panel - the editor\'s home - is removed');
    });
});

// ---------------------------------------------------------------------------
describe('THE COPY tells the truth', () => {
    test('the scorecard says "Anyone with this link can score this card." in its markup, under "You\'re scoring for"', () => {
        const m = markupOf(CARD);
        assert.match(m, /id="scoring-for"[\s\S]{0,400}Anyone with this link can score this card\./);
    });
    test('no padlock heads a links section on tournament.html; the share sentence says who can score', () => {
        const m = markupOf(PAGE);
        assert.ok(!/\u{1F512}[^<]*Links</u.test(m), 'a padlock still heads a links section');
        assert.match(m, /Send each team only their own\. Anyone who has a link can score that card\./);
        assert.match(m, /Anyone who has a link can score that card/);
        assert.equal((m.match(/Anyone who has a link can score that card/g) || []).length, 2, 'teams and groups both');
    });
    test('the corrector\'s own copy: correction, not scoring', () => {
        const m = decodeEscapes(markupOf(PAGE) + stripComments(read(PAGE)));   // DECODE first: the apostrophe is a \u escape in the page's source
        assert.match(m, /The team and group links are how scoring happens/);
        assert.match(m, /to the same card the team\u2019s link writes/);
    });
});

describe('HANDOFF carries the honest scope', () => {
    test('world-writable named, one door of several, the rules wave needs its own recon, B and C recorded with their reasons, the consumer padlock filed', () => {
        const h = read('HANDOFF.md');
        assert.match(h, /tournaments\/\$code is world-writable/);
        assert.match(h, /one door of several/);
        assert.match(h, /needs its own recon/);
        assert.match(h, /keys are readable while they live on the record/);
        assert.match(h, /re-pins every score reader/);
        assert.match(h, /shell boundary/); assert.match(h, /one uid two meanings/);
        assert.match(h, /instructions\.html/); assert.match(h, /consumer copy pass/i);
    });
});
