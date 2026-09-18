// The auth-facing surface of tournament.html, read the same way by the
// anonymous-owner suite and its baseline capture: what #signed-in-as and both
// sign-in panels render, whether the Setup tab and panel exist, and what the
// Save gate does, for one auth user on an OWNED and on a LEGACY record.
const vm = require('vm');
const { loadHtmlInlineScript } = require('./load-script.js');
const strip = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const textOf = (el) => !el ? '' : (el.textContent || '') + (el.children || []).map(textOf).join('');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function record(overrides) {
    return Object.assign({ name: 'Gate Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie', 'Dee Delta'], handicap: 0 } },
        scores: { team1_h1: 4, team2_h1: 5 } }, overrides || {});
}
const OWNED = () => record({ ownerUid: 'u-org' });
const LEGACY = () => record();
// Arrive on ?tourney=GATE1: the record through the page's own value handler,
// the auth user through the SDK stub's onAuthStateChanged, in either order.
function arrive(rec, user, order) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=GATE1' });
    if (order !== 'record-first') sb.__auth.setUser(user);
    sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/GATE1$/.test(h.path)).forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    if (order === 'record-first') sb.__auth.setUser(user);
    return sb;
}
function surface(sb) {
    const d = sb.document;
    const el = id => d.getElementById(id);
    const panel = id => { const p = el(id); return p ? { display: p.style.display || '', html: strip(p.innerHTML) } : null; };
    return {
        signedInAs: strip(textOf(el('signed-in-as'))), signedInAsSetup: strip(textOf(el('signed-in-as-setup'))),
        panelManage: panel('signin-panel-manage'), panelSetup: panel('signin-panel-setup'),
        setupTab: !!el('tab-btn-setup'), setupPanel: !!el('manage-tab-setup'), leaderboardTab: !!el('tab-btn-leaderboard')
    };
}
// The Save gate on the setup screen (no record): the alert it raises, and the
// creating set() it writes, for this user.
function fillSetup(sb) {
    const d = sb.document;
    d.getElementById('t-name').value = 'Created Scramble';
    // course search (2026-09-17): a course with no card anywhere is no longer
    // selected - the silent par-4 fallback is gone - so the fixture hands the page
    // a card for cameron the way one arrives: through its own global_courses
    // listener. The captured surface (the save's alerts and set) is unchanged.
    sb.__dbHandlers.filter(h => h.event === 'value' && /global_courses$/.test(h.path)).forEach(h =>
        h.cb({ val: () => ({ cameron: { name: 'Cameron', data: COURSE } }), exists: () => true }));
    sb.pickCourse('cameron', 'Cameron');
    const list = d.getElementById('teams-list'); d.body.appendChild(list);
    const card = d.createElement('div'); card.className = 'team-card';
    const name = d.createElement('input'); name.className = 'team-name-input'; name.value = 'Eagles';
    const names = d.createElement('div'); names.className = 'team-name-inputs';
    ['Ann Alpha', 'Bo Bravo'].forEach(n => { const i = d.createElement('input'); i.value = n; names.appendChild(i); });
    const hcp = d.createElement('input'); hcp.className = 'team-handicap-input'; hcp.value = '0';
    card.appendChild(name); card.appendChild(names); card.appendChild(hcp); list.appendChild(card);
}
async function save(user) {
    const sb = loadHtmlInlineScript('tournament.html');
    sb.__auth.setUser(user);
    const alerts = []; sb.alert = (m) => alerts.push(String(m));
    fillSetup(sb);
    await sb.saveTournament();
    await new Promise(r => setImmediate(r));
    const sets = sb.__dbWrites.filter(x => /^tournaments\/[A-Z0-9]+$/.test(x.path) && x.op === 'set');
    // The issued code is random per run; the path's SHAPE is what is compared.
    return { alerts, sets: sets.map(s => ({ path: s.path.replace(/[A-Z0-9]+$/, '<code>'), ownerUid: s.value.ownerUid, name: s.value.name })), surface: surface(sb) };
}
module.exports = { OWNED, LEGACY, arrive, surface, save, strip };
