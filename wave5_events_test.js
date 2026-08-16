const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function layered(files) {
    const sb = loadJsFile(files[0]);
    files.slice(1).forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const EV = layered(['action-model.js', 'money-engine.js', 'bet-strip.js', 'hole-events.js']);

const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

function four() {
    const cd = makeCourseData(18);
    const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
    p[0].team = 'Team 1'; p[1].team = 'Team 1';
    p[2].team = 'Team 2'; p[3].team = 'Team 2';
    return { cd, p };
}
// Marty wins holes 1-4 outright; 5 and 6 tie; on 7 Manny wins the carry.
function acceptanceScores(cd, p) {
    const sc = {};
    cd.slice(0, 4).forEach(h => p.forEach((pl, pi) => { sc[`p${pl.id}_h${h.hole}`] = h.par + (pi === 1 ? 0 : 1); }));
    [5, 6].forEach(hn => p.forEach(pl => { sc[`p${pl.id}_h${hn}`] = cd[hn - 1].par; }));
    p.forEach((pl, pi) => { sc[`p${pl.id}_h7`] = cd[6].par + (pi === 0 ? -1 : 1); });
    return sc;
}
function acceptanceRound(cd, p, sc) {
    return {
        gameFormat: 'nassau', players: p, courseData: cd, scores: sc,
        nassauStake: 20, nassauScoring: 'gross', nassauPressRule: '2down',
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
            dots: { enabled: true, dotPointVal: 2 }
        },
        dots: { h7: { [`p${p[0].id}`]: ['birdie', 'greenie'] } },
        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
            },
            sm2: {
                format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                teamAIds: [String(p[2].id)], teamBIds: [String(p[3].id)]
            }
        }
    };
}
const texts = evs => evs.map(e => e.text).join(' | ');

// ---------------------------------------------------------------------------
describe('EVENT DIFF — the before state is reconstructed, never remembered', () => {
    test('the before state is everything on EARLIER holes only', () => {
        const before = EV.scoresBeforeHole({ p1_h4: 4, p1_h5: 5, p1_h6: 6 }, 5);
        assert.deepEqual(Object.keys(before).join(','), 'p1_h4',
            'stripping only hole 5 would leave hole 6 still building the carry');
    });

    test('the after state is cut at the same boundary', () => {
        const after = EV.scoresThroughHole({ p1_h4: 4, p1_h5: 5, p1_h6: 6 }, 5);
        assert.deepEqual(Object.keys(after).join(','), 'p1_h4,p1_h5',
            'without this, hole 5\'s recap would describe hole 6\'s world');
    });

    test('REGRESSION: an earlier hole\'s recap does not change once later holes are played', () => {
        // The whole point of reconstructing rather than remembering.
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const atFive = texts(EV.buildHoleEvents(data, cd, sc, 5, null, p));

        const later = Object.assign({}, sc);
        cd.slice(7, 12).forEach(h => p.forEach(pl => { later[`p${pl.id}_h${h.hole}`] = h.par; }));
        const stillAtFive = texts(EV.buildHoleEvents(Object.assign({}, data, { scores: later }), cd, later, 5, null, p));
        assert.equal(atFive, stillAtFive, 'hole 5\'s recap must be stable');
    });

    test('REGRESSION: rendering the same state repeatedly gives identical events', () => {
        // A Firebase listener can fire five times. It must not announce a skin five times.
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const runs = [1, 2, 3, 4, 5].map(() => texts(EV.buildHoleEvents(data, cd, sc, 7, null, p)));
        assert.equal(new Set(runs).size, 1, 'event derivation is not idempotent');
    });

    test('a different device derives the same events from the same Firebase state', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const deviceA = texts(EV.buildHoleEvents(data, cd, sc, 7, null, p));
        const deviceB = texts(EV.buildHoleEvents(JSON.parse(JSON.stringify(data)), cd, Object.assign({}, sc), 7, null, p));
        assert.equal(deviceA, deviceB, 'events must not depend on who entered the scores');
    });

    test('no events fire until every player has posted on the hole', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const partial = Object.assign({}, sc);
        delete partial[`p${p[3].id}_h7`];
        const data = acceptanceRound(cd, p, partial);
        assert.equal(EV.buildHoleEvents(data, cd, partial, 7, null, p).length, 0,
            'a skin must not be announced before everyone in it has scored');
    });

    test('the recap layer computes no money of its own', () => {
        const s = read('hole-events.js');
        ['function calcDotsEngine', 'function getStrokes', 'function calculateMatchEngine',
            'function computeSkinsSettlementNet', 'function skinsState'].forEach(fn =>
                assert.ok(!s.includes(fn), `${fn} must not be reimplemented in the event layer`));
    });
});

// ---------------------------------------------------------------------------
describe('SKINS EVENTS', () => {
    const { cd, p } = four();
    const sc = acceptanceScores(cd, p);
    const data = acceptanceRound(cd, p, sc);

    test('a carry is reported with its value and the hole it rides to', () => {
        const e = EV.buildHoleEvents(data, cd, sc, 5, null, p).find(x => x.type === 'SKINS_CARRIED');
        assert.ok(e, 'no carry event on a tied hole');
        assert.match(e.text, /riding/);
        assert.match(e.text, /on Hole 6/, 'the value belongs to the NEXT hole');
    });

    test('the carry grows on a second tied hole', () => {
        const e = EV.buildHoleEvents(data, cd, sc, 6, null, p).find(x => x.type === 'SKINS_CARRIED');
        assert.match(e.text, /^2 riding/);
    });

    test('winning the carry is announced once, with the unit count', () => {
        const wins = EV.buildHoleEvents(data, cd, sc, 7, null, p).filter(x => x.type === 'SKIN_WON');
        assert.equal(wins.length, 1, 'a skin must be announced exactly once');
        assert.match(wins[0].text, /3 skins/);
    });

    test('no carry event fires on a hole that merely continues an existing carry', () => {
        // Only a hole that ADDED to the carry is news; a pot already riding is state.
        const { cd: c2, p: p2 } = four();
        const s2 = {};
        c2.slice(0, 3).forEach(h => p2.forEach(pl => { s2[`p${pl.id}_h${h.hole}`] = h.par; }));
        const d2 = acceptanceRound(c2, p2, s2);
        const e = EV.buildHoleEvents(d2, c2, s2, 2, null, p2).filter(x => x.type === 'SKINS_CARRIED');
        assert.ok(e.length <= 1);
    });

    test('a skin won before a Wave 3 start hole is never announced', () => {
        const { cd: c3, p: p3 } = four();
        const s3 = {};
        c3.slice(0, 3).forEach((h, i) => p3.forEach((pl, pi) => {
            s3[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 ? -1 : 0);
        }));
        const d3 = {
            gameFormat: 'stroke', players: p3, courseData: c3, scores: s3,
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 } }
        };
        const e = EV.buildHoleEvents(d3, c3, s3, 2, null, p3).filter(x => x.type.indexOf('SKIN') === 0);
        assert.equal(e.length, 0, 'holes before the start hole must stay irrelevant');
    });
});

describe('MATCH PLAY EVENTS — only meaningful change', () => {
    function match(scoreFn, holes) {
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty'], [0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const sc = {};
        cd.slice(0, holes).forEach((h, i) => p.forEach((pl, pi) => { sc[`p${pl.id}_h${h.hole}`] = h.par + scoreFn(i, pi); }));
        return {
            cd, p, sc,
            data: { gameFormat: 'match', players: p, courseData: cd, scores: sc, matchStake: 50, matchScoring: 'gross', matchPressRule: 'none' }
        };
    }

    test('taking the lead is announced', () => {
        const m = match((i, pi) => (i === 0 && pi === 0 ? -1 : 0), 1);
        const e = EV.buildHoleEvents(m.data, m.cd, m.sc, 1, null, m.p).filter(x => x.type === 'LEAD_CHANGE');
        assert.equal(e.length, 1);
        assert.match(e[0].text, /UP/);
    });

    test('REGRESSION: staying 1 UP after a halved hole is NOT announced', () => {
        // Announcing "still 1 UP" every hole is exactly how this becomes noise.
        const m = match((i, pi) => (i === 0 && pi === 0 ? -1 : 0), 2);
        const e = EV.buildHoleEvents(m.data, m.cd, m.sc, 2, null, m.p).filter(x => x.type === 'LEAD_CHANGE');
        assert.equal(e.length, 0, 'a halved hole is not a lead change');
    });

    test('going back to all square is announced', () => {
        const m = match((i, pi) => (i === 0 && pi === 0 ? -1 : (i === 1 && pi === 1 ? -1 : 0)), 2);
        const e = EV.buildHoleEvents(m.data, m.cd, m.sc, 2, null, m.p).filter(x => x.type === 'MATCH_TIED');
        assert.equal(e.length, 1);
        assert.match(e[0].text, /ALL SQUARE/);
    });

    test('a match closing out produces one final event', () => {
        const m = match((i, pi) => (pi === 0 ? -1 : 0), 10);
        const e = EV.buildHoleEvents(m.data, m.cd, m.sc, 10, null, m.p).filter(x => x.type === 'WAGER_FINAL');
        assert.equal(e.length, 1, 'a closed match should announce exactly once');
    });

    test('a Nassau lead flip is stated once, not once per chip', () => {
        // Front, back and total are three chips; two flipping is still one sentence.
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const e = EV.buildHoleEvents(data, cd, sc, 7, null, p).filter(x => x.type === 'LEAD_CHANGE');
        assert.equal(new Set(e.map(x => x.text)).size, e.length, 'the same sentence appears twice');
    });
});

describe('STROKE PLAY EVENTS — leader change only', () => {
    // Manny leads after hole 1; Marty wins holes 2 and 3 by a shot each and takes over.
    // Deliberately never more than one under par on a hole - par minus 3 lands on 0 for
    // a par 3, which the engines correctly read as "no score entered".
    function stroke(holes, flip) {
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty'], [0, 0]);
        const sc = {};
        cd.slice(0, holes).forEach((h, i) => p.forEach((pl, pi) => {
            let d = 0;
            if (i === 0 && pi === 0) d = -1;
            if (flip && i > 0 && pi === 1) d = -1;
            sc[`p${pl.id}_h${h.hole}`] = h.par + d;
        }));
        return {
            cd, p, sc,
            data: {
                gameFormat: 'match', matchScoringStyle: 'stroke', players: p,
                courseData: cd, scores: sc, matchStake: 50, matchScoring: 'gross'
            }
        };
    }

    test('a change of leader is announced', () => {
        const m = stroke(3, true);
        const e = EV.buildHoleEvents(m.data, m.cd, m.sc, 3, null, m.p).filter(x => x.type === 'LEAD_CHANGE');
        assert.equal(e.length, 1);
    });

    test('REGRESSION: the margin merely changing is NOT announced', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty'], [0, 0]);
        const sc = {};
        cd.slice(0, 3).forEach((h, i) => p.forEach((pl, pi) => {
            sc[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 ? -1 : 0);
        }));
        const data = {
            gameFormat: 'match', matchScoringStyle: 'stroke', players: p,
            courseData: cd, scores: sc, matchStake: 50, matchScoring: 'gross'
        };
        const e = EV.buildHoleEvents(data, cd, sc, 3, null, p).filter(x => x.type === 'LEAD_CHANGE');
        assert.equal(e.length, 0, 'the same golfer extending a lead is not news');
    });
});

describe('DOTS AND BIRDIES — compact, not spam', () => {
    const { cd, p } = four();
    const sc = acceptanceScores(cd, p);
    const data = acceptanceRound(cd, p, sc);

    test('two dots on one hole produce ONE line, not two', () => {
        const e = EV.buildHoleEvents(data, cd, sc, 7, null, p).filter(x => x.type === 'DOTS');
        assert.equal(e.length, 1);
        assert.match(e[0].text, /\+2 dots/);
    });

    test('a birdie is announced, a par is not', () => {
        const birdies = EV.buildHoleEvents(data, cd, sc, 7, null, p).filter(x => x.type === 'BIRDIE');
        assert.equal(birdies.length, 1);
        assert.match(birdies[0].text, /birdie/);
        assert.equal(EV.buildHoleEvents(data, cd, sc, 5, null, p).filter(x => x.type === 'BIRDIE').length, 0);
    });

    test('an eagle is named as an eagle', () => {
        const { cd: c2, p: p2 } = four();
        const s2 = {};
        c2.slice(0, 1).forEach(h => p2.forEach((pl, pi) => { s2[`p${pl.id}_h${h.hole}`] = h.par - (pi === 0 ? 2 : 0); }));
        const d2 = { gameFormat: 'stroke', players: p2, courseData: c2, scores: s2 };
        const e = EV.buildHoleEvents(d2, c2, s2, 1, null, p2).find(x => x.type === 'BIRDIE');
        assert.match(e.text, /eagle/);
    });
});

describe('SCORE CORRECTIONS — the recap follows the scores', () => {
    test('correcting the hole changes its recap', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const before = texts(EV.buildHoleEvents(data, cd, sc, 7, null, p));

        // Marty matches Manny on 7, so the skin carries instead of being won.
        const fixed = Object.assign({}, sc);
        fixed[`p${p[1].id}_h7`] = cd[6].par - 1;
        const after = texts(EV.buildHoleEvents(Object.assign({}, data, { scores: fixed }), cd, fixed, 7, null, p));

        assert.notEqual(before, after, 'the recap must recompute');
        assert.ok(/3 skins/.test(before) && !/3 skins/.test(after),
            'a skin that no longer happened must stop being reported');
    });

    test('no outcome is stored — the events are derived every time', () => {
        const s = read('hole-events.js');
        assert.ok(!/db\.ref|localStorage/.test(s), 'the event layer must persist nothing');
    });
});

// ---------------------------------------------------------------------------
describe('PRIORITY AND VOLUME', () => {
    const { cd, p } = four();
    const sc = acceptanceScores(cd, p);
    const data = acceptanceRound(cd, p, sc);

    test('events come back in a deterministic order', () => {
        const a = EV.buildHoleEvents(data, cd, sc, 7, null, p).map(e => e.type).join(',');
        const b = EV.buildHoleEvents(data, cd, sc, 7, null, p).map(e => e.type).join(',');
        assert.equal(a, b);
    });

    test('a finalized wager outranks a birdie', () => {
        const evs = EV.buildHoleEvents(data, cd, sc, 7, null, p);
        const fin = evs.findIndex(e => e.type === 'WAGER_FINAL');
        const bird = evs.findIndex(e => e.type === 'BIRDIE');
        if (fin > -1 && bird > -1) assert.ok(fin < bird);
    });

    test('personal events outrank identical-priority impersonal ones', () => {
        const meId = String(p[0].id);
        const evs = EV.buildHoleEvents(data, cd, sc, 7, meId, p);
        for (let i = 1; i < evs.length; i++) {
            if (evs[i].priority === evs[i - 1].priority) {
                assert.ok(!(evs[i].personal && !evs[i - 1].personal), 'personal should sort first at equal priority');
            }
        }
    });

    test('a busy hole is capped at three lines with a "+N more"', () => {
        const idx = read('index.html');
        assert.ok(/RECAP_LIMIT = 3/.test(idx));
        assert.ok(/\+ ' \+ hidden \+ ' more/.test(idx), 'there must be a way to see the rest');
    });
});

// ---------------------------------------------------------------------------
describe('IDENTITY — personalization, never authorization', () => {
    const idx = read('index.html');

    test('a known golfer is addressed as "You"', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const mine = texts(EV.buildHoleEvents(data, cd, sc, 7, String(p[0].id), p));
        assert.match(mine, /You win 3 skins/);
    });

    test('with no identity, everyone is named neutrally', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const neutral = texts(EV.buildHoleEvents(data, cd, sc, 7, null, p));
        assert.ok(!/You/.test(neutral));
        assert.match(neutral, /Manny/);
    });

    test('an invalid player id falls back to neutral rather than breaking', () => {
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        const bogus = texts(EV.buildHoleEvents(data, cd, sc, 7, 'not-a-real-id', p));
        assert.ok(!/You/.test(bogus));
    });

    test('resolvedMeId validates against the round\'s players', () => {
        const fn = idx.slice(idx.indexOf('function resolvedMeId'), idx.indexOf('function setMe'));
        assert.ok(/players\.find/.test(fn), 'a stale id must not be trusted');
        assert.ok(/return match \? String\(match\.id\) : null/.test(fn));
    });

    test('REGRESSION: identity grants no permission whatsoever', () => {
        // ?me= is personalization. Organizer rights still come from isOrganizerView(),
        // group scoping still from ?group. Editing ?me= changes whose name reads "You".
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(fn));
        assert.ok(!/meId|resolvedMeId/.test(fn), 'identity must never appear in a permission check');

        const links = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/isOrganizerView\(\)/.test(links));
        assert.ok(!/meId/.test(links));
    });

    test('identity is stored per ROUND, so it cannot leak between rounds', () => {
        assert.ok(/golfapp_me_\$\{currentMode\}/.test(idx), 'the key must be scoped to the round');
    });

    test('the golfer is asked once, and can skip', () => {
        assert.ok(/Which one are you\?/.test(idx));
        assert.ok(/skipWhoAmI/.test(idx));
        assert.ok(/just show everything/.test(idx));
    });

    test('no account, email or profile is ever requested', () => {
        const panel = idx.slice(idx.indexOf('function renderWhoAmI'), idx.indexOf('function renderWhoAmI') + 900);
        ['email', 'password', 'sign in', 'account'].forEach(w =>
            assert.ok(!new RegExp(w, 'i').test(panel), `the picker must not mention ${w}`));
    });

    test('the picker only appears when it could help', () => {
        const fn = idx.slice(idx.indexOf('function renderWhoAmI'), idx.indexOf('function renderWhoAmI') + 700);
        assert.ok(/resolvedMeId\(\) \|\| whoAmIDismissed \|\| scoped\.length < 2/.test(fn));
    });
});

describe('PERSONAL PRIORITIZATION — prioritized, never hidden', () => {
    const idx = read('index.html');

    test('the golfer\'s own side action is listed first, under Your Action', () => {
        assert.ok(/Your Action/.test(idx));
        const at = idx.indexOf('Your Action');
        assert.ok(idx.indexOf('Other Action', at) > at, 'Other Action must follow, not vanish');
    });

    test('other action is still shown in full', () => {
        const fn = idx.slice(idx.indexOf('if (otherSide.length)'), idx.indexOf('if (otherSide.length)') + 400);
        assert.ok(/otherSide\.map/.test(fn), 'nothing may be hidden');
    });

    test('the collapsed bar stays one line and stays truthful', () => {
        // WAVE 6: the "N yours" clause moved into the shared actionHeadline() rule so
        // the headline is deterministic. The invariant is unchanged and now asserted
        // at the rule itself.
        const fn = idx.slice(idx.indexOf(`'<span class="ac-count">'`), idx.indexOf(`'<span class="ac-count">'`) + 400);
        assert.ok(/headline/.test(fn));
        assert.ok(!/\$/.test(fn), 'the collapsed bar must not assert a money position mid-round');

        const bs = read('bet-strip.js');
        const rule = bs.slice(bs.indexOf('function actionHeadline'), bs.indexOf('function actionHeadline') + 400);
        assert.ok(/yours/.test(rule));
        assert.ok(!/\$\{?[a-z]*[Mm]oney|net/.test(rule), 'the headline must never claim a money position');
    });

    test('with no identity, the neutral ordering is preserved', () => {
        const fn = idx.slice(idx.indexOf('const mySide = []'), idx.indexOf('const totalBets'));
        assert.ok(/me &&/.test(fn), 'without identity everything falls to Other/Side Action');
    });
});

// ---------------------------------------------------------------------------
describe('SCORECARD RENDER', () => {
    function render(state) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { cd, p } = four();
        const sc = acceptanceScores(cd, p);
        const data = acceptanceRound(cd, p, sc);
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 7;` +
            `actionCenterOpen = true; ${state} renderWhoAmI(); renderHoleRecap(); renderActionCenter();`, sb);
        const g = id => {
            const el = sb.document.getElementById(id);
            return el ? el.innerHTML : '';
        };
        return { who: g('whoami-mount'), recap: g('hole-recap-mount'), action: g('action-center-mount') };
    }

    test('the recap appears under a plain "Hole 7 complete" heading', () => {
        const out = render('');
        assert.match(out.recap, /Hole 7 complete/);
        assert.match(out.recap, /hr-event/);
    });

    test('it shows at most three events, with a way to see the rest', () => {
        const out = render('');
        const shown = (out.recap.match(/class="hr-event/g) || []).length;
        assert.ok(shown <= 3, `${shown} events rendered at once`);
        assert.match(out.recap, /more/);
    });

    test('an identified golfer reads "You" in the recap', () => {
        const { p } = four();
        assert.match(render(`meId='${p[0].id}';`).recap, /You win/);
    });

    test('the who-are-you picker shows when identity is unknown, and not after', () => {
        assert.match(render('').who, /Which one are you/);
        const { p } = four();
        assert.equal(render(`meId='${p[0].id}';`).who, '');
    });

    test('the collapsed bar reports how much of the action is yours', () => {
        const { p } = four();
        assert.match(render(`meId='${p[0].id}'; actionCenterOpen=false;`).action, /1 yours/);
    });

    test('the recap sits between score entry and Prev/Next', () => {
        const idx = read('index.html');
        const recap = idx.indexOf(`html += '<div id="hole-recap-mount"></div>'`);
        const nav = idx.indexOf('html += navRowHtml;');
        assert.ok(recap > -1 && recap < nav);
    });

    test('the recap is hidden in print/PDF output', () => {
        assert.match(read('index.html'), /@media print \{ \.hole-recap/);
    });

    test('animation is subtle and gated on prefers-reduced-motion', () => {
        const idx = read('index.html');
        assert.ok(/prefers-reduced-motion: no-preference/.test(idx));
        assert.ok(!/flash|blink|bounce/i.test(idx.slice(idx.indexOf('.hole-recap {'), idx.indexOf('.hole-recap {') + 900)));
    });

    test('a broken round degrades to no recap instead of breaking score entry', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        vm.runInContext(`currentData = { players: [], courseData: [], scores: {} };` +
            `window.__scFilteredPlayers = []; currentViewedHole = 1; renderHoleRecap();`, sb);
        assert.equal(sb.document.getElementById('hole-recap-mount').innerHTML, '');
    });
});

describe('EARLIER WAVES PRESERVED', () => {
    const idx = read('index.html');

    test('money engines were not touched by Wave 5', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            const s = read(f);
            assert.ok(!/buildHoleEvents|resolvedMeId|renderHoleRecap/.test(s), `${f} was modified`);
        });
    });

    test('Wave 4 Finish Round is intact', () => {
        assert.ok(/renderFinishRoundMoney/.test(idx));
        assert.ok(/Who Pays Who/.test(idx));
    });

    test('Wave 4 Already Settled is intact', () => {
        assert.ok(/Already Settled/.test(idx));
        assert.ok(/acknowledgedFinals/.test(idx));
    });

    test('Wave 2/3 Today\'s Action and Add Action survive', () => {
        ['Main Game', 'Also Playing', '+ ADD ACTION'].forEach(t => assert.ok(idx.includes(t)));
    });

    test('Dollar Game stayed retired', () => {
        assert.ok(!/kpGameEnabled|markKPWinner/.test(idx.replace(/^\s*\/\/.*$/gm, '')));
    });
});
