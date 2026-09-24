// ============================================================================
// SEASON LEDGER — one place for a crew's running money, skins and KP.
//
// seasons/<code> is owned by the same Firebase uid that owns a round. The
// ledger reads each linked events/<code> and keeps a round out of the total
// unless computeRoundSettlement says it is settled — the same word Results
// uses before it will say Final. An empty round is named and is not a $0.
//
// THE ENTRY. season.html with no code is the form Game Day links to. This
// file fills that form and reads the write. It does not call a render
// helper to paint the ledger: season.html?season=CODE registers the page's
// own value listener, the test fires that listener, and the card is whatever
// the page wrote. admin.html?season= is how "start the next round" comes
// back to Game Day; the tile's own handler mints the round.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const ENGINES = ['handicap.js', 'text-safe.js', 'action-model.js', 'money-engine.js', 'aloha-bet.js', 'settlement-engine.js', 'pool-engine.js'];

function holes(n) {
    return Array.from({ length: n }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
}
function scores(players, holeCount, shot) {
    const sc = {};
    players.forEach(p => {
        for (let h = 1; h <= holeCount; h++) sc['p' + p.id + '_h' + h] = shot(p, h);
    });
    return sc;
}
const POOL = {
    enabled: true, buyIn: 10,
    kp: { amount: 10, holes: [1] },
    skins: { mode: 'remainder', scoring: 'gross', carryOver: false }
};
function finalRound() {
    const players = [
        { id: 101, name: 'Marty', hcp: '0', playingForMoney: true },
        { id: 102, name: 'Dee', hcp: '0', playingForMoney: true }
    ];
    return {
        eventName: 'Monday', courseName: 'Caledonia', gameFormat: 'stroke',
        settlementMode: 'whole-dollar', players, courseData: holes(3),
        scores: scores(players, 3, p => p.id === 101 ? 4 : 5),
        moneyPool: POOL, kpWinners: { h1: '101' }
    };
}
function openRound() {
    const players = [
        { id: 101, name: 'Marty', hcp: '0', playingForMoney: true },
        { id: 102, name: 'Dee', hcp: '0', playingForMoney: true }
    ];
    const sc = {};
    sc.p101_h1 = 3;
    return Object.assign(finalRound(), { scores: sc, courseName: 'Still out' });
}
function emptyRound() {
    return {
        eventName: 'Monday', courseName: 'Not yet', gameFormat: 'stroke',
        players: [{ id: 301, name: 'Gus', hcp: '8', playingForMoney: true }],
        courseData: holes(3), scores: {}, moneyPool: POOL
    };
}

function alerts(sb) {
    sb.__alerts = [];
    sb.alert = m => { sb.__alerts.push(String(m)); };
    return sb;
}
function settle(ms) {
    return new Promise(r => setTimeout(r, ms == null ? 30 : ms));
}
async function flush() {
    for (let i = 0; i < 15; i++) await settle(0);
    await settle(20);
}

const UPDATED = 1750000000000;
// Built from the clock, not from seasonWhen, so a wrong month in the formatter fails here.
function utcStamp(ms) {
    const d = new Date(ms);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

describe('THE RECORD', () => {
    const S = loadJsFile('season.js', ['text-safe.js', 'action-model.js']);

    test('a season is a name, the owner uid, and the two clocks — notes only when typed', () => {
        const rec = S.seasonCreateRecord('  Monday skins  ', '  KP on 3  ', 'anon-org', 50);
        assert.equal(rec.name, 'Monday skins');
        assert.equal(rec.notes, 'KP on 3');
        assert.equal(rec.ownerUid, 'anon-org');
        assert.equal(rec.createdAt, 50);
        assert.equal(rec.updatedAt, 50);
        assert.equal(S.seasonCreateRecord('   ', '', 'anon-org', 50), null);
        assert.equal(S.seasonCreateRecord('Monday', '', '', 50), null);
        assert.equal(S.seasonCreateRecord('Monday', '', 'anon-org', 0), null);
        const bare = S.seasonCreateRecord('Monday', '   ', 'anon-org', 50);
        assert.equal(bare.notes, undefined);
        assert.equal(Object.keys(bare).sort().join(','), 'createdAt,name,ownerUid,updatedAt');
    });

    test('attaching a round patches that round only, and a second attach keeps the original addedAt', () => {
        const first = S.seasonAttachPatch('mon1a', 'Caledonia', 80);
        assert.equal(first.updatedAt, 80);
        assert.equal(first['rounds/MON1A/addedAt'], 80);
        assert.equal(first['rounds/MON1A/label'], 'Caledonia');
        const again = S.seasonAttachPatch('https://golf-app-5a5.pages.dev/index.html?game=mon1a', 'True Blue', 90, 80);
        assert.equal(again['rounds/MON1A/addedAt'], undefined);
        assert.equal(again['rounds/MON1A/label'], 'True Blue');
        assert.equal(again.updatedAt, 90);
        assert.equal(S.seasonAttachPatch('x', 'Caledonia', 80), null);
    });

    test('a hostile name is escaped in the list, and an empty phone says so', () => {
        const html = S.seasonListHtml([{ code: 'MON1', name: 'Bob <the Hammer>' }]);
        assert.match(html, /season-list-link/);
        assert.match(html, /href="season\.html\?season=MON1"/);
        assert.match(html, /Bob &lt;the Hammer&gt;/);
        assert.ok(!html.includes('<the Hammer>'));
        assert.match(S.seasonListHtml([]), /No season on this phone yet/);
    });
});

describe('WHO COUNTS, AND WHAT A ROUND THAT IS NOT FINAL CONTRIBUTES', () => {
    const S = loadJsFile('season.js', ['text-safe.js', 'action-model.js']);

    function row(code, players, facts) {
        return { code, label: code, addedAt: 1, facts: Object.assign({
            players, final: true, started: true, finished: true,
            moneyByNorm: {}, skinsById: {}, kpById: {}, netById: {}
        }, facts || {}) };
    }

    test('the same player id and the same name are one golfer; a copied Monday adds', () => {
        const players = [{ id: 101, name: 'Marty' }, { id: 102, name: 'Dee' }];
        const L = S.buildSeasonLedger([
            row('MON1A', players, { moneyByNorm: { marty: 10, dee: -10 }, skinsById: { '101': 2 }, kpById: { '101': 1 }, netById: { '101': 72, '102': 80 } }),
            row('MON2A', players, { moneyByNorm: { marty: 4, dee: -4 }, skinsById: { '101': 1 }, kpById: { '102': 1 }, netById: { '101': 70, '102': 81 } })
        ], { updatedAt: UPDATED });
        const marty = L.golfers.find(g => g.name === 'Marty');
        const dee = L.golfers.find(g => g.name === 'Dee');
        assert.equal(marty.money, 14);
        assert.equal(dee.money, -14);
        assert.equal(marty.skins, 3);
        assert.equal(marty.kp, 1);
        assert.equal(dee.kp, 1);
        assert.equal(marty.net, 142);
        assert.equal(L.finalCount, 2);
        assert.equal(L.openCount, 0);
        assert.match(S.seasonLedgerHtml(L), new RegExp('Updated ' + utcStamp(UPDATED)));
        assert.match(S.seasonLedgerHtml(L), /\+\$14/);
        assert.match(S.seasonLedgerHtml(L), /-\$14/);
    });

    test('an unfinished round and an empty round do not become zeros', () => {
        const players = [{ id: 101, name: 'Marty' }, { id: 102, name: 'Dee' }];
        const L = S.buildSeasonLedger([
            row('MON1A', players, { moneyByNorm: { marty: 10, dee: -10 }, skinsById: { '101': 1 }, kpById: { '101': 1 }, netById: { '101': 72, '102': 80 } }),
            row('MON3A', players, { final: false, finished: false, started: true, moneyByNorm: null, skinsById: null, kpById: null, netById: null }),
            row('MON4A', [{ id: 301, name: 'Gus' }], { final: false, finished: false, started: false, moneyByNorm: null, skinsById: null, kpById: null, netById: null })
        ], { updatedAt: UPDATED });
        const marty = L.golfers.find(g => g.name === 'Marty');
        const gus = L.golfers.find(g => g.name === 'Gus');
        assert.equal(marty.money, 10);
        assert.equal(marty.skins, 1);
        assert.equal(marty.openRounds, 1);
        assert.equal(gus.money, null);
        assert.equal(gus.skins, null);
        assert.equal(gus.kp, null);
        assert.equal(gus.net, null);
        assert.equal(L.rounds.find(r => r.code === 'MON3A').state, 'open');
        assert.equal(L.rounds.find(r => r.code === 'MON4A').state, 'empty');
        const html = S.seasonLedgerHtml(L);
        assert.match(html, /data-code="MON3A" data-final="no"/);
        assert.match(html, /Not final — not in the total/);
        assert.match(html, /Not started — not in the total/);
        assert.match(html, /data-key="id:301"[\s\S]*season-money">—/);
        assert.ok(!/data-key="id:301"[\s\S]*season-money">\$0/.test(html));
    });

    test('the same id with two names is not one golfer, and two ids with one name are not combined', () => {
        const L = S.buildSeasonLedger([
            row('MON1A', [{ id: 101, name: 'Marty' }], { moneyByNorm: { marty: 8 } }),
            row('MON2A', [{ id: 101, name: 'Dee' }], { moneyByNorm: { dee: -3 } }),
            row('MON3A', [{ id: 201, name: 'Marty' }], { moneyByNorm: { marty: 5 } })
        ], {});
        const martys = L.golfers.filter(g => g.name === 'Marty');
        // id 101 is Marty then Dee, so it is not a stable id. The MON1 Marty falls
        // through to the name key. id 201 is stable and stays id:201. A named
        // appearance that still has an id does not join a different stable id.
        assert.equal(martys.length, 2);
        const byKey = {};
        L.golfers.forEach(g => { byKey[g.key] = g; });
        assert.equal(byKey['name:marty'].money, 8);
        assert.equal(byKey['id:201'].money, 5);
        assert.equal(byKey['name:dee'].money, -3);
        assert.ok(L.notes.some(n => /Player id 101/.test(n) && /not combined/.test(n)));
        const split = S.buildSeasonLedger([
            row('MON1A', [{ id: 101, name: 'Marty' }], { moneyByNorm: { marty: 8 } }),
            row('MON2A', [{ id: 202, name: 'Marty' }], { moneyByNorm: { marty: 5 } })
        ], {});
        assert.equal(split.golfers.length, 2);
        assert.deepEqual(split.golfers.map(g => g.money).sort((a, b) => a - b), [5, 8]);
        assert.ok(split.notes.some(n => /not combined/.test(n)));
        const named = S.buildSeasonLedger([
            row('MON1A', [{ id: 101, name: 'Marty' }], { moneyByNorm: { marty: 8 } }),
            row('MON2A', [{ id: null, name: 'Marty' }], { moneyByNorm: { marty: 2 }, skinsById: null, kpById: null, netById: null })
        ], {});
        assert.equal(named.golfers.length, 1);
        assert.equal(named.golfers[0].money, 10);
        assert.equal(named.golfers[0].key, 'id:101');
    });

    test('a placeholder is unmatched and is not added to anybody', () => {
        const L = S.buildSeasonLedger([
            row('MON1A', [{ id: 101, name: 'Player 1' }], { moneyByNorm: { 'player 1': 4 } }),
            row('MON2A', [{ id: 101, name: 'Player 1' }], { moneyByNorm: { 'player 1': 4 } })
        ], {});
        assert.equal(L.golfers.length, 0);
        assert.equal(L.unmatched.length, 2);
        assert.match(S.seasonLedgerHtml(L), /season-unmatched/);
        assert.match(S.seasonLedgerHtml(L), /not added/);
    });
});

describe('THE FACTS ARE THE RESULTS ENGINES', () => {
    const S = loadJsFile('season.js', ENGINES);

    test('a finished round reports Results money, skins and KP; a short card reports none', () => {
        const data = finalRound();
        const facts = S.seasonRoundFacts(data);
        const combined = S.computeCombinedNetTotals(data, data.courseData, data.scores);
        const pool = S.computeMoneyPool(data, data.courseData, data.scores);
        assert.equal(facts.final, true);
        assert.equal(facts.moneyByNorm.marty, combined.netByName.marty.net);
        assert.equal(facts.moneyByNorm.dee, combined.netByName.dee.net);
        assert.ok(facts.moneyByNorm.marty > 0);
        assert.ok(Math.abs(facts.moneyByNorm.marty + facts.moneyByNorm.dee) < 0.005);
        const skins = (pool.skins.lines || []).filter(l => l.winnerId === '101').reduce((n, l) => n + (l.units || 1), 0);
        const kps = (pool.kp.lines || []).filter(l => l.winnerId === '101').length;
        assert.equal(facts.skinsById['101'], skins);
        assert.ok(facts.skinsById['101'] > 0);
        assert.equal(facts.kpById['101'], kps);
        assert.equal(kps, 1);
        assert.equal(facts.netById['101'], S.computePlayerRoundTotals(data.players[0], data.courseData, data.scores).net);
        const open = S.seasonRoundFacts(openRound());
        assert.equal(open.final, false);
        assert.equal(open.started, true);
        assert.equal(open.moneyByNorm, null);
        assert.equal(open.skinsById, null);
        assert.equal(open.kpById, null);
        const empty = S.seasonRoundFacts(emptyRound());
        assert.equal(empty.final, false);
        assert.equal(empty.started, false);
        assert.equal(empty.moneyByNorm, null);
    });
});

describe('THE SEASON PAGE, the way an organizer opens it', () => {
    test('touching nothing: the form is there, the list is empty, and nothing is written', async () => {
        const sb = alerts(loadHtmlInlineScript('season.html', [], { search: '' }));
        await flush();
        const src = require('fs').readFileSync(require('path').join(__dirname, 'season.html'), 'utf8');
        assert.match(src, /id="season-name-input"/);
        assert.match(src, /id="season-create-btn"/);
        assert.match(src, /onclick="createSeason\(this\)"/);
        assert.match(sb.document.getElementById('season-list').innerHTML, /No season on this phone yet/);
        assert.equal(sb.__dbWrites.filter(w => /seasons\//.test(w.path)).length, 0);
        sb.createSeason(sb.document.getElementById('season-create-btn'));
        await flush();
        assert.match(sb.__alerts.join('\n'), /name/i);
        assert.equal(sb.__dbWrites.filter(w => /seasons\//.test(w.path)).length, 0);
    });

    test('Start season writes seasons/<code> owned by this uid', async () => {
        const sb = alerts(loadHtmlInlineScript('season.html', [], { search: '', localStorage: true }));
        await flush();
        sb.document.getElementById('season-name-input').value = 'Monday skins';
        sb.document.getElementById('season-notes-input').value = 'KP on 3 and 7';
        sb.createSeason(sb.document.getElementById('season-create-btn'));
        await flush();
        const w = sb.__dbWrites.filter(x => /^seasons\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(x.path) && x.op === 'set');
        assert.equal(w.length, 1, JSON.stringify(sb.__dbWrites.map(x => x.op + ' ' + x.path)));
        assert.equal(w[0].value.name, 'Monday skins');
        assert.equal(w[0].value.notes, 'KP on 3 and 7');
        assert.equal(w[0].value.ownerUid, 'anon-stub');
        assert.ok(w[0].value.createdAt > 0 && w[0].value.updatedAt === w[0].value.createdAt);
        assert.equal(w[0].value.rounds, undefined);
        const code = w[0].path.split('/')[1];
        assert.match(sb.location.href, new RegExp('season\\.html\\?season=' + code));
        const remembered = JSON.parse(sb.localStorage.getItem('hardpanSeasonList'));
        assert.equal(remembered[0].code, code);
        assert.equal(remembered[0].name, 'Monday skins');
        const fsWrite = sb.__dbWrites.find(x => x.path === 'organizers/anon-stub/firstSeenAt');
        assert.ok(fsWrite && sb.__dbWrites.indexOf(fsWrite) < sb.__dbWrites.indexOf(w[0]));
    });

    test('a refused create says the database refused it and does not navigate', async () => {
        const sb = alerts(loadHtmlInlineScript('season.html', [], { search: '' }));
        await flush();
        sb.__dbRefuse = (p) => /^seasons\//.test(p) ? Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }) : null;
        sb.document.getElementById('season-name-input').value = 'Monday skins';
        const href = sb.location.href;
        sb.createSeason(sb.document.getElementById('season-create-btn'));
        await flush();
        assert.match(sb.__alerts.join('\n'), /refused/);
        assert.equal(sb.location.href, href);
        assert.equal(sb.document.getElementById('season-create-btn').disabled, false);
    });

    function arrive(extra) {
        const sb = alerts(loadHtmlInlineScript('season.html', [], { search: '?season=MON1' }));
        if (extra && extra.reads) sb.__dbReads = extra.reads;
        if (extra && extra.refuse) sb.__dbRefuse = extra.refuse;
        return sb;
    }
    function fire(sb, season) {
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'seasons/MON1');
        assert.ok(h, 'the season page did not register its listener');
        h.cb({ val: () => JSON.parse(JSON.stringify(season)) });
        return h;
    }

    test('the listener paints the ledger, and an unfinished round is not in the money', async () => {
        const oracle = loadJsFile('season.js', ENGINES);
        const one = oracle.seasonRoundFacts(finalRound());
        const sb = arrive({
            reads: {
                'events/MON1A': finalRound(),
                'events/MON2A': finalRound(),
                'events/MON3A': openRound(),
                'events/MON4A': emptyRound()
            }
        });
        await flush();
        assert.match(sb.document.getElementById('season-ledger').innerHTML, /Loading the ledger/);
        fire(sb, {
            name: 'Monday skins',
            notes: 'KP on 3 and 7',
            ownerUid: 'anon-stub',
            createdAt: 1,
            updatedAt: UPDATED,
            rounds: {
                MON1A: { addedAt: 1, label: 'Week 1' },
                MON2A: { addedAt: 2, label: 'Week 2' },
                MON3A: { addedAt: 3, label: 'Week 3' },
                MON4A: { addedAt: 4, label: 'Week 4' }
            }
        });
        await flush();
        const html = sb.document.getElementById('season-ledger').innerHTML;
        assert.match(html, /season-ledger-card/);
        assert.match(html, new RegExp('Updated ' + utcStamp(UPDATED)));
        assert.match(html, /2 rounds in the total/);
        assert.match(html, /2 not final/);
        assert.match(html, /data-code="MON1A" data-final="yes"/);
        assert.match(html, /data-code="MON2A" data-final="yes"/);
        assert.match(html, /data-code="MON3A" data-final="no"/);
        assert.match(html, /data-code="MON4A" data-final="no"/);
        assert.match(html, /Not final — not in the total/);
        assert.match(html, /Not started — not in the total/);
        const want = oracle.seasonMoneyText(one.moneyByNorm.marty * 2);
        const dee = oracle.seasonMoneyText(one.moneyByNorm.dee * 2);
        assert.match(html, new RegExp(want.replace(/[+$]/g, m => '\\' + m)));
        assert.match(html, new RegExp(dee.replace(/[+$]/g, m => '\\' + m)));
        assert.match(html, /data-key="id:101"/);
        assert.ok(one.skinsById['101'] > 0);
        assert.equal(one.kpById['101'], 1);
        assert.match(html, new RegExp('season-skins">' + (one.skinsById['101'] * 2) + '<'));
        assert.match(html, new RegExp('season-kp">' + (one.kpById['101'] * 2) + '<'));
        assert.match(html, /data-key="id:301"[\s\S]*season-money">—/);
        assert.equal(sb.document.getElementById('season-title').textContent, 'Monday skins');
        assert.equal(sb.document.getElementById('season-notes-line').textContent, 'KP on 3 and 7');
        assert.equal(sb.document.getElementById('season-tools').style.display, 'block');
        const btn = sb.document.getElementById('season-next-btn');
        assert.equal(btn.style.display, 'block');
        assert.equal(btn.getAttribute('data-copy-from'), 'MON4A');
        assert.match(btn.textContent, /Week 4/);
        sb.startNextRound();
        assert.match(sb.location.href, /admin\.html\?season=MON1&copyFrom=MON4A/);
    });

    test('Add round writes only that round onto the season', async () => {
        const sb = arrive({ reads: { 'events/MON1A': finalRound() } });
        await flush();
        fire(sb, {
            name: 'Monday skins', ownerUid: 'anon-stub', createdAt: 1, updatedAt: 1, rounds: {}
        });
        await flush();
        assert.equal(sb.document.getElementById('season-view').style.display, 'block');
        const src = require('fs').readFileSync(require('path').join(__dirname, 'season.html'), 'utf8');
        assert.match(src, /id="season-view"/);
        assert.match(src, /onclick="attachRound\(this\)"/);
        sb.document.getElementById('season-attach-code').value = 'mon1a';
        sb.attachRound(sb.document.getElementById('season-attach-btn'));
        await flush();
        const w = sb.__dbWrites.filter(x => x.path === 'seasons/MON1' && x.op === 'update');
        assert.equal(w.length, 1, JSON.stringify(sb.__dbWrites));
        assert.equal(w[0].value['rounds/MON1A/label'], 'Caledonia');
        assert.ok(w[0].value['rounds/MON1A/addedAt'] > 0);
        assert.equal(w[0].value.updatedAt, w[0].value['rounds/MON1A/addedAt']);
        assert.equal(sb.__dbWrites.filter(x => x.path === 'events/MON1A' && x.op !== 'once').length, 0);
    });

    test('someone else\'s season shows the ledger and does not attach', async () => {
        const sb = arrive({ reads: { 'events/MON1A': finalRound() } });
        await flush();
        fire(sb, {
            name: 'Monday skins', ownerUid: 'someone-else', createdAt: 1, updatedAt: UPDATED,
            rounds: { MON1A: { addedAt: 1, label: 'Week 1' } }
        });
        await flush();
        const html = sb.document.getElementById('season-ledger').innerHTML;
        assert.match(html, /data-final="yes"/);
        assert.match(html, /Marty/);
        assert.equal(sb.document.getElementById('season-tools').style.display, 'none');
        sb.document.getElementById('season-attach-code').value = 'mon1a';
        sb.attachRound(sb.document.getElementById('season-attach-btn'));
        await flush();
        assert.equal(sb.__dbWrites.filter(x => /seasons\//.test(x.path)).length, 0);
        sb.startNextRound();
        assert.ok(!/copyFrom=/.test(sb.location.href));
    });
});

describe('GAME DAY', () => {
    test('touching nothing: the season list is empty and the start link is the season page', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '' });
        const html = sb.document.getElementById('season-list').innerHTML;
        assert.match(html, /No season on this phone yet/);
        const src = require('fs').readFileSync(require('path').join(__dirname, 'admin.html'), 'utf8');
        assert.match(src, /id="season-start-link" href="season.html"/);
        assert.match(src, /onclick="openSeasonFromLobby\(this\)"/);
        assert.equal(sb.__dbWrites.filter(w => /seasons\//.test(w.path)).length, 0);
    });

    test('a season this phone already opened is a link, with no extra tap', () => {
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: '',
            localStorage: true,
            seedStorage: { hardpanSeasonList: JSON.stringify([{ code: 'MON1', name: 'Monday skins' }]) }
        });
        const html = sb.document.getElementById('season-list').innerHTML;
        assert.match(html, /href="season\.html\?season=MON1"/);
        assert.match(html, /Monday skins/);
        assert.ok(!/No season on this phone yet/.test(html));
    });

    test('opening a code from Game Day goes to that ledger', () => {
        const sb = alerts(loadHtmlInlineScript('admin.html', [], { search: '' }));
        sb.document.getElementById('season-open-input').value = 'mon1';
        sb.openSeasonFromLobby(sb.document.getElementById('season-open-btn'));
        assert.equal(sb.location.href, 'season.html?season=MON1');
    });

    test('a season link on Game Day is carried onto the round the tile mints, copy and all', async () => {
        const sb = alerts(loadHtmlInlineScript('admin.html', [], {
            search: '?season=SEAS1&copyFrom=MON1A',
            beforeRun(s) {
                s.__dbReads = { 'seasons/SEAS1': { name: 'Monday skins', ownerUid: 'anon-stub', createdAt: 1, updatedAt: 1 } };
            }
        }));
        await flush();
        assert.equal(sb.document.getElementById('season-context-banner').style.display, 'block');
        assert.equal(sb.document.getElementById('season-context-name').textContent, 'Monday skins');
        sb.selectHomeWidget('quick');
        await flush();
        assert.match(sb.location.href, /admin\.html\?game=[A-Z0-9]+&eventType=quick&season=SEAS1&copyFrom=MON1A/);
    });

    test('saving the round links it to the season and does not rewrite the round as the link', async () => {
        const sb = alerts(loadHtmlInlineScript('admin.html', [], { search: '?game=GATE01&season=SEAS1' }));
        vm.runInContext(`
            window.crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } };
            var key = Object.keys(coursePresets)[0];
            courseHiddenSelect.value = key;
            courseSearchInput.value = coursePresets[key].name;
            window.__courseName = coursePresets[key].name;
        `, sb);
        sb.saveSettings();
        await flush();
        const round = sb.__dbWrites.find(w => w.path === 'events/GATE01' && w.op === 'update');
        assert.ok(round, JSON.stringify(sb.__dbWrites.map(w => w.op + ' ' + w.path)));
        const link = sb.__dbWrites.find(w => w.path === 'seasons/SEAS1' && w.op === 'update');
        assert.ok(link, JSON.stringify(sb.__dbWrites.map(w => w.op + ' ' + w.path)));
        assert.ok(sb.__dbWrites.indexOf(round) < sb.__dbWrites.indexOf(link));
        assert.equal(link.value['rounds/GATE01/label'], sb.window.__courseName);
        assert.ok(link.value['rounds/GATE01/addedAt'] > 0);
        assert.equal(round.value.rounds, undefined);
    });
});
