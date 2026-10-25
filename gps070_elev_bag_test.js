// ============================================================================
// HARDPAN GPS - 070 PART 3: MY BAG "MY CLUB YARDAGES ARE MEASURED AT" + "SUGGEST CLUBS
// USING ELEVATION"
//
// gps-shots.js (HardPanGpsBag) runs in a sandbox with a stand-in localStorage: the
// migration of every old choice, per-golfer storage on this phone only, the new switch.
// gps-view.js: suggestUsesElevation() + clubYd() are lifted from the real source and run
// against the real gps-geo.js playsLike and the real suggestClub - the switch both ways.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'gps-shots.js')) && fs.existsSync(path.join(__dirname, 'gps-view.js'));
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no GPS files' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const j = (x) => JSON.parse(JSON.stringify(x));

function bagBox(seed) {
    const store = {};
    if (seed) store.hardpan_bag_v1 = JSON.stringify(seed);
    const sb = { JSON, Object, Math, Number, String, Date, isFinite, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(read('gps-shots.js'), sb);
    return { B: sb.HardPanGpsBag, store };
}
const k = (name) => 'n:' + name.toLowerCase();

// ---- MIGRATION: the 4 paths ---------------------------------------------------------
test('070-3 migration: never set -> Sea level; sea -> Sea level; course -> Custom with its feet; none -> stays Don\'t adjust (nothing rewritten)', () => {
    const seed = { v: 1, golfers: {
        [k('Ann Alder')]: { shots: {}, set: { '7i': 160 } },                                            // never chose
        [k('Ben Birch')]: { shots: {}, set: {}, alt: { mode: 'sea', tempF: 65 } },                       // Sea level
        [k('Cal Cedar')]: { shots: {}, set: {}, alt: { mode: 'course', name: 'Grayhawk Golf Club', ft: 1530, tempF: 80 } },  // 012's "A course I pick"
        [k('Dee Dogwood')]: { shots: {}, set: {}, alt: { mode: 'none' } },                               // Don't adjust
        [k('Eve Elm')]: { shots: {}, set: {}, alt: { mode: 'course', name: 'Somewhere abroad', ft: null } } } };
    const { B, store } = bagBox(seed);
    const before = store.hardpan_bag_v1;
    // 1. never set -> sea
    assert.deepStrictEqual(j(B.baseline('Ann Alder')), { mode: 'sea', name: '', ft: 0, tempF: null, chosen: false, picked: false });
    assert.strictEqual(B.baselineFt(B.baseline('Ann Alder')), 0);
    assert.deepStrictEqual(j(B.baseline('Nobody Here')), { mode: 'sea', name: '', ft: 0, tempF: null, chosen: false, picked: false }, 'no bag at all: Sea level too');
    // 2. sea -> sea
    assert.deepStrictEqual(j(B.baseline('Ben Birch')), { mode: 'sea', name: '', ft: 0, tempF: 65, chosen: true, picked: false });
    // 3. course -> Custom with its feet (and the course's name as where the number came from)
    assert.deepStrictEqual(j(B.baseline('Cal Cedar')), { mode: 'custom', name: 'Grayhawk Golf Club', ft: 1530, tempF: 80, chosen: true, picked: false });
    assert.strictEqual(B.baselineFt(B.baseline('Cal Cedar')), 1530);
    assert.strictEqual(B.baselineFt(B.baseline('Eve Elm')), null, 'a picked course with no height: Custom, altitude not available (as before)');
    // 4. none -> stays Don't adjust
    assert.deepStrictEqual(j(B.baseline('Dee Dogwood')), { mode: 'none', name: '', ft: null, tempF: null, chosen: true, picked: false });
    assert.strictEqual(B.baselineFt(B.baseline('Dee Dogwood')), undefined, 'Don\'t adjust: no altitude at all');
    assert.strictEqual(store.hardpan_bag_v1, before, 'reading never rewrites what is stored');
    // Anything unknown that was stored stays Don't adjust (as 012 did); only "never chose" moves.
    const { B: B2 } = bagBox({ v: 1, golfers: { [k('Fay Fir')]: { shots: {}, set: {}, alt: { mode: 'moon' } } } });
    assert.strictEqual(B2.baseline('Fay Fir').mode, 'none');
});

test('070-3 setBaseline: Custom with typed feet; 012\'s "course" still accepted (stored as Custom); anything else = Don\'t adjust', () => {
    const { B, store } = bagBox();
    B.setBaseline('Gus Gum', { mode: 'custom', ft: '1200' });
    assert.deepStrictEqual(j(B.baseline('Gus Gum')), { mode: 'custom', name: '', ft: 1200, tempF: null, chosen: true, picked: false });
    B.setBaseline('Gus Gum', { mode: 'course', name: 'Papago Golf Course', ft: 1240.6 });
    assert.deepStrictEqual(j(B.baseline('Gus Gum')), { mode: 'custom', name: 'Papago Golf Course', ft: 1241, tempF: null, chosen: true, picked: false });
    assert.strictEqual(JSON.parse(store.hardpan_bag_v1).golfers[k('Gus Gum')].alt.mode, 'custom');
    B.setBaseline('Gus Gum', { mode: 'custom', ft: '' });
    assert.strictEqual(B.baselineFt(B.baseline('Gus Gum')), null, 'blank feet: no height yet');
    B.setBaseline('Gus Gum', { mode: 'moon' });
    assert.strictEqual(B.baseline('Gus Gum').mode, 'none');
    assert.deepStrictEqual(j(B.ALT_MODES), ['sea', 'custom', 'none']);
});

// ---- PER GOLFER, THIS PHONE ONLY ------------------------------------------------------
test('070-3 per golfer, on this phone only: two golfers keep their own choice + switch; never in the account sync; Reset all keeps it', () => {
    const { B, store } = bagBox();
    B.setBaseline('Hal Hazel', { mode: 'custom', ft: 1200, tempF: 75 });
    B.setSuggestUsesElevation('Hal Hazel', false);
    B.setBaseline('Ivy Ironwood', { mode: 'none' });
    assert.strictEqual(B.baseline('hal  hazel').mode, 'custom');
    assert.strictEqual(B.baseline('Ivy Ironwood').mode, 'none');
    assert.strictEqual(B.baseline('Jo Juniper').mode, 'sea', 'a third golfer who never chose: Sea level');
    assert.strictEqual(B.suggestUsesElevation('Hal Hazel'), false);
    assert.strictEqual(B.suggestUsesElevation('Ivy Ironwood'), true);
    assert.strictEqual(B.suggestUsesElevation('Jo Juniper'), true, 'default ON');
    B.setup('Hal Hazel', { '7i': 160 });
    assert.deepStrictEqual(Object.keys(j(B.syncShape('Hal Hazel'))), ['base'], 'the account sync never carries it');
    assert.deepStrictEqual(Object.keys(store), ['hardpan_bag_v1'], 'one key on this phone');
    assert.ok(!/lat|lng|"p"/.test(store.hardpan_bag_v1), 'no position kept');
    B.resetAll('Ivy Ironwood');
    assert.strictEqual(B.baseline('Ivy Ironwood').mode, 'none', 'Reset all: a Don\'t adjust golfer keeps it');
    B.resetAll('Hal Hazel');
    assert.deepStrictEqual(j(B.baseline('Hal Hazel')), { mode: 'custom', name: '', ft: 1200, tempF: 75, chosen: true, picked: false });
    assert.strictEqual(B.suggestUsesElevation('Hal Hazel'), false);
    assert.deepStrictEqual(Object.keys(j(B.bag('Hal Hazel'))), [], 'Reset all still clears the clubs');
    assert.strictEqual(B.needsSetup('Hal Hazel'), true, 'and the first-time setup is due again, as before');
});

test('070-3 the switch: default ON; OFF kept when the baseline changes; setting it never marks "chosen" (a never-chose golfer stays on the Sea level default)', () => {
    const { B } = bagBox();
    B.setSuggestUsesElevation('Kim Koa', false);
    assert.strictEqual(B.suggestUsesElevation('Kim Koa'), false);
    assert.deepStrictEqual(j(B.baseline('Kim Koa')), { mode: 'sea', name: '', ft: 0, tempF: null, chosen: false, picked: false });
    B.setBaseline('Kim Koa', { mode: 'custom', ft: 3000 });
    assert.strictEqual(B.suggestUsesElevation('Kim Koa'), false, 'OFF survives a new baseline');
    B.setBaseline('Kim Koa', Object.assign({}, B.baseline('Kim Koa'), { tempF: 60 }));
    assert.strictEqual(B.suggestUsesElevation('Kim Koa'), false, 'and a new temperature');
    B.setSuggestUsesElevation('Kim Koa', true);
    assert.strictEqual(B.suggestUsesElevation('Kim Koa'), true);
    assert.strictEqual(B.baseline('Kim Koa').ft, 3000, 'turning it back ON keeps the baseline');
});

// ---- THE SWITCH BOTH WAYS (the real gps-view functions) -------------------------------
const fnSrc = (src, name) => { const i = src.indexOf('    function ' + name + '('); assert.ok(i > 0, name); return src.slice(i, src.indexOf('\n    }\n', i) + 6); };
function viewBox(golfer) {
    const geo = require('./gps-geo.js');
    const { B } = bagBox();
    B.set(golfer, '7i', 160); B.set(golfer, '8i', 149);
    const v = read('gps-view.js');
    const calls = [];
    const sb = {
        B, geo, calls, golfer,
        bagApi: () => B, bagGolfer: () => golfer,
        // the 064 scenario: 151 yds to the middle, a 1,200 ft course, calm, 70 F
        playsTo: (tp, noAlt) => { calls.push(!!noAlt); const al = B.baselineFt(B.baseline(golfer)); const q = { yards: 151, tempF: 70 }; if (!noAlt && typeof al === 'number') { q.altFt = 1200; q.altBaseFt = al; } return geo.playsLike(q); },
    };
    vm.createContext(sb);
    vm.runInContext(fnSrc(v, 'suggestUsesElevation') + fnSrc(v, 'clubYd') + '; this.suggestUsesElevation = suggestUsesElevation; this.clubYd = clubYd;', sb);
    const pick = () => { calls.length = 0; const pl = sb.playsTo(null); const yd = sb.clubYd(pl, null); return { shown: pl.yards, yd: Math.round(yd * 10) / 10, club: B.suggestClub(B.bag(golfer), yd).club, noAlt: calls.slice() }; };
    return { B, sb, pick };
}
test('070-3 Suggest clubs using elevation ON: the club from the plays-like number WITH altitude (as today) - 151 plays 148 at 1.5%, 8-iron', () => {
    const { B, sb, pick } = viewBox('Lou Larch');
    B.setBaseline('Lou Larch', { mode: 'sea' });
    assert.strictEqual(sb.suggestUsesElevation(), true);
    const r = pick();
    assert.strictEqual(r.shown, 148);
    assert.strictEqual(r.club, '8i');
    assert.deepStrictEqual(r.noAlt, [false], 'ON: no second, altitude-free number is worked out');
});
test('070-3 Suggest clubs using elevation OFF: the club from D WITHOUT altitude (151 -> 7-iron) while the number still shows 148', () => {
    const { B, sb, pick } = viewBox('Mo Maple');
    B.setBaseline('Mo Maple', { mode: 'custom', ft: 0 });
    B.setSuggestUsesElevation('Mo Maple', false);
    assert.strictEqual(sb.suggestUsesElevation(), false);
    const r = pick();
    assert.strictEqual(r.shown, 148, 'the number on screen keeps the altitude');
    assert.strictEqual(r.yd, 151, 'the club\'s yards: no altitude term');
    assert.strictEqual(r.club, '7i');
    assert.deepStrictEqual(r.noAlt, [false, true]);
});
test('070-3 the switch only matters with a baseline: Don\'t adjust + OFF = the same club as ON (no altitude term to leave out)', () => {
    const { B, pick } = viewBox('Nia Nutmeg');
    B.setBaseline('Nia Nutmeg', { mode: 'none' });
    B.setSuggestUsesElevation('Nia Nutmeg', false);
    const r = pick();
    assert.strictEqual(r.shown, 151);
    assert.strictEqual(r.club, '7i');
    assert.deepStrictEqual(r.noAlt, [false], 'nothing to leave out');
});

// ---- WIRING + "DON'T ADJUST" STILL THERE -----------------------------------------------
test('070-3 gps-view wiring: every club pick goes through clubYd; playsTo(.., noAlt) drops only the altitude; exposed', () => {
    const v = read('gps-view.js');
    assert.ok(/var sg = B\.suggestClub\(bagNow\(B\), clubYd\(p, p\.aimPt\)\);/.test(fnSrc(v, 'playsClubNow')), 'playsClubNow');
    assert.ok(/clubYd\(pl, S\.target \|\| null\)/.test(fnSrc(v, 'ldPlays')), 'layout D pill');
    assert.ok(/if \(pl\) yd = clubYd\(pl, moved \? to : null\);/.test(v), 'the Suggested: line');
    assert.ok(/clubYd\(pl, moved \? S\.target : null\)/.test(v), 'the 009 line');
    assert.ok(/if \(noAlt\) \{ delete q\.altFt; delete q\.altBaseFt;/.test(fnSrc(v, 'playsTo')), 'only the altitude is left out');
    assert.ok(/if \(noAlt\) return \{ yards: Math\.round\(D\), exact: D, terms: \{\} \};/.test(fnSrc(v, 'playsTo')), 'outside the US (altitude only): the club\'s yards = D');
    assert.ok(/suggestUsesElevation: function \(\) \{ try \{ return suggestUsesElevation\(\);/.test(v), 'exposed');
    assert.ok(/terms: pl\.terms, aimPt: tp \|\| null/.test(fnSrc(v, 'playsLineNow')));
});
test('070-3 My bag: the new wording, "Don\'t adjust" still a full choice next to the others, the switch default ON, the temperature line unchanged', () => {
    const v = read('gps-view.js');
    const row = v.slice(v.indexOf('<div class="gps-bag-alt-row">'), v.indexOf('</div>', v.indexOf('<div class="gps-bag-alt-row">')));
    assert.ok(/data-bag-alt="sea">Sea level <span class="gps-bag-alt-def">\(default\)<\/span>/.test(row));
    assert.ok(/data-bag-alt="custom">Custom elevation</.test(row));
    assert.ok(/data-bag-alt="none">' \+ "Don't adjust" \+ '</.test(row), 'Don\'t adjust is a button in the same row - not hidden, not a link');
    assert.ok(/My club yardages are measured at:/.test(v));
    assert.ok(/class="gps-bag-alt-ft" data-bag-alt-ft="1"[^>]*> ft<\/label>/.test(v), 'Custom elevation [____ ft]');
    assert.ok(/class="gps-bag-alt-here">Use this course</.test(v) && /placeholder="Find a course"/.test(v));
    assert.ok(/<b>Suggest clubs using elevation<\/b>/.test(v) && /role="switch" class="gps-bag-alt-sug" data-bag-alt-sug="1" checked/.test(v), 'the switch, ON');
    assert.ok(v.indexOf('Typical temperature when I set these <input type="number" inputmode="numeric" class="gps-bag-alt-temp" data-bag-alt-temp="1" min="-20" max="130" placeholder="70" aria-label="Typical temperature when I set these, degrees F"> \\u00b0F</label>') !== -1, 'temperature line unchanged');
    const fa = fnSrc(v, 'fillAlt');
    assert.ok(/'This course: ' \+ \(here != null \? ftShown\(here\) \+ ' ft' : 'no height yet'\)/.test(fa) && /elevSrcShown\(ce\.src\)/.test(fa), 'This course: 1,200 ft (source)');
    assert.ok(/courseElevNow\(\)/.test(fa));
    // the setting still sits behind the bagAltitude switch and inside the paid GPS (S.pro) as before
    assert.ok(/data-feature="bagAltitude" role="group" aria-label="My club yardages are measured at"/.test(v));
    assert.ok(/if \(!S \|\| !S\.pro \|\| S\.mode !== 'measure'\) return null;/.test(fnSrc(v, 'playsTo')), 'plays-like (and so the club) stays paid');
});

// ---- 070 (Manny's answers, Oct 25): EXPLICIT PICKS, TEMPERATURE-ONLY EDITS, THE ONE-TIME NOTE ----
const BAGSET = { shots: {}, set: { '7i': 160 } };
test('070-3 a tap records an explicit pick (pick: 1); the temperature alone never writes a choice', () => {
    const { B, store } = bagBox({ v: 1, golfers: { [k('Ola Olive')]: Object.assign({}, BAGSET) } });
    B.setBaselineTemp('Ola Olive', 62);
    assert.deepStrictEqual(j(B.baseline('Ola Olive')), { mode: 'sea', name: '', ft: 0, tempF: 62, chosen: false, picked: false }, 'temperature only: still the Sea level default, never chosen');
    assert.ok(!('mode' in JSON.parse(store.hardpan_bag_v1).golfers[k('Ola Olive')].alt), 'no mode written by a temperature edit');
    B.setBaselineTemp('Ola Olive', '');
    assert.strictEqual(B.baseline('Ola Olive').tempF, null, 'blank = back to 70');
    B.setBaseline('Ola Olive', { mode: 'none', picked: true });
    assert.deepStrictEqual(j(B.baseline('Ola Olive')), { mode: 'none', name: '', ft: null, tempF: null, chosen: true, picked: true });
    B.setBaselineTemp('Ola Olive', 80);
    B.setBaseline('Ola Olive', Object.assign({}, B.baseline('Ola Olive'), { tempF: 81 }));
    assert.strictEqual(B.baseline('Ola Olive').picked, true, 'the pick survives later temperature edits (either path)');
    assert.strictEqual(B.baseline('Ola Olive').mode, 'none');
    const v = read('gps-view.js');
    assert.ok(/B\.setBaseline\(bagGolfer\(\), Object\.assign\(\{ tempF: cur\.tempF \}, a, \{ picked: true \}\)\);/.test(fnSrc(v, 'altSet')), 'every tap (Sea level, Custom height / course, Don\'t adjust) goes through altSet with picked: true');
    assert.ok(/Bt\.setBaselineTemp\(bagGolfer\(\), tv === '' \? null : Number\(tv\)\)/.test(v), 'the temperature box writes the temperature only');
});
test('070-3 one-time note: a temperature-only golfer (new code) goes to Sea level and sees the note ONCE', () => {
    const { B } = bagBox({ v: 1, golfers: { [k('Pia Pine')]: Object.assign({}, BAGSET) } });
    B.setBaselineTemp('Pia Pine', 65);
    assert.strictEqual(B.baseline('Pia Pine').mode, 'sea');
    assert.strictEqual(B.elevNoteDue('Pia Pine'), true);
    B.elevNoteSeen('Pia Pine');
    assert.strictEqual(B.elevNoteDue('Pia Pine'), false, 'never again on this phone');
    B.setBaselineTemp('Pia Pine', 70);
    assert.strictEqual(B.elevNoteDue('Pia Pine'), false, 'still never again after more edits');
});
test('070-3 one-time note: a real "Don\'t adjust" pick stays and gets NO note; never-chose with a bag -> Sea level + note; no bag -> no note', () => {
    const { B } = bagBox({ v: 1, golfers: {
        [k('Quin Quince')]: Object.assign({}, BAGSET, { alt: { mode: 'none', pick: 1 } }),
        [k('Rae Rowan')]: Object.assign({}, BAGSET),
        [k('Sid Spruce')]: { shots: {}, set: {}, setupAt: 5 } } });
    assert.strictEqual(B.baseline('Quin Quince').mode, 'none');
    assert.strictEqual(B.elevNoteDue('Quin Quince'), false, 'Don\'t adjust picked: no note');
    assert.strictEqual(B.baseline('Rae Rowan').mode, 'sea');
    assert.strictEqual(B.elevNoteDue('Rae Rowan'), true, 'never chose, clubs typed: note');
    assert.strictEqual(B.elevNoteDue('Sid Spruce'), true, 'never chose, bag set up (or skipped) here: note');
    assert.strictEqual(B.elevNoteDue('Tess Teak'), false, 'no bag on this phone: no note');
    B.setBaseline('Rae Rowan', { mode: 'custom', ft: 900, picked: true });
    assert.strictEqual(B.elevNoteDue('Rae Rowan'), false, 'picks a choice before the note shows: no note');
    // 012-era record { mode: 'none', tempF } with no pick flag - the case that cannot be told apart: unchanged here (see report).
    const { B: B2 } = bagBox({ v: 1, golfers: { [k('Uma Umber')]: Object.assign({}, BAGSET, { alt: { mode: 'none', tempF: 65 } }) } });
    assert.strictEqual(B2.baseline('Uma Umber').mode, 'none');
    assert.strictEqual(B2.elevNoteDue('Uma Umber'), false);
});
test('070-3 Reset all keeps the elevation choice, the pick, the switch and the note-seen mark (only the clubs go)', () => {
    const { B } = bagBox({ v: 1, golfers: { [k('Val Vine')]: Object.assign({}, BAGSET), [k('Wes Willow')]: Object.assign({}, BAGSET) } });
    B.setBaseline('Val Vine', { mode: 'none', picked: true, tempF: 60 });
    B.setSuggestUsesElevation('Val Vine', false);
    B.resetAll('Val Vine');
    assert.deepStrictEqual(j(B.baseline('Val Vine')), { mode: 'none', name: '', ft: null, tempF: 60, chosen: true, picked: true });
    assert.strictEqual(B.suggestUsesElevation('Val Vine'), false);
    assert.deepStrictEqual(Object.keys(j(B.bag('Val Vine'))), []);
    B.elevNoteSeen('Wes Willow');
    B.resetAll('Wes Willow');
    B.set('Wes Willow', '7i', 158);
    assert.strictEqual(B.baseline('Wes Willow').mode, 'sea');
    assert.strictEqual(B.elevNoteDue('Wes Willow'), false, 'the note does not come back after Reset all');
});
test('070-3 the note in gps-view: Manny\'s words, OK closes it, only once the altitude is in the number, marked seen as it shows, never in tournament mode, placed left of the rail', () => {
    const v = read('gps-view.js');
    assert.ok(v.indexOf('Plays-like now adjusts for elevation (Sea level baseline). Change in Settings.') !== -1);
    assert.ok(/class="gps-elevnote gps-float" data-feature="bagAltitude"/.test(v), 'behind bagAltitude (switch off: removed)');
    const t = fnSrc(v, 'elevNoteTick');
    assert.ok(/tournament\(\)/.test(t) && /B\.elevNoteDue\(g\)/.test(t) && /typeof al\.altFt !== 'number'/.test(t) && /B\.elevNoteSeen\(g\);/.test(t));
    assert.ok(/ldClearBox\(\)/.test(fnSrc(v, 'elevNotePlace')), 'in the clear map: under the top bar, left of the rail, above the pill');
    assert.ok(/S\.el\.querySelector\('\.gps-under'\)/.test(fnSrc(v, 'elevNotePlace')) && /Math\.max\(top, ut\)/.test(fnSrc(v, 'elevNotePlace')), 'below the Customize bar / everything under Menu');
    assert.ok(/on\(el, '\.gps-elevnote-ok', function \(\) \{ elevNoteHide\(\); \}\);/.test(v));
});
