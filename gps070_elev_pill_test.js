// ============================================================================
// HARDPAN GPS - 070 PART 2: THE ELEVATION ON THE PLAYS-LIKE PILL AND IN THE (i) SHEET
//
// Display only (plan: claude-mailbox/outbox/064-5-REPORT.md, section 3). Manny: 1.5% per
// 1,000 ft; "Don't adjust" kept; tournament mode shows none of it; inside S.pro.
// gps-geo.js (pure) holds the words; gps-view.js is read as source for the wiring.
// tools/gps-elev-pill-shots.js takes the Chrome pictures from the built app.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i > 0, name); return src.slice(i, src.indexOf('\n    }\n', i)); };
const M = '−';
// The worked example at 1.5%, inline: f = 1 + 0.015 x 1,200 / 1,000 = 1.018; 151 / 1.018 = 148.33.
const F1200 = 1 + 0.015 * 1200 / 1000;
const PL148 = { yards: 148, exact: 151 / F1200, terms: { alt: 151 / F1200 - 151 } };

test('070-2 the maths at 1.5%: f(1,200 vs sea level) = 1.018; 151 plays 148 (148.3); the term is -2.7 (shows -3)', () => {
    assert.ok(Math.abs(F1200 - 1.018) < 1e-12);
    assert.ok(Math.abs(geo.altFactor(1200, 0) - 1.018) < 1e-12, 'altFactor(1200, 0)');
    assert.ok(Math.abs(geo.altFactor(1200, 2000) - (1 - 0.012)) < 1e-12, 'below the baseline: f < 1 (plays longer)');
    assert.strictEqual(geo.altFactor(1200, 1200), 1, 'the same height: no change');
    assert.strictEqual(Math.round(151 / geo.altFactor(1200, 0)), 148);
    assert.strictEqual(Math.round(151 / geo.altFactor(1200, 0) * 10) / 10, 148.3);
    assert.strictEqual(Math.round(geo.elevAltYd(null, 151, 1200, 0)), -3);
    assert.ok(geo.elevAltYd(null, 151, 1200, 2000) > 0, 'below the baseline: longer');
});

test('070-2 elevAltYd: playsLike\'s own altitude term when it is there (what moved the number), else D / f - D', () => {
    assert.strictEqual(geo.elevAltYd({ exact: 140, terms: { alt: -9 } }, 151, 1200, 0), -9);
    assert.ok(Math.abs(geo.elevAltYd({ exact: 151, terms: {} }, 151, 1200, 0) - (151 / 1.018 - 151)) < 1e-9);
    assert.strictEqual(geo.elevAltYd(null, 151, null, 0), null, 'no height');
    assert.strictEqual(geo.elevAltYd(null, 151, 1200, undefined), null, 'no baseline (Don\'t adjust)');
    assert.strictEqual(geo.elevAltYd(null, null, 1200, 0), null);
});

test('070-2 the pill\'s second line: "elev +1,200 ft"; the phone "elev ~+1,180 ft (phone)"; below the baseline "elev −800 ft"', () => {
    const at = (ft, baseFt, src, D) => geo.elevLine({ ft, baseFt, src, altYd: geo.elevAltYd(null, D == null ? 151 : D, ft, baseFt) });
    assert.strictEqual(at(1200, 0, 'usgs'), 'elev +1,200 ft');
    assert.strictEqual(at(1200, 0, 'course'), 'elev +1,200 ft');
    assert.strictEqual(at(1200, 0, 'tile'), 'elev +1,200 ft');
    assert.strictEqual(at(1183, 0, 'phone'), 'elev ~+1,180 ft (phone)', 'the phone: rounded to 10 ft, "~" and "(phone)"');
    assert.strictEqual(at(1200, 2000, 'usgs'), 'elev ' + M + '800 ft', 'below the baseline (a real minus sign)');
    assert.strictEqual(at(5280, 0, 'usgs'), 'elev +5,280 ft');
    assert.strictEqual(at(2400, 1200, 'usgs'), 'elev +1,200 ft', 'vs a 1,200 ft baseline: the difference');
    assert.strictEqual(at(1200, 0, null), 'elev +1,200 ft', 'source unknown: no "(phone)"');
});

test('070-2 the second line ONLY with a baseline set and an altitude term that rounds to 1 yd or more', () => {
    assert.strictEqual(geo.elevLine({ ft: 1200, baseFt: undefined, src: 'usgs', altYd: -3 }), '', 'Don\'t adjust: no baseline');
    assert.strictEqual(geo.elevLine({ ft: 1200, baseFt: null, src: 'usgs', altYd: -3 }), '', 'baseline with no height');
    assert.strictEqual(geo.elevLine({ ft: null, baseFt: 0, src: null, altYd: null }), '', 'no height here');
    assert.strictEqual(geo.elevLine({ ft: 1200, baseFt: 1200, src: 'usgs', altYd: 0 }), '', 'the same height');
    // 30 ft above sea level, a 151-yd shot: 151 / 1.00045 - 151 = -0.07 yd -> rounds to 0: no line.
    assert.strictEqual(geo.elevLine({ ft: 30, baseFt: 0, src: 'usgs', altYd: geo.elevAltYd(null, 151, 30, 0) }), '');
    assert.strictEqual(geo.elevLine({ ft: 400, baseFt: 0, src: 'usgs', altYd: -0.4 }), '', '0.4 yd rounds to 0');
    assert.strictEqual(geo.elevLine({ ft: 400, baseFt: 0, src: 'usgs', altYd: -0.6 }), 'elev +400 ft', '0.6 yd rounds to 1');
    assert.strictEqual(geo.elevLine({ ft: 400, baseFt: 0, src: 'usgs', altYd: 0.6 }), 'elev +400 ft');
    // 151 yds: the line starts at about 221 ft (151 x (1 - 1/f) >= 0.5 <=> f >= 1.00332).
    assert.strictEqual(geo.elevLine({ ft: 200, baseFt: 0, src: 'usgs', altYd: geo.elevAltYd(null, 151, 200, 0) }), '');
    assert.strictEqual(geo.elevLine({ ft: 240, baseFt: 0, src: 'usgs', altYd: geo.elevAltYd(null, 151, 240, 0) }), 'elev +240 ft');
    assert.strictEqual(geo.elevLine(null), '');
});

test('070-2 layouts C and old: ONE line "Plays like 148y · elev +1,200 ft"; no elevation = exactly as before', () => {
    assert.strictEqual(geo.playsTextElev(PL148, 'yd', 'elev +1,200 ft'), 'Plays like 148y · elev +1,200 ft');
    assert.strictEqual(geo.playsTextElev(PL148, 'yd', ''), geo.playsText(PL148, 'yd'));
    assert.strictEqual(geo.playsTextElev(PL148, 'yd', ''), 'Plays like 148y');
    assert.strictEqual(geo.playsTextElev(PL148, 'm', 'elev +1,200 ft'), 'Plays like ' + Math.round(PL148.exact * geo.M_PER_YD) + 'm · elev +1,200 ft', 'meters: the height stays in feet');
    assert.strictEqual(geo.playsTextElev(null, 'yd', 'elev +1,200 ft'), '', 'no plays-like: no line at all');
});

test('070-2 the (i) sheet "This shot": "Course elevation 1,200 ft vs your sea-level numbers: −3", then "Height source: ..."', () => {
    const rows = geo.playsInfoRows({ pl: PL148, yards: 151, alt: { ft: 1200, baseFt: 0, baseName: '', src: 'usgs' } });
    assert.deepStrictEqual(rows.slice(0, 3), ['This shot: 151 yds, plays like 148', 'Course elevation 1,200 ft vs your sea-level numbers: ' + M + '3', 'Height source: USGS']);
    const src = (s) => geo.playsInfoRows({ pl: PL148, yards: 151, alt: { ft: 1200, baseFt: 0, src: s } })[2];
    assert.strictEqual(src('course'), 'Height source: this course');
    assert.strictEqual(src('usgs'), 'Height source: USGS');
    assert.strictEqual(src('tile'), 'Height source: open terrain map');
    assert.strictEqual(src('phone'), 'Height source: your phone');
    assert.ok(!geo.playsInfoRows({ pl: PL148, yards: 151, alt: { ft: 1200, baseFt: 0, src: null } }).some((x) => /^Height source/.test(x)), 'source unknown: no source row');
    assert.strictEqual(geo.playsInfoRows({ pl: PL148, yards: 151, alt: { ft: 1183, baseFt: 0, src: 'phone' } })[1], 'Course elevation ~1,180 ft vs your sea-level numbers: ' + M + '3');
    const below = { exact: 151 / (1 - 0.012), terms: { alt: 151 / (1 - 0.012) - 151 } };
    assert.strictEqual(geo.playsInfoRows({ pl: below, yards: 151, alt: { ft: 1200, baseFt: 2000, baseName: '', src: 'tile' } })[1], 'Course elevation 1,200 ft vs your numbers at 2,000 ft: +2', 'a height with no name');
    assert.strictEqual(geo.playsInfoRows({ pl: below, yards: 151, alt: { ft: 1200, baseFt: 2000, baseName: 'Grayhawk', src: 'usgs' } })[1], 'Course elevation 1,200 ft vs your numbers at Grayhawk (2,000 ft): +2');
});

test('070-2 the (i) sheet with no height: "Elevation: not available here" (no source row); "Don\'t adjust": no elevation rows', () => {
    const rows = geo.playsInfoRows({ pl: geo.playsLike({ yards: 151, tempF: 60 }), yards: 151, alt: { ft: null, baseFt: 0, na: true, src: null } });
    assert.strictEqual(rows[1], 'Elevation: not available here');
    assert.ok(!rows.some((x) => /^Height source|^Course elevation|^Altitude/.test(x)));
    const none = geo.playsInfoRows({ pl: geo.playsLike({ yards: 151, tempF: 60 }), yards: 151 });
    assert.ok(!none.some((x) => /elevation|Elevation|Height source/.test(x)), 'no baseline: nothing about elevation');
});

test('070-2 gps-view: the pill\'s small second line, layouts C / old\'s one line, the (i) source - never in tournament mode', () => {
    if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) return;
    const v = read('gps-view.js');
    const en = fnSrc(v, 'elevLineNow');
    assert.ok(/if \(tournament\(\) \|\| !pl\) return '';/.test(en), 'tournament: no line');
    assert.ok(/var al = altNow\(r\), i = al && al\.info;/.test(en) && /if \(!i \|\| i\.na\) return '';/.test(en), 'Don\'t adjust / no height: no line');
    assert.ok(/if \(!altSwitch\(\) \|\| tournament\(\) \|\| !S\) return null;/.test(fnSrc(v, 'altNow')), 'altNow: null in tournament mode');
    assert.ok(/src: ce\.src \};/.test(fnSrc(v, 'altNow')) && /courseElevNow\(r\)/.test(fnSrc(v, 'altNow')), 'the (i) sheet gets the height\'s source (Part 1)');
    assert.ok(/if \(tournament\(\) \|\| !S\.pro/.test(fnSrc(v, 'ldPlays')) && /elev: elevLineNow\(r, pl,/.test(fnSrc(v, 'ldPlays')), 'the pill: S.pro only, never in tournament');
    assert.ok(/<b class="gps-ld-pltext"><\/b><small class="gps-ld-elev" style="display:none"><\/small>/.test(v), 'the pill keeps "Plays like" and the number; the elevation is a small line under them');
    assert.ok(/ev\.style\.display = p\.elev \? '' : 'none';/.test(v), 'no elevation: the line is hidden');
    assert.ok(/text = pl \? G\.playsTextElev\(pl, units\(\), elevLineNow\(r, pl,/.test(fnSrc(v, 'syncBreakdown')), 'layouts C and old: one line');
    assert.ok(/if \(tournament\(\) \|\| !S \|\| !S\.pro/.test(fnSrc(v, 'playsLineNow')) && /elev: elevLineNow\(r, pl,/.test(fnSrc(v, 'playsLineNow')));
    assert.ok(/small\.gps-ld-elev\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\}/.test(v), 'one line, never wraps into the rail');
    // Nothing taken away: the pill's words, the club, "yours", the (i).
    assert.ok(/<small>Plays like<\/small>/.test(v) && /txt\('\.gps-ld-pltext', p\.plays \+ \(p\.club \? ' · ' \+ p\.club : ''\)\);/.test(v) && /gps-ld-yours/.test(v) && /gps-ld-i/.test(v));
});
