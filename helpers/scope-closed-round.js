// The round card_scope_closed_test.js and its baseline capture share: 24
// golfers in six groups of four, a stroke round with a Weekly Game pool (KP,
// net, skins), a birdie game, a Group 3 side match and a cross-group (3 x 6)
// side match, scored through hole 6 - so every scoped surface on the Card tab
// has something to show for Group 3 and the whole field.
const { makePlayers, makeCourseData } = require('./fixtures.js');
const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel',
    'Ivy India', 'Jon Juliet', 'Kim Kilo', 'Lee Lima', 'Max Mike', 'Ned November', 'Oli Oscar', 'Pat Papa',
    'Quy Quebec', 'Rae Romeo', 'Sam Sierra', 'Tia Tango', 'Uma Uniform', 'Vic Victor', 'Wes Whiskey', 'Xan Xray'];
function round() {
    const players = makePlayers(NAMES, NAMES.map((_, i) => (i * 7) % 19), 101);
    const scores = {};
    players.forEach((p, i) => CD.forEach(h => { if (h.hole <= 6) scores[`p${p.id}_h${h.hole}`] = h.par + ((i + h.hole) % 3) - 1; }));
    const id = i => String(players[i].id);
    return { eventName: 'Scope', courseName: 'Closed Links', players, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [3, 7] }, net: { amount: 100, places: [60, 40] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
        additionalGames: { birdies: { enabled: true, birdieValue: 2 } },
        sideMatches: {
            g3: { format: 'match', scoring: 'net', stake: 20, startHole: 1, createdAt: 1, teamAIds: [id(8)], teamBIds: [id(9)] },
            x36: { format: 'match', scoring: 'net', stake: 30, startHole: 1, createdAt: 2, teamAIds: [id(10)], teamBIds: [id(21)] }
        } };
}
module.exports = { round, CD };

// A one-group round: the same first four golfers, nothing else.
function oneGroupRound() {
    const r = round();
    r.players = r.players.slice(0, 4);
    delete r.sideMatches;
    return r;
}

// Arrive the way a golfer does: index.html loaded with the link in the URL, the
// round handed in through the page's own value listener. Returns the
// tag-stripped text of every element the page wrote, by id, plus the scoped
// list the page settled on. The mounts the widgets write into are placed in the
// tree first (mini-dom does not parse static markup).
const MOUNTS = ['hole-view-card', 'card-body', 'action-center-mount', 'hole-recap-mount', 'whoami-mount', 'fc-ticker-mount', 'live-skins-mount', 'live-board-mount', 'group-missing-note'];
function arrive(query, data) {
    const vm = require('vm');
    const { loadHtmlInlineScript } = require('./load-script.js');
    const strip = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
    const sb = loadHtmlInlineScript('index.html', [], { search: query });
    vm.runInContext(MOUNTS.map(id => "document.__mount(document.getElementById('" + id + "'));").join('') + ' actionCenterOpen = true; liveSkinsOpen = true;', sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/WAVEB');
    if (!h) throw new Error('index.html registered no round listener');
    h.cb({ val: () => JSON.parse(JSON.stringify(data || round())), exists: () => true });
    const text = {};
    for (const [id, el] of sb.document.__registry) { const t = strip(el.innerHTML || el.textContent || ''); if (t) text[id] = t; }
    const display = {};
    for (const [id, el] of sb.document.__registry) { if (el.style && el.style.display) display[id] = el.style.display; }
    const filtered = (sb.window.__scFilteredPlayers || []).map(p => p.name.split(' ')[0]);
    return { sb, text, display, filtered, raw: id => String(vm.runInContext("(document.getElementById('" + id + "')||{}).innerHTML || ''", sb)) };
}
module.exports.oneGroupRound = oneGroupRound;
module.exports.arrive = arrive;
