// ============================================================================
// URGENT-011 (sims bug 4): Round Setup's stacked "Also Playing -> Skins" card.
//
// It had no Gross / Net choice (always saved gross) and its blurb said
// "Ties carry over." while the card's default - and what the engine pays on an
// untouched game - is No Carry.
//
// NET NEEDS NO ENGINE CHANGE. getRoundGames() merges the stacked game's saved
// config over the catalog defaults, and computeSkinsSettlementNet reads
// resolveSkinsMode(config) -> skinsPotFormat. So the card only has to WRITE
// skinsPotFormat: 'net'; this test proves the merged config the engine receives
// resolves to net. Nothing in a money engine is touched.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const run = (sb, e) => vm.runInContext(e, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [2, 9, 15, 4], 101);

async function freshWizard(code) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; uiToast = function () {};');
    await new Promise(r => setTimeout(r, 20));
    return sb;
}
async function reopen(code, record) {
    const sb = await freshWizard(code);
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true });
        return r;
    };
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    run(sb, 'loadModeData(' + JSON.stringify(code) + ')');
    await new Promise(r => setTimeout(r, 40));
    return sb;
}
const listHtml = (sb) => run(sb, 'document.getElementById("stacked-games-list").innerHTML');
function painted(sb, val) {
    const m = listHtml(sb).match(new RegExp("onclick=\"setSkinsScoring\\('" + val + "'\\)\"[\\s\\S]*?background:(var\\(--brand-green\\)|transparent)"));
    return m ? (m[1] === 'var(--brand-green)' ? 'filled' : 'empty') : 'absent';
}
const blurb = (sb) => (listHtml(sb).match(/id="stacked-skins-blurb">([^<]*)</) || [])[1];

describe('the stacked Skins card: Gross / Net, and a blurb that tells the truth', () => {
    test('untouched: Gross is chosen, the save writes gross, and the blurb says No carry (the default)', async () => {
        const sb = await freshWizard('U11A');
        run(sb, "toggleStackedGame('skins', true)");
        assert.equal(painted(sb, 'gross'), 'filled');
        assert.equal(painted(sb, 'net'), 'empty');
        assert.equal(painted(sb, 'split'), 'absent', 'Gross & Net is not offered on a new game');
        const saved = J(run(sb, 'captureAdditionalGames()')).skins;
        assert.equal(saved.skinsPotFormat, 'gross');
        assert.equal(saved.skinsScoring, 'gross');
        assert.equal(saved.skinsCarryOver, false);
        assert.match(blurb(sb), /gross/i);
        assert.match(blurb(sb), /No carry/);
        assert.ok(!/carry over/i.test(blurb(sb)), 'never claims carry on a No Carry game: ' + blurb(sb));
    });
    test('the blurb follows the carry choice', async () => {
        const sb = await freshWizard('U11B');
        run(sb, "toggleStackedGame('skins', true)");
        run(sb, 'setSkinsCarry(true)');
        assert.match(blurb(sb), /Ties carry over/);
        run(sb, 'setSkinsCarry(false)');
        assert.match(blurb(sb), /No carry/);
    });
    test('Net: the button, the save (both fields agree), the review row, and the blurb', async () => {
        const sb = await freshWizard('U11C');
        run(sb, "toggleStackedGame('skins', true)");
        run(sb, "setSkinsScoring('net')");
        assert.equal(painted(sb, 'net'), 'filled');
        assert.equal(painted(sb, 'gross'), 'empty');
        const saved = J(run(sb, 'captureAdditionalGames()')).skins;
        assert.equal(saved.skinsPotFormat, 'net');
        assert.equal(saved.skinsScoring, 'net');
        assert.match(blurb(sb), /net/i);
        run(sb, 'renderWizardReview()');
        assert.match(run(sb, "document.getElementById('wizard-review-summary').innerHTML"), /\$5 · Net · No Carry/);
    });
    test('the engine already pays what the card writes: getRoundGames hands settlement a net config', async () => {
        const sb = await freshWizard('U11D');
        run(sb, "toggleStackedGame('skins', true)");
        run(sb, "setSkinsScoring('net')");
        const additionalGames = J(run(sb, 'captureAdditionalGames()'));
        const AM = loadJsFile('action-model.js', ['handicap.js', 'match-engine.js', 'money-engine.js']);
        const g = AM.getRoundGames({ gameFormat: 'stroke', players: J(PLAYERS), courseData: CD, additionalGames })
            .find(x => x.format === 'skins');
        assert.equal(AM.resolveSkinsMode(g.config), 'net');
    });
});

describe('reopening keeps the mode the engine pays', () => {
    const rec = (skins) => ({ eventName: 'U11', gameFormat: 'stroke', players: J(PLAYERS), courseData: CD, scores: {},
        additionalGames: { skins: Object.assign({ enabled: true, skinsBuyIn: 5 }, skins) } });
    test('a saved net game reopens Net and re-saves net', async () => {
        const sb = await reopen('U11N', rec({ skinsPotFormat: 'net', skinsScoring: 'net' }));
        assert.equal(painted(sb, 'net'), 'filled');
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsPotFormat, 'net');
    });
    test('a saved split game reopens with Gross & Net chosen and re-saves split', async () => {
        const sb = await reopen('U11S', rec({ skinsPotFormat: 'split' }));
        assert.equal(painted(sb, 'split'), 'filled');
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsPotFormat, 'split');
    });
    test('a game saved with neither field (paid gross via the catalog default) reopens Gross', async () => {
        const sb = await reopen('U11G', rec({}));
        assert.equal(painted(sb, 'gross'), 'filled');
        assert.equal(J(run(sb, 'captureAdditionalGames()')).skins.skinsPotFormat, 'gross');
    });
});

// action-model.js is held byte-identical as a money file, so its catalog blurb
// ("... Ties carry over.") is not edited: admin.html no longer renders it for
// skins - the card's line is stackedSkinsBlurb(), written from the card's state.
test('the stacked Skins card does not print the catalog blurb', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
    assert.match(src, /\$\{format === 'skins' \? stackedSkinsBlurb\(\) : spec\.blurb\}/);
});
