// ============================================================================
// REOPENING A WIZARD-SAVED ROUND - the Chrome test, the fixture pin, and the
// dead-id scan.
//
// THE DEFECT: admin.html:5754 called updatePressRuleExplanation('nassau-press-
// rule', ...) whenever data.nassauPressRule was truthy. The <select> left the
// page in de07a2f (2026-08-27); the save writes nassauPressRule "2down" on
// every round (its fallback when the select is absent); so every reopen of
// every wizard-saved round threw inside loadModeData - silently emptying Step
// 5 before v124, and after v124 leaving the flights switch off, both scopes
// at their defaults and the Stableford block unrestored, with a re-save then
// writing flights: null. Not one fixture in the repo carried nassauPressRule,
// and the harness could not have seen it anyway: mini-dom's getElementById
// resolves ANY id to a detached element, so the null dereference cannot
// happen there. Only Chrome throws.
//
// THREE GUARDS, because each covers what the others cannot:
//   1. the Chrome arrival (below, and tools/round-reopen-check.js by hand): a
//      wizard-saved shape reopened as a copy and as an edit, nothing called,
//      no alert, no error, flights on, every tag, the Stableford block;
//   2. the fixture pin: helpers/wizard-saved-round.js writes every key the
//      payload writes - held against the payload's own key list, so a key the
//      save grows is a red test until the fixture carries it;
//   3. the dead-id scan: every string id admin.html looks up with
//      getElementById exists in its markup or is built by its JS, or the
//      lookup is guarded - the class of defect, caught at source, where the
//      harness is blind.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { wizardSavedRound, PAYLOAD_KEYS } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ADMIN = read('admin.html');
const CD = makeCourseData(18);
const OLD = wizardSavedRound({ code: 'RRT001', courseData: CD, overrides: { stablefordPointVal: 2, stablefordScoring: 'gross',
    stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 4, eagle: 6, albatross: 8 }, flights: { enabled: true, scopes: { skins: 'field', birdies: 'flight' } } } });
const DB = { events: { RRT001: OLD }, global_courses: { tidewater: { name: 'Tidewater', data: CD } }, trips: {}, tournaments: {} };
const PRE = "window.__alerts = []; window.__errs = []; window.alert = function (m) { window.__alerts.push(String(m)); };"
    + " var ce = console.error; console.error = function () { window.__errs.push([].slice.call(arguments).map(function (x) { return x && x.stack ? x.stack : String(x); }).join(' ')); ce.apply(console, arguments); };"
    + " window.addEventListener('unhandledrejection', function (e) { window.__errs.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)); });";
const PROBE = `JSON.stringify({
  rows: [...document.querySelectorAll('#player-list .player-row')].map(r => [r.querySelector('.p-name-input').value, r.querySelector('.p-hcp-input').value, (r.querySelector('.p-flight-input') || { getAttribute: () => null }).getAttribute('data-flight')]),
  flightsOn: document.getElementById('flights-enabled').value, skinsScope: document.getElementById('flights-scope-skins').value, birdiesScope: document.getElementById('flights-scope-birdies').value,
  stableford: [document.getElementById('stableford-point-value').value, document.getElementById('stableford-scoring').value, document.getElementById('stableford-pts-birdie').value, document.getElementById('stableford-pts-eagle').value],
  mpEnabled: document.getElementById('mp-enabled').checked, stackedSkins: !!(stackedGameState.skins && stackedGameState.skins.enabled),
  banner: getComputedStyle(document.getElementById('copy-from-banner')).display, alerts: window.__alerts, errs: window.__errs })`;

const S = {};
before(async () => {
    for (const [k, q] of [['copy', 'game=RRT999&copyFrom=RRT001'], ['edit', 'game=RRT001']]) {
        const r = await arriveCold({ url: fileUrl('admin.html', q), db: DB, settleMs: 5000, preScript: PRE, steps: [{ expression: PROBE }] });
        S[k] = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
    }
});
const EXPECT = OLD.players.map(p => [p.name, String(p.hcp), p.flight]);

['copy', 'edit'].forEach(k => {
    describe('COLD CHROME, a wizard-saved round reopened as a ' + k.toUpperCase(), () => {
        test('ran', () => assert.ok(S[k] && !S[k].reason, 'did not run: ' + (S[k] && S[k].reason)));
        test('no alert, no console error, no unhandled rejection', () => {
            assert.deepEqual(S[k].alerts, []); assert.deepEqual(S[k].errs, []);
        });
        test('23 rows: every name, handicap and A/B tag as the record holds them', () => {
            assert.deepEqual(S[k].rows, EXPECT);
        });
        test('the flights switch is ON and both scopes are as stored (skins field, birdies flight)', () => {
            assert.equal(S[k].flightsOn, 'true'); assert.equal(S[k].skinsScope, 'field'); assert.equal(S[k].birdiesScope, 'flight');
        });
        test('the Stableford block restored: 2, gross, birdie 4, eagle 6', () => {
            assert.deepEqual(S[k].stableford, ['2', 'gross', '4', '6']);
        });
        test('the Main Pool and the stacked skins wager are on; the copied-from banner only on the copy', () => {
            assert.equal(S[k].mpEnabled, true); assert.equal(S[k].stackedSkins, true);
            assert.equal(S[k].banner, k === 'copy' ? 'block' : 'none');
        });
    });
});

describe('THE FIXTURE holds every key the payload writes', () => {
    test('helpers/wizard-saved-round.js PAYLOAD_KEYS == the keys of `const payload = {` in admin.html, in order', () => {
        const at = ADMIN.indexOf('const payload = {');
        const body = ADMIN.slice(at, ADMIN.indexOf('\n            };', at));
        const keys = [...body.matchAll(/^\s{16}([a-zA-Z]+):/gm)].map(m => m[1]);
        assert.deepEqual(keys, PAYLOAD_KEYS, 'the save grew or lost a key - update helpers/wizard-saved-round.js');
    });
    test('the built round carries every one of them (null-valued keys deleted, as update() would), plus nassauPressRule "2down"', () => {
        const r = wizardSavedRound({ code: 'X' });
        const nulls = ['richHoleBet', 'richHoleBetPresses', 'richOverallBetPresses', 'skinsPotFormat'];
        PAYLOAD_KEYS.forEach(k => { if (nulls.includes(k)) assert.ok(!(k in r), k + ' is a deleted null'); else assert.ok(k in r, 'fixture lacks ' + k); });
        assert.equal(r.nassauPressRule, '2down');
        assert.equal(r.players.length, 23); assert.equal(r.players[0].flight, 'A'); assert.equal(r.players[22].flight, 'B');
        assert.equal(typeof r.players[0].hcp, 'string');
    });
});

describe('THE DEAD-ID SCAN: no lookup of an id the page no longer has, unless guarded', () => {
    // Ids the page has: static markup, JS-built (.id = '...'), or template-built
    // prefixes (id="kp-ft-${h}").
    const staticIds = new Set([...ADMIN.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).concat([...ADMIN.matchAll(/\bid='([^']+)'/g)].map(m => m[1])));
    const dynIds = new Set([...ADMIN.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
    const prefixes = new Set([...ADMIN.matchAll(/id=\\?["']([a-zA-Z0-9_-]+)\$\{/g)].map(m => m[1]).concat([...ADMIN.matchAll(/\.id\s*=\s*['"]([a-zA-Z0-9_-]+)['"]\s*\+/g)].map(m => m[1])));
    const exists = (id) => staticIds.has(id) || dynIds.has(id) || [...prefixes].some(p => id.startsWith(p));
    // A lookup is guarded when the same line tests the element before using it:
    // `getElementById("x") ? ... : ...`, `if (data.k && getElementById("x")) ...`,
    // `(getElementById('x') || {})`, `if (getElementById("x"))`.
    const guarded = (line, id) => new RegExp('getElementById\\((["\'])' + id.replace(/[-]/g, '\\-') + '\\1\\)\\s*(\\?|&&|\\|\\||\\)\\s*\\{|\\)\\s*[a-zA-Z_$]|\\)\\))').test(line);

    test('every DEREFERENCED getElementById(\'<literal>\') names an id that exists, or is guarded on that line or the one before', () => {
        // Only a lookup that is used at once - `.value`, `.checked`, `.style`... -
        // can throw; `const el = getElementById(...)` followed by `if (el)` is the
        // guarded idiom and is not flagged. A ternary guard may sit on the line above.
        const lines = ADMIN.split('\n');
        const offenders = [];
        lines.forEach((line, i) => {
            for (const m of line.matchAll(/getElementById\((['"])([^'"]+)\1\)\.(value|checked|textContent|innerHTML|style|classList|options|selectedIndex|disabled|focus|click)/g)) {
                const id = m[2];
                const prev = i > 0 ? lines[i - 1] : '';
                const ternaryAcrossLines = new RegExp('getElementById\\((["\'])' + id + '\\1\\)\\s*$').test(prev) && /^\s*\?/.test(line);
                if (exists(id) || guarded(line, id) || guarded(prev, id) || ternaryAcrossLines) continue;
                offenders.push((i + 1) + ': ' + id + '  ' + line.trim().slice(0, 100));
            }
        });
        assert.deepEqual(offenders, [], 'unguarded lookups of ids the page does not have:\n' + offenders.join('\n'));
    });
    test('the scan is live: the ids it knows about, and the six retired Nassau ids it tolerates only because every lookup is guarded', () => {
        assert.ok(staticIds.size > 200, 'ids in the markup: ' + staticIds.size);
        ['nassau-press-rule', 'nassau-scoring', 'nassau-stake', 'nassau-type', 'nassau-settings', 'nassau-bet-explainer'].forEach(id => assert.ok(!exists(id), id + ' is retired'));
        const code = ADMIN.replace(/\/\/[^\n]*/g, '');   // the note where the helper stood names it; code must not
        assert.ok(!/function updatePressRuleExplanation|updatePressRuleExplanation\(|pressRuleExplanations\s*=|nassau-press-explanation/.test(code), 'the dead helper, its table and its call are gone');
    });
    test('every helper that dereferences getElementById(<parameter>) is called only with literal ids that exist (the original defect went through one)', () => {
        // The :5754 defect never named the retired id at the dereference: it passed
        // 'nassau-press-rule' into updatePressRuleExplanation(selectId, ...), which
        // did `getElementById(selectId).value`. So: find every such helper, the
        // parameter it dereferences, and hold every literal argument at that
        // position across the file to the ids the page has.
        const lines = ADMIN.split('\n');
        const helpers = {};   // name -> Set of parameter indexes that are dereferenced
        lines.forEach((line, i) => {
            for (const m of line.matchAll(/getElementById\(([A-Za-z_$][\w$]*)\)\.(value|checked|textContent|innerHTML|style|classList|options|selectedIndex|disabled)/g)) {
                const param = m[1];
                for (let j = i; j >= 0; j--) {
                    const fm = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(lines[j]);
                    if (fm) { const idx = fm[2].split(',').map(x => x.trim().split('=')[0].trim()).indexOf(param); if (idx >= 0) { (helpers[fm[1]] = helpers[fm[1]] || new Set()).add(idx); } break; }
                    const am = new RegExp('const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*\\(?\\s*' + param + '\\s*\\)?\\s*=>').exec(lines[j]);
                    if (am) { (helpers[am[1]] = helpers[am[1]] || new Set()).add(0); break; }
                }
            }
        });
        assert.ok(Object.keys(helpers).length >= 3, 'helpers found: ' + JSON.stringify(Object.keys(helpers)));
        const offenders = [];
        Object.keys(helpers).forEach(name => {
            const re = new RegExp('\\b' + name + '\\(([^()]*)\\)', 'g');
            for (const m of ADMIN.matchAll(re)) {
                const args = m[1].split(',').map(a => a.trim());
                helpers[name].forEach(idx => {
                    const lit = /^(['"])([^'"]+)\1$/.exec(args[idx] || '');
                    if (lit && !exists(lit[2])) offenders.push(name + '(' + args.join(', ') + ') -> ' + lit[2]);
                });
            }
        });
        assert.deepEqual(offenders, [], 'a helper dereferences an id the page does not have:\n' + offenders.join('\n'));
    });
    test('helpers with a variable id are called with ids that exist', () => {
        // syncToggle(hiddenId, switchId, leftLabelId, rightLabelId, ...) dereferences all four.
        const calls = [...ADMIN.matchAll(/syncToggle\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*,\s*(['"])([^'"]+)\5\s*,\s*(['"])([^'"]+)\7/g)];
        assert.ok(calls.length >= 5, 'syncToggle call sites: ' + calls.length);
        calls.forEach(m => [m[2], m[4], m[6], m[8]].forEach(id => assert.ok(exists(id), 'syncToggle asked for ' + id)));
    });
});
