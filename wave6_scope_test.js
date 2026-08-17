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
const texts = evs => evs.map(e => e.text).join(' | ');

// 12 golfers, three groups of four. Manny is in Group 1.
function field() {
    const cd = makeCourseData(18);
    const names = ['Manny', 'Marty', 'John', 'Steve', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const p = makePlayers(names, names.map(() => 0));
    return { cd, p, g1: p.slice(0, 4), g2: p.slice(4, 8), g3: p.slice(8, 12) };
}

function bigRound(cd, p, scores, extra) {
    return Object.assign({
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' }
        },
        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
            }
        }
    }, extra || {});
}

function postHole(scores, group, cd, hole, winner) {
    group.forEach(pl => {
        scores[`p${pl.id}_h${hole}`] = cd[hole - 1].par + (winner && pl.id === winner.id ? -1 : 0);
    });
    return scores;
}

// ---------------------------------------------------------------------------
describe('EVENT SCOPE — participants, not the group on screen', () => {
    test('a round-level wager depends on every player in for money', () => {
        const { p } = field();
        assert.equal(EV.fieldParticipants({ players: p }).length, 12);
    });

    test('a player sitting out for money is not a participant', () => {
        const { p } = field();
        const out = p.map((pl, i) => Object.assign({}, pl, i === 5 ? { playingForMoney: false } : {}));
        assert.equal(EV.fieldParticipants({ players: out }).length, 11);
    });

    test('readiness reads raw scores, never "which hole is showing"', () => {
        const { cd, p, g1 } = field();
        const sc = postHole({}, g1, cd, 7);
        assert.equal(EV.participantsCompletedHole(g1, 7, sc), true);
        assert.equal(EV.participantsCompletedHole(p, 7, sc), false);
    });

    test('a wager only cares about holes inside its own range', () => {
        const { cd } = field();
        assert.equal(EV.gameCoversHole({ startHole: 5 }, cd, 3), false);
        assert.equal(EV.gameCoversHole({ startHole: 5 }, cd, 7), true);
    });
});

describe('MULTI-GROUP SKINS — the headline correctness case', () => {
    const { cd, p, g1, g2, g3 } = field();

    function at(stage) {
        const sc = {};
        postHole(sc, g1, cd, 7, p[0]);
        if (stage >= 2) postHole(sc, g2, cd, 7);
        if (stage >= 3) postHole(sc, g3, cd, 7);
        const data = bigRound(cd, p, sc);
        return { sc, data, events: EV.buildHoleEvents(data, cd, sc, 7, String(p[0].id), g1) };
    }

    test('REGRESSION: no skin is announced while two groups are still on the course', () => {
        const skins = at(1).events.filter(e => e.type.indexOf('SKIN') === 0);
        assert.equal(skins.length, 0, 'the app must not name a winner it cannot know');
    });

    test('still nothing after the second group finishes', () => {
        assert.equal(at(2).events.filter(e => e.type.indexOf('SKIN') === 0).length, 0);
    });

    test('once the last group posts, the result appears', () => {
        const skins = at(3).events.filter(e => e.type === 'SKIN_WON');
        assert.equal(skins.length, 1);
        assert.match(skins[0].text, /You win/);
    });

    test('REGRESSION: the pot is priced over the whole field, not the visible four', () => {
        // $5 x 12 = $60 across 18 holes = $3.33 a skin. Pricing over the group on
        // screen produced $20/18 and a number nobody was playing for.
        const e = at(3).events.find(x => x.type === 'SKIN_WON');
        assert.match(e.text, /\$3$/, `expected a whole-field skin value, got "${e.text}"`);
    });

    test('a whole-field tie carries, and only once everyone has posted', () => {
        const sc = {};
        [g1, g2].forEach(g => postHole(sc, g, cd, 7));
        const partial = bigRound(cd, p, sc);
        assert.equal(EV.buildHoleEvents(partial, cd, sc, 7, null, g1).filter(e => e.type.indexOf('SKIN') === 0).length, 0);

        postHole(sc, g3, cd, 7);
        const full = bigRound(cd, p, sc);
        const carry = EV.buildHoleEvents(full, cd, sc, 7, null, g1).filter(e => e.type === 'SKINS_CARRIED');
        assert.equal(carry.length, 1, 'a tied hole across the field should carry');
    });
});

describe('GROUP-LOCAL ACTION — must not wait on strangers', () => {
    const { cd, p, g1, g2, g3 } = field();

    test('a side match between two golfers reacts as soon as THEY finish', () => {
        const sc = postHole({}, g1, cd, 7, p[0]);
        const data = bigRound(cd, p, sc);
        const e = EV.buildHoleEvents(data, cd, sc, 7, String(p[0].id), g1);
        assert.ok(e.some(x => x.type === 'LEAD_CHANGE'),
            'Manny vs Marty must not wait for eight unrelated golfers');
    });

    test('a side match with a player still out on the course stays quiet', () => {
        const { cd: c2, p: p2, g1: gg1 } = field();
        const sc = postHole({}, gg1, c2, 7, p2[0]);
        const data = bigRound(c2, p2, sc, {
            sideMatches: {
                cross: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p2[0].id)], teamBIds: [String(p2[8].id)]
                }
            }
        });
        const e = EV.buildHoleEvents(data, c2, sc, 7, String(p2[0].id), gg1);
        assert.equal(e.filter(x => x.type === 'LEAD_CHANGE').length, 0,
            'a cross-group match needs both its own players, not the whole field');
    });

    test('a birdie is knowable immediately — it is a fact, not a contested outcome', () => {
        const sc = postHole({}, g1, cd, 7, p[0]);
        const data = bigRound(cd, p, sc);
        const e = EV.buildHoleEvents(data, cd, sc, 7, String(p[0].id), g1);
        assert.ok(e.some(x => x.type === 'BIRDIE'));
    });
});

describe('UNEVEN GROUP PACE', () => {
    test('groups on completely different holes still resolve hole 7 correctly', () => {
        const { cd, p, g1, g2, g3 } = field();
        const sc = {};
        for (let h = 1; h <= 9; h++) postHole(sc, g1, cd, h, h === 7 ? p[0] : null);
        for (let h = 1; h <= 8; h++) postHole(sc, g2, cd, h);
        for (let h = 1; h <= 6; h++) postHole(sc, g3, cd, h);

        let data = bigRound(cd, p, sc);
        assert.equal(EV.buildHoleEvents(data, cd, sc, 7, null, g1).filter(e => e.type.indexOf('SKIN') === 0).length, 0,
            'group 3 has not reached hole 7 yet');

        postHole(sc, g3, cd, 7);
        data = bigRound(cd, p, sc);
        assert.ok(EV.buildHoleEvents(data, cd, sc, 7, null, g1).some(e => e.type.indexOf('SKIN') === 0),
            'the result becomes knowable when the last participant posts, whenever that is');
    });

    test('a group ahead of the field does not block its own local action', () => {
        const { cd, p, g1 } = field();
        const sc = {};
        for (let h = 1; h <= 9; h++) postHole(sc, g1, cd, h, h === 9 ? p[0] : null);
        const data = bigRound(cd, p, sc);
        assert.ok(EV.buildHoleEvents(data, cd, sc, 9, String(p[0].id), g1).length > 0);
    });
});

describe('MID-ROUND RANGES — Wave 3 preserved', () => {
    test('an H5-18 skins game does not wait for anyone to post holes 1-4', () => {
        const { cd, p, g1, g2, g3 } = field();
        const sc = {};
        [g1, g2, g3].forEach(g => postHole(sc, g, cd, 7, null));
        postHole(sc, g1, cd, 7, p[0]);
        const data = bigRound(cd, p, sc, {
            additionalGames: {
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 }
            }
        });
        assert.ok(EV.buildHoleEvents(data, cd, sc, 7, null, g1).some(e => e.type.indexOf('SKIN') === 0),
            'holes 1-4 are outside this wager and must not gate it');
    });

    test('a hole before the start hole produces no event for that game', () => {
        const { cd, p, g1, g2, g3 } = field();
        const sc = {};
        [g1, g2, g3].forEach(g => postHole(sc, g, cd, 2, null));
        postHole(sc, g1, cd, 2, p[0]);
        const data = bigRound(cd, p, sc, {
            additionalGames: {
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 }
            }
        });
        assert.equal(EV.buildHoleEvents(data, cd, sc, 2, null, g1).filter(e => e.type.indexOf('SKIN') === 0).length, 0);
    });
});

describe('SCORE CORRECTIONS ACROSS GROUPS', () => {
    test('a correction in another group changes the whole-field result', () => {
        const { cd, p, g1, g2, g3 } = field();
        const sc = {};
        postHole(sc, g1, cd, 7, p[0]);
        postHole(sc, g2, cd, 7);
        postHole(sc, g3, cd, 7);

        const won = EV.buildHoleEvents(bigRound(cd, p, sc), cd, sc, 7, null, g1);
        assert.ok(won.some(e => e.type === 'SKIN_WON'));

        // Someone in group 3 matches Manny, so the skin carries instead.
        const fixed = Object.assign({}, sc);
        fixed[`p${p[9].id}_h7`] = cd[6].par - 1;
        const after = EV.buildHoleEvents(bigRound(cd, p, fixed), cd, fixed, 7, null, g1);
        assert.equal(after.filter(e => e.type === 'SKIN_WON').length, 0,
            'the original winner must not survive as stored truth');
        assert.ok(after.some(e => e.type === 'SKINS_CARRIED'));
    });
});

describe('MULTI-DEVICE — every phone agrees on the golf', () => {
    const { cd, p, g1, g2, g3 } = field();
    const sc = {};
    postHole(sc, g1, cd, 7, p[0]);
    postHole(sc, g2, cd, 7);
    postHole(sc, g3, cd, 7);
    const data = bigRound(cd, p, sc);

    test('group 1, group 2 and the organizer derive the same whole-field result', () => {
        const skinOf = scoped => EV.buildHoleEvents(data, cd, sc, 7, null, scoped)
            .filter(e => e.type.indexOf('SKIN') === 0).map(e => e.text).join('|');
        assert.equal(skinOf(g1), skinOf(g2));
        assert.equal(skinOf(g1), skinOf(p), 'the organizer view must agree too');
    });

    test('only the wording differs per device, never the golf', () => {
        const mannyPhone = EV.buildHoleEvents(data, cd, sc, 7, String(p[0].id), g1);
        const martyPhone = EV.buildHoleEvents(data, cd, sc, 7, String(p[1].id), g1);
        assert.equal(mannyPhone.length, martyPhone.length);
        assert.match(texts(mannyPhone), /You win/);
        assert.match(texts(martyPhone), /Manny wins/);
    });

    test('repeated renders stay identical', () => {
        const runs = [1, 2, 3, 4, 5].map(() => texts(EV.buildHoleEvents(data, cd, sc, 7, null, g1)));
        assert.equal(new Set(runs).size, 1);
    });

    test('no phone owns an event — nothing is persisted', () => {
        assert.ok(!/db\.ref|localStorage/.test(read('hole-events.js')));
    });
});

// ---------------------------------------------------------------------------
describe('"YOU" LANGUAGE', () => {
    test('the identified golfer is addressed in second person', () => {
        assert.equal(EV.personalize('Manny +2', 'Manny'), 'You +2');
        assert.equal(EV.personalize('Marty 1 UP', 'Manny'), 'Marty 1 UP');
    });

    test('TEAM wording keeps the partner named, so the golf meaning survives', () => {
        // "You 2 UP" would imply a singles match. "You/Marty 2 UP" is the truth.
        assert.equal(EV.personalize('Manny/Marty 2 UP', 'Manny'), 'You/Marty 2 UP');
    });

    test('a name that merely contains the golfer\'s name is left alone', () => {
        assert.equal(EV.personalize('Mannyfred +1', 'Manny'), 'Mannyfred +1');
    });

    test('with no identity, nothing is rewritten', () => {
        assert.equal(EV.personalize('Manny +2', null), 'Manny +2');
    });

    test('personalization happens in one place, so no call site can forget', () => {
        const s = read('hole-events.js');
        const fn = s.slice(s.indexOf('const push = (type, icon, rawText, opts)'), s.indexOf('const push = (type, icon, rawText, opts)') + 300);
        assert.ok(/personalize\(rawText, meName\)/.test(fn));
    });
});

describe('ACTION ORDERING — deterministic, relevance-based', () => {
    const rows = [
        { key: 'idle', status: 'No dots yet', tone: 'idle' },
        { key: 'close', status: 'Marty 2 UP', tone: 'up' },
        { key: 'carry', status: 'All square \u00B7 4 riding \u00B7 $80', tone: 'even' },
        { key: 'live', status: 'Manny +1', tone: 'up' }
    ];

    test('a wager that just changed rises to the top', () => {
        assert.equal(EV.sortActionRows(rows, { live: true })[0].key, 'live');
    });

    test('then one close to resolution, then a big carry, then quiet action', () => {
        assert.equal(EV.sortActionRows(rows, {}).map(r => r.key).join(','), 'close,carry,live,idle');
    });

    test('the sort is stable — equal ranks keep their order and the board never jitters', () => {
        const same = [{ key: 'a', status: 'x', tone: 'up' }, { key: 'b', status: 'y', tone: 'up' }];
        assert.equal(EV.sortActionRows(same, {}).map(r => r.key).join(','), 'a,b');
        assert.equal(EV.sortActionRows(same, {}).map(r => r.key).join(','), 'a,b');
    });

    test('REGRESSION: stake size is NOT a ranking factor', () => {
        // Ranking by dollars would turn My Round into an advert for betting more.
        const bs = read('bet-strip.js');
        const fn = bs.slice(bs.indexOf('function rankActionRow'), bs.indexOf('function sortActionRows'));
        assert.ok(!/stake/.test(fn), 'ordering must be about relevance, not wager size');
    });

    test('"close to done" is only claimed where it means something', () => {
        assert.equal(EV.isCloseToDone({ status: 'Marty 3 UP' }), true);
        assert.equal(EV.isCloseToDone({ status: 'Marty 1 UP' }), false);
        assert.equal(EV.isCloseToDone({ status: 'Manny +6' }), false, 'a stroke margin is not closeness');
        assert.equal(EV.isCloseToDone({ status: 'ALL SQUARE' }), false);
    });

    test('a big carry is three or more riding, not any carry at all', () => {
        assert.equal(EV.hasBigCarry({ status: '4 riding \u00B7 $80' }), true);
        assert.equal(EV.hasBigCarry({ status: '2 riding \u00B7 $40' }), false);
    });

    test('ordering state is never persisted', () => {
        // Scoped to recentlyChangedKeys itself. The previous slice ran to
        // toggleActionCenter, which now has the side-match press code between it and
        // this function - that code legitimately writes a press to Firebase.
        const idx = read('index.html');
        const start = idx.indexOf('function recentlyChangedKeys');
        const fn = idx.slice(start, idx.indexOf('\n    }', start));
        assert.ok(!/db\.ref|localStorage/.test(fn), 'bet order must not reach Firebase');
        assert.ok(/buildHoleEvents/.test(fn), 'sanity: the right function was captured');
    });

    test('the recap and the ordering share one derivation', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function recentlyChangedKeys'), idx.indexOf('function toggleActionCenter'));
        assert.ok(/buildHoleEvents/.test(fn), 'a second diff layer would let them disagree');
    });
});

describe('COLLAPSED SUMMARY — deterministic and truthful', () => {
    const rows = [{ key: 'skins', status: 'All square \u00B7 4 riding \u00B7 $80', tone: 'even' }];

    test('with identity, it reports how much of the action is yours', () => {
        assert.equal(EV.actionHeadline(rows, 3), '3 yours');
    });

    test('with none of your own, a big carry surfaces instead', () => {
        assert.equal(EV.actionHeadline(rows, 0), '4 skins riding');
    });

    test('with neither, it says nothing rather than inventing a headline', () => {
        assert.equal(EV.actionHeadline([{ key: 'a', status: 'Manny +1', tone: 'up' }], 0), '');
    });

    test('the priority is fixed, so the headline never cycles', () => {
        const a = EV.actionHeadline(rows, 2), b = EV.actionHeadline(rows, 2);
        assert.equal(a, b);
        assert.equal(a, '2 yours', 'yours always outranks a carry');
    });

    test('REGRESSION: it never claims a live money position', () => {
        // Mid-round a golfer's total mixes settled and unsettled wagers, so "+$23"
        // would break AT STAKE is not WON.
        assert.ok(!/\$/.test(EV.actionHeadline(rows, 3)));
        assert.ok(!/\$/.test(EV.actionHeadline(rows, 0)));
    });
});

// ---------------------------------------------------------------------------
describe('PERMISSIONS — identity is still not authorization', () => {
    const idx = read('index.html');

    test('Add Action is gated on organizer, never on identity', () => {
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(fn));
        assert.ok(!/meId|resolvedMeId/.test(fn));
    });

    test('Group Links stay organizer-only and identity-blind', () => {
        const fn = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/isOrganizerView\(\)/.test(fn));
        assert.ok(!/meId/.test(fn));
    });

    test('score locking still comes from the group, not from identity', () => {
        assert.ok(idx.includes('const isLocked = isMultiGroupRound && (!hasGroupLock || playerGroupMap[p.id] !== lockedGroup);'));
        const locked = idx.slice(idx.indexOf('const scoreInputHtml = isLocked'), idx.indexOf('const scoreInputHtml = isLocked') + 400);
        assert.ok(!/meId/.test(locked));
    });

    test('an unknown identity degrades to neutral instead of breaking', () => {
        const { cd, p, g1, g2, g3 } = field();
        const sc = {};
        [g1, g2, g3].forEach(g => postHole(sc, g, cd, 7));
        postHole(sc, g1, cd, 7, p[0]);
        const out = texts(EV.buildHoleEvents(bigRound(cd, p, sc), cd, sc, 7, 'ghost', g1));
        assert.ok(!/You/.test(out));
    });
});

describe('EARLIER WAVES PRESERVED', () => {
    test('the money engines were not touched', () => {
        ['money-engine.js', 'settlement-engine.js'].forEach(f => {
            assert.ok(!/fieldParticipants|sortActionRows|actionHeadline/.test(read(f)), `${f} was modified`);
        });
    });

    test('Wave 4 Finish Round and Already Settled survive', () => {
        const idx = read('index.html');
        assert.ok(/renderFinishRoundMoney/.test(idx));
        assert.ok(/Already Settled/.test(idx));
    });

    test('Wave 5 recap and identity survive', () => {
        const idx = read('index.html');
        assert.ok(/renderHoleRecap/.test(idx));
        assert.ok(/Which one are you/.test(idx));
    });

    test('My Matches still leads and Other Matches is still shown in full', () => {
        const idx = read('index.html');
        const at = idx.indexOf('My Matches');
        assert.ok(at > -1 && idx.indexOf('Other Matches', at) > at);
    });
});
