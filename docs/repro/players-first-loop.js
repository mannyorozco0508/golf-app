// Run from the repo root: node docs/repro/players-first-loop.js  (job 011, 2026-10-17). Diagnostic only, not part of the suite.
// Players-first loop, desktop Chrome (iOS-like: no Capacitor, front door on via the flag).
// Arrives cold at the URL afterSave() sends a golfer to, touches nothing. Only the data source
// and its timing are set: the stub's live snapshot is held back DELAY ms (a real network).
const path = require('path'); const HERE = path.join(__dirname, '..', '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const NAMES = ['Ann Able', 'Bob Baker', 'Cal Cole', 'Dee Dunn'];
const mk = (n) => { const r = wizardSavedRound({ code: 'PFLOOP', golfers: n, names: NAMES.slice(0, n), hcps: [9, 12, 5, 20].slice(0, n), ownerUid: 'anon-cold', thru: 0, flights: false,
    overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } }); delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; return r; };
const DB = { events: { PFLOOP: mk(4) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const arm = (snapN, delay) => {
    const nx = { code: 'PFLOOP', id: 'vegas', name: 'Vegas', need: 4, stage: 'game', at: Date.now() };
    let pre = 'window.__hardpanDoors = true; window.__freshPhone = true;'
        + "sessionStorage.setItem('hardpan_ag_next', " + JSON.stringify(JSON.stringify(nx)) + ");";
    if (snapN) pre += "localStorage.setItem('golfapp_snap_v1_PFLOOP', " + JSON.stringify(JSON.stringify({ data: mk(snapN), at: Date.now() })) + ");";
    if (delay) pre += "(function(){var st=window.setTimeout;window.setTimeout=function(f,ms){if(!ms&&typeof f==='function'&&String(f).indexOf('resolve()')!==-1)ms=" + delay + ";return st.apply(this,[f,ms].concat([].slice.call(arguments,2)));};})();";
    return pre;
};
const OUT = "JSON.stringify({ url: document.URL.split('/').pop(), players: (typeof currentData!=='undefined'&&currentData&&currentData.players||[]).filter(p=>p&&p.name).length, need: !!document.getElementById('fd-need'), next: sessionStorage.getItem('hardpan_ag_next') })";
(async () => {
    const res = {};
    for (const [k, snapN, delay] of [['A stale 1-golfer copy, live 1500ms', 1, 1500], ['B no stored copy, live 1500ms', 0, 1500], ['C stale 1-golfer copy, live instant', 1, 0], ['D current 4-golfer copy, live 1500ms', 4, 1500]]) {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=PFLOOP&agq=vegas'), db: DB, preScript: arm(snapN, delay), settleMs: 500, viewport: { width: 390, height: 844 },
            steps: [{ sleep: 4000 }, { expression: OUT }] });
        res[k] = r.ok ? r.value.filter(v => typeof v === 'string' && v[0] === '{').map(JSON.parse).pop() : 'harness: ' + r.reason;
    }
    console.log(JSON.stringify(res, null, 1));
})();
