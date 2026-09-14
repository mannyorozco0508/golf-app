// ============================================================================
// REOPENING A WIZARD-SAVED ROUND RESTORES EVERYTHING - on COPY and on EDIT.
//
// WHY THIS NEEDS A BROWSER. helpers/mini-dom.js resolves ANY id to a detached
// element, so `document.getElementById('gone').value` never throws there. The
// defect this check exists for - loadModeData calling a helper on a <select>
// deleted in de07a2f, on every round the wizard had saved - could only ever be
// seen in Chrome. So this arrives cold on a round in the shape the wizard
// writes (helpers/wizard-saved-round.js: every payload key, nassauPressRule
// "2down" included), twice - as a copy (?game=NEW&copyFrom=OLD) and as an
// edit (?game=OLD) - touches nothing, and reads the wizard.
//
//   node tools/round-reopen-check.js
//
//   exit 0   both arrivals: no alert, no console error or unhandled rejection,
//            23 rows with handicaps, the flights switch ON, an A/B tag on every
//            row matching the record, both scope switches as stored, the
//            Stableford block as stored, the Main Pool and stacked skins on
//   exit 1   something did not restore, or something was reported
//   exit 2   could not run
// ============================================================================
const path = require('path');
const { arriveCold, fileUrl } = require(path.join(__dirname, 'lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(__dirname, '..', 'helpers', 'wizard-saved-round.js'));
const { makeCourseData } = require(path.join(__dirname, '..', 'helpers', 'fixtures.js'));

const CD = makeCourseData(18);
const OLD = wizardSavedRound({ code: 'RRC001', courseData: CD, overrides: { stablefordPointVal: 2, stablefordScoring: 'gross',
    stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 4, eagle: 6, albatross: 8 }, flights: { enabled: true, scopes: { skins: 'field', birdies: 'flight' } } } });
const db = { events: { RRC001: OLD }, global_courses: { tidewater: { name: 'Tidewater', data: CD } }, trips: {}, tournaments: {} };

const PRE = "window.__alerts = []; window.__errs = []; window.alert = function (m) { window.__alerts.push(String(m)); };"
    + " var ce = console.error; console.error = function () { window.__errs.push([].slice.call(arguments).map(function (x) { return x && x.stack ? x.stack : String(x); }).join(' ')); ce.apply(console, arguments); };"
    + " window.addEventListener('unhandledrejection', function (e) { window.__errs.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)); });"
    + " window.addEventListener('error', function (e) { window.__errs.push('error: ' + e.message); });";
const PROBE = `JSON.stringify({
  rows: [...document.querySelectorAll('#player-list .player-row')].map(r => [r.querySelector('.p-name-input').value, r.querySelector('.p-hcp-input').value, (r.querySelector('.p-flight-input') || { getAttribute: () => null }).getAttribute('data-flight')]),
  flightsOn: document.getElementById('flights-enabled').value,
  skinsScope: document.getElementById('flights-scope-skins').value, birdiesScope: document.getElementById('flights-scope-birdies').value,
  stableford: { val: document.getElementById('stableford-point-value').value, scoring: document.getElementById('stableford-scoring').value, birdie: document.getElementById('stableford-pts-birdie').value, eagle: document.getElementById('stableford-pts-eagle').value },
  mpEnabled: document.getElementById('mp-enabled').checked, stackedSkins: !!(typeof stackedGameState === 'object' && stackedGameState.skins && stackedGameState.skins.enabled),
  banner: getComputedStyle(document.getElementById('copy-from-banner')).display,
  alerts: window.__alerts, errs: window.__errs })`;

function bail(msg, extra) { console.log('EXIT 2: ' + msg); if (extra) console.log(JSON.stringify(extra, null, 2)); process.exit(2); }

async function check(label, query) {
    const r = await arriveCold({ url: fileUrl('admin.html', query), db, settleMs: 5000, preScript: PRE, steps: [{ expression: PROBE }] });
    if (!r.ok) bail(label + ' did not run: ' + r.reason);
    let p; try { p = JSON.parse(r.value[0]); } catch (e) { bail(label + ': non-JSON probe', r.value); }
    const f = [];
    const expect = OLD.players.map(x => [x.name, String(x.hcp), x.flight]);
    console.log(label + ': rows ' + p.rows.length + ', flightsOn ' + p.flightsOn + ', scopes skins=' + p.skinsScope + ' birdies=' + p.birdiesScope
        + ', stableford ' + JSON.stringify(p.stableford) + ', pool ' + p.mpEnabled + ', stacked skins ' + p.stackedSkins + ', banner ' + p.banner
        + ', alerts ' + p.alerts.length + ', errors ' + p.errs.length);
    if (p.alerts.length) f.push('an alert fired: ' + p.alerts.join(' | '));
    if (p.errs.length) f.push('an error was reported: ' + p.errs.join(' | ').slice(0, 400));
    if (p.rows.length !== expect.length) f.push('rows ' + p.rows.length + ', expected ' + expect.length);
    if (JSON.stringify(p.rows) !== JSON.stringify(expect)) f.push('rows differ from the record (name, hcp, tag): first mismatch ' + JSON.stringify(p.rows.find((r, i) => JSON.stringify(r) !== JSON.stringify(expect[i]))));
    if (p.flightsOn !== 'true') f.push('the flights switch is not ON');
    if (p.skinsScope !== 'field' || p.birdiesScope !== 'flight') f.push('flight scopes not as stored: ' + p.skinsScope + '/' + p.birdiesScope);
    if (p.stableford.val !== '2' || p.stableford.scoring !== 'gross' || p.stableford.birdie !== '4' || p.stableford.eagle !== '6') f.push('the Stableford block did not restore: ' + JSON.stringify(p.stableford));
    if (!p.mpEnabled) f.push('the Main Pool is not on'); if (!p.stackedSkins) f.push('the stacked skins wager is not on');
    if ((query.indexOf('copyFrom') > -1) !== (p.banner === 'block')) f.push('copied-from banner: ' + p.banner);
    return f;
}

(async () => {
    const failures = [];
    (await check('COPY  admin.html?game=RRC999&copyFrom=RRC001', 'game=RRC999&copyFrom=RRC001')).forEach(x => failures.push('COPY: ' + x));
    (await check('EDIT  admin.html?game=RRC001', 'game=RRC001')).forEach(x => failures.push('EDIT: ' + x));
    if (failures.length) { console.log('EXIT 1'); failures.forEach(x => console.log('  - ' + x)); process.exit(1); }
    console.log('EXIT 0: a wizard-saved round reopens whole, as a copy and as an edit');
    process.exit(0);
})().catch(e => bail(e && e.stack || String(e)));
