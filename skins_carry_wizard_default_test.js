// ============================================================================
// SKINS DO NOT CARRY BY DEFAULT - ON THE PATH A GOLFER ACTUALLY TAKES.
//
// skins_carry_default_test.js holds every CREATION CONSTANT to
// SKINS_CARRY_DEFAULT (false). It was green while this shipped:
//
//   A fresh wizard. "Also Playing" -> tick Skins. Touch nothing. Save.
//   captureAdditionalGames().skins.skinsCarryOver === TRUE.          (measured)
//
// The catalog default IS false, and the save overwrites it:
//   entry = Object.assign({}, spec.defaults, ...)     skinsCarryOver: false
//   entry.skinsCarryOver = st.carryOver !== false;    undefined !== false -> TRUE
//
// The same `!== false` sat in eight places in admin.html and one in index.html,
// each answering "what does an absent carry flag mean?" for itself - CARRY -
// while the resolver every money engine uses, skinsCarriesOver(), says NO
// CARRY. The stacked card painted Carry Over on a state nobody had touched,
// and a legacy round with no flag reopened as Carry Over and re-saved as
// carry: true, restating money the engine had already paid no-carry.
//
// THE RULE NOW: admin.html and index.html ask skinsCarriesOver() and nothing
// else. One resolver, one polarity, on every surface - which is what
// CLAUDE.md's "test the default state" and "one builder" rules both demand.
//
// WHAT THE HARNESS CAN AND CANNOT PROVE. mini-dom does not dispatch events, so
// the "tick" here runs the checkbox's own onchange expression
// (toggleStackedGame('skins', true)) rather than clicking; innerHTML is a
// string, so the painted button state is read by regex from the markup the
// page wrote. tools/skins-carry-wizard-check.js does the tap in Chrome.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);

async function freshWizard(code) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {};');
    await new Promise(r => setTimeout(r, 20));
    return sb;
}
// A stored round the wizard reopens: db.ref(events/CODE).once resolves it.
function storeRound(sb, code, record) {
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true });
        return r;
    };
}
async function reopen(code, record) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {};');
    storeRound(sb, code, record);
    // The roster rows the load rebuilds must be attached for querySelectorAll to
    // see them (mini-dom), or collectWizardPlayers() reads an empty field and the
    // instance capture skips a game "nobody is playing".
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    run(sb, 'loadModeData(' + JSON.stringify(code) + ')');
    await new Promise(r => setTimeout(r, 40));
    return sb;
}
// The painted Ties buttons on the stacked skins card (rendered into
// #stacked-games-list by renderStackedGames): which of Carry / No Carry
// is filled in. Read from the markup the page wrote.
function paintedStackedCarry(sb) {
    const html = run(sb, 'document.getElementById("stacked-games-list").innerHTML');
    const btn = (val) => {
        const m = html.match(new RegExp('onclick="setSkinsCarry\\(' + val + '\\)"[\\s\\S]*?background:(var\\(--brand-green\\)|transparent)'));
        return m ? (m[1] === 'var(--brand-green)' ? 'filled' : 'empty') : 'absent';
    };
    return { carry: btn('true'), noCarry: btn('false') };
}

const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [2, 9, 15, 4], 101);

describe('a FRESH "Also Playing -> Skins", touched after the tick by nobody', () => {
    test('the save writes skinsCarryOver: false, and the card paints No Carry', async () => {
        const sb = await freshWizard('CARRYNEW');
        run(sb, "toggleStackedGame('skins', true)");          // the checkbox's own onchange
        const saved = J(run(sb, 'captureAdditionalGames()')).skins;
        assert.equal(saved.enabled, true);
        assert.equal(saved.skinsBuyIn, 5, 'the catalog seeded the stake, so this is the untouched state');
        assert.equal(saved.skinsCarryOver, false, 'a round nobody configured must not carry');
        assert.deepEqual(paintedStackedCarry(sb), { carry: 'empty', noCarry: 'filled' });
    });
    test('choosing Carry Over is still honoured: the button, then the save', async () => {
        const sb = await freshWizard('CARRYON');
        run(sb, "toggleStackedGame('skins', true)");
        run(sb, 'setSkinsCarry(true)');                        // the Carry button's own onclick
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsCarryOver, true);
        assert.deepEqual(paintedStackedCarry(sb), { carry: 'filled', noCarry: 'empty' });
    });
});

describe('a REOPENED round: the wizard shows what the engine pays', () => {
    const base = () => ({ eventName: 'Carry', gameFormat: 'stroke', players: J(PLAYERS), courseData: CD, scores: {},
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsScoring: 'gross', skinsPotFormat: 'gross' } } });

    test('a LEGACY stacked skins game with NO carry flag reopens as No Carry and re-saves false - the rule the engine already applied', async () => {
        const sb = await reopen('CARRYLEG', base());
        assert.equal(run(sb, 'stackedGameState.skins.enabled'), true, 'the game was restored');
        assert.equal(run(sb, 'stackedGameState.skins.carryOver'), false);
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsCarryOver, false);
        assert.deepEqual(paintedStackedCarry(sb), { carry: 'empty', noCarry: 'filled' });
    });
    test('an explicit true reopens as Carry Over and re-saves true', async () => {
        const rec = base(); rec.additionalGames.skins.skinsCarryOver = true;
        const sb = await reopen('CARRYTRUE', rec);
        assert.equal(run(sb, 'stackedGameState.skins.carryOver'), true);
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsCarryOver, true);
        assert.deepEqual(paintedStackedCarry(sb), { carry: 'filled', noCarry: 'empty' });
    });
    test('a LEGACY main-format skins round with no flag reopens the Step 4 switch on No Carry', async () => {
        const rec = { eventName: 'Legacy', gameFormat: 'skins', skinsBuyIn: 10, players: J(PLAYERS), courseData: CD, scores: {} };
        const sb = await reopen('CARRYMAIN', rec);
        assert.equal(run(sb, "document.getElementById('skins-carryover').value"), 'false');
        assert.equal(run(sb, "document.getElementById('skins-carry-switch').checked"), true, 'checked is the No Carry position');
        assert.equal(run(sb, "document.getElementById('skins-carry-label-off').classList.contains('active')"), true);
        assert.equal(run(sb, "document.getElementById('skins-carry-label-on').classList.contains('active')"), false);
        assert.match(run(sb, "document.getElementById('skins-carry-explanation').textContent"), /worth nothing/);
    });
    test('the Round Ready screen, from STORED data: a legacy skins round with no flag reads "No Carry"; an explicit true reads "Carry Over"', async () => {
        const rec = { eventName: 'Legacy', gameFormat: 'skins', skinsBuyIn: 10, players: J(PLAYERS), courseData: CD, scores: {} };
        const lineFor = async (record, code) => {
            const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
            sb.crypto = require('crypto').webcrypto;
            run(sb, 'alert = function () {};');
            storeRound(sb, code, record);
            run(sb, 'showRoundReadyScreen(' + JSON.stringify(code) + ')');      // the screen's own fetch + render
            await new Promise(r => setTimeout(r, 40));
            return run(sb, "document.getElementById('rr-action-text').innerHTML");
        };
        assert.match(await lineFor(rec, 'RRLEG'), /\$10 Skins — No Carry/);
        assert.match(await lineFor(Object.assign({ skinsCarryOver: true }, rec), 'RRTRUE'), /\$10 Skins — Carry Over/);
    });
    test('a LEGACY skins INSTANCE with no flag reopens as No Carry and re-saves false', async () => {
        const rec = { eventName: 'Inst', gameFormat: 'stroke', players: J(PLAYERS), courseData: CD, scores: {},
            additionalGameInstances: { skins_1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross', startHole: 1 } } };
        const sb = await reopen('CARRYINST', rec);
        assert.equal(run(sb, 'skinsInstances.length'), 1);
        assert.equal(run(sb, 'skinsInstances[0].skinsCarryOver'), false);
        assert.equal(J(run(sb, 'captureSkinsInstances()')).skins_1.skinsCarryOver, false);
    });
});

describe('ONE RESOLVER. No page decides for itself what an absent carry flag means', () => {
    const CARRY_READ = /(skinsCarryOver|carryOver)\s*!==\s*false/g;
    test('admin.html: zero `!== false` carry readers; every carry decision names skinsCarriesOver', () => {
        const src = read('admin.html');
        const hits = src.match(CARRY_READ) || [];
        assert.deepEqual(hits, [], 'each of these is a private answer to the carry question: ' + hits.join(', '));
        const calls = (src.match(/skinsCarriesOver\(/g) || []).length;
        assert.ok(calls >= 8, 'the eight former sites route through the resolver: ' + calls);
    });
    test('index.html: the landing summary line reads the resolver', () => {
        const src = read('index.html');
        assert.deepEqual(src.match(CARRY_READ) || [], []);
        assert.match(src, /skinsCarriesOver\(currentData\.skinsCarryOver\)/);
    });
    test('and the resolver is the one that pays: absent -> false, false -> false, true -> true', () => {
        const AM = require('./helpers/load-script.js').loadJsFile('action-model.js', ['handicap.js', 'match-engine.js', 'money-engine.js']);
        assert.equal(AM.skinsCarriesOver(undefined), false);
        assert.equal(AM.skinsCarriesOver(false), false);
        assert.equal(AM.skinsCarriesOver(true), true);
        assert.equal(AM.SKINS_CARRY_DEFAULT, false);
    });
});

describe('index.html: the landing game line on a legacy skins round says No Carry, as the engine pays it', () => {
    test('absent flag -> "No Carry"; explicit true -> "Carry Over"', () => {
        const lineFor = (rec) => {
            const sb = loadHtmlInlineScript('index.html');
            sb.__rec = rec;
            run(sb, 'currentData = __rec;');
            const players = J(PLAYERS);
            run(sb, 'renderLandingSummary(' + JSON.stringify(players) + ', ' + JSON.stringify(players) + ')');
            return run(sb, 'document.getElementById("landing-active-games").innerHTML');
        };
        const legacy = { gameFormat: 'skins', skinsBuyIn: 10, players: J(PLAYERS), courseData: CD };
        assert.match(lineFor(legacy), /\$10 Skins — No Carry/);
        assert.ok(!/Carry Over/.test(lineFor(legacy)));
        assert.match(lineFor(Object.assign({ skinsCarryOver: true }, legacy)), /\$10 Skins — Carry Over/);
    });
});
