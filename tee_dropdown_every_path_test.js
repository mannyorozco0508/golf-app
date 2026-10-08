// ============================================================================
// A TEE DROPDOWN ON EVERY PATH TO PLAYERS (2026-10-08)
//
// MANNY, TestFlight build 17: NEW Game Day -> Caledonia -> paste a group ->
// NO Tee dropdown on the Players step. Build 16 fixed this for ONE path -
// loadModeData, which is how a SAVED round reopens - and the brief for it named
// that path. Every other way into Players still had the defect, because the fix
// was a `needsTees` check written inline in that one function instead of a rule.
//
// THE MECHANISM, and it is the same one in every path: appendTeeControl()
// returns early unless #tee-rating-select already holds two or more options.
// That select is filled by syncTeeRatingFromCourse() from the course record's
// rated tees. So "no Tee dropdown" always means "the round-level tee select was
// empty when the row was built", and there are exactly two ways to get there:
//
//   1. THE TEES WERE NEVER FETCHED. selectCourse() waits for a course record
//      only when courseCardInHand() says no, and that function answers a
//      question about the CARD - pars and stroke indexes. Every Myrtle course,
//      Caledonia included, is a bundled preset in course-data.js carrying 18
//      holes and NO TEES, so the card is "in hand", nothing is fetched, and the
//      shared record's 6 rated tee sets are never read.
//
//   2. THE ROWS WERE BUILT FIRST. The tees arrive one network read later than
//      the rows on every cold path. Nothing repaired the rows when the select
//      was finally filled, so whichever came second decided the outcome.
//
// AND TWO MORE, FOUND WHILE PROVING THE ABOVE AND NOT IN MANNY'S REPORT:
//
//   3. EVERY REBUILD LOST THE TEE. captureCurrentPlayerInputs() reads each
//      row's name, handicap, team, squad, money and flight and NOT its tee, so
//      a format switch, a deleted golfer or a paste put every golfer back on
//      the round's default tee. The save path reads the row, so this is a
//      silent change to what gets stored.
//
//   4. "Name 6 Blue" NEVER SET A TEE. roster-paste.js parses a trailing tee
//      name into player.teeName and has since 2026-10-05; previewPastedPlayers
//      passes roundTeeNames() to it, commitPastedPlayers does NOT, and NOTHING
//      in admin.html reads teeName at all. The feature was parsed and thrown
//      away at the last step - the suite's three paste tests all call the
//      PARSER, which is exactly the "tested the function, not the feature" trap
//      CLAUDE.md names.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. mini-dom runs the page's own scripts and
// its #player-list subtree answers querySelectorAll, so a row really is built
// by addPlayerRow and really is asked for its .p-tee-input. It has no layout and
// no network, and document-level querySelectorAll does not reach a static
// element's subtree - which is why the capture rule below is asserted on the
// shared helper and the SCREEN is measured elsewhere:
//   tools/tee-dropdown-paths-check.js   cold Chrome, every path, counts rows
//                                       against dropdowns
//   tools/sim-tee-paths.js              the native build in the iOS Simulator,
//                                       which is where Manny found it
//
// BASELINE, against main 8e98376 (admin.html sha 1ec62d30df8c28d7 and
// roster-paste.js sha bb26140a0fc747e7, both swapped in and restored by sha),
// all 13 tests: 5 PASS / 8 FAIL. 5 + 8 = 13.
//
// RE-MEASURED over the FINISHED file. The first measurement was taken at 11
// tests, before the iOS Simulator run added the two that matter most - the
// real compound tee names, and the ambiguous colour. Both are red on main.
//
// THE FIVE THAT PASS THERE, named rather than counted, because four of them are
// not evidence of anything:
//   1. the empty-select control. It SHOULD pass on main - it is the defect's own
//      mechanism, and it exists so the block around it cannot go green on a page
//      where rows get dropdowns for some other reason.
//   2. "a row built AFTER them has one too". True before this wave: a row built
//      with the select already full was always fine. It is the positive control
//      that stops the repair test below being satisfied by a page with no
//      dropdowns at all.
//   3. "pasted rows get a dropdown". WEAK, and said so: the test fills the tee
//      select before pasting, so it measures the paste path once the tees are in
//      hand. The real-world failure is the tees NOT being in hand, which is the
//      repair test.
//   4. "a golfer called Blue is still a golfer". A control over roster-paste.js,
//      which was already right.
//   5. "a rebuild puts a golfer back on the tee the capture handed over". Also
//      already right: appendPlayerFrom has read p.tee.teeKey since the
//      per-golfer-tee wave. The missing half was the CAPTURE, which never put a
//      tee in that shape - so this one passes on main and its partner, "the
//      captured row carries its tee", is red there. The pair is the finding.
//
// THE SIX REDS ARE THE WAVE: the shared predicate not existing at all, the two
// gates not asking it, the rows never being repaired when the tees land, the
// paste throwing its tee name away, and the capture dropping the tee.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const DEPS = ['course-data.js', 'player-tees.js', 'roster-paste.js', 'handicap.js',
              'handicap-labels.js'];
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// A COURSE SHAPED LIKE THE REAL ONES: a bundled preset carries a card and no
// tees, and the shared record carries the rated tees. That split IS the bug.
const TEES = { male: [{ name: 'Blue', slope: 130, rating: 71.2, parTotal: 72 },
                      { name: 'White', slope: 125, rating: 69.5, parTotal: 72 }],
               female: [{ name: 'Red', slope: 118, rating: 70.1, parTotal: 72 }] };

function page() {
    return loadHtmlInlineScript('admin.html', DEPS, { search: '?game=TEE001' });
}
// Rows, read the way the page reads them - scoped to the list, never positional.
function rowsIn(sb) {
    return vm.runInContext(`(function () {
        var list = document.getElementById('player-list');
        var rows = list ? list.querySelectorAll('.player-row') : [];
        var out = [];
        for (var i = 0; i < rows.length; i++) {
            var sel = rows[i].querySelector('.p-tee-input');
            out.push({ tee: !!sel, key: rows[i].getAttribute('data-tee-key') || '',
                       options: sel && sel.options ? sel.options.length : 0 });
        }
        return JSON.stringify(out);
    })()`, sb);
}

describe('1. THE TEES ARE FETCHED WHENEVER THEY ARE MISSING, WHATEVER THE CARD SAYS', () => {

    test('a course with a card and NO tees is not "in hand" for tee purposes', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            // Caledonia's shape exactly: a preset card, 18 holes, no tees.
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }] };
            var r = { cardSays: courseCardInHand('cald'),
                      teesSay: (typeof courseTeesInHand === 'function') ? courseTeesInHand('cald') : 'MISSING' };
            globalCourses['withtees'] = { name: 'Withtees', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                          tees: ${JSON.stringify(TEES)} };
            r.teesSayWhenPresent = (typeof courseTeesInHand === 'function') ? courseTeesInHand('withtees') : 'MISSING';
            return JSON.stringify(r);
        })()`, sb));
        assert.notEqual(got.teesSay, 'MISSING',
            'there is no courseTeesInHand() - the tee need is still written inline in one function, '
            + 'which is how four of the five paths into Players kept the defect');
        assert.equal(got.cardSays, true, 'the fixture is wrong: a preset card should read as in hand');
        assert.equal(got.teesSay, false,
            'a course with a card and no rated tees reports its tees as in hand, so nothing will ever fetch them');
        // AND NOT A FUNCTION THAT SIMPLY SAYS NO: the positive side has to work,
        // or every selection would wait on a read that adds nothing.
        assert.equal(got.teesSayWhenPresent, true,
            'a course that HAS rated tees still reports them missing - every pick would now wait on a pointless read');
    });

    test('selectCourse waits for the record when the tees are missing', () => {
        // SOURCE, because the wait is a network read mini-dom has no answer for.
        // The claim is narrow and checkable: the gate that decides whether to
        // wait must consider the tees, not only the card.
        const src = read('admin.html');
        const at = src.indexOf('function selectCourse');
        assert.ok(at !== -1, 'selectCourse is gone');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 100, 'the selectCourse slice collapsed: ' + fn.length + ' chars');
        // POSITIVE FIRST, so a collapsed slice cannot satisfy the rest.
        assert.match(fn, /ensureCourseCard\(id\)/, 'selectCourse no longer fetches a card at all');
        assert.match(fn, /courseTeesInHand\(|courseFullyInHand\(/,
            'selectCourse still gates on the CARD alone, so picking Caledonia on a new round '
            + 'never reads the 6 rated tees the shared record holds');
    });

    test('and loadModeData asks the same question through the same helper', () => {
        // TWO ENTRY POINTS MEANS ONE BUILDER. Build 16 wrote this check inline
        // here; a second inline copy in selectCourse would be the defect that
        // CLAUDE.md's Nassau note is about, one wave later.
        const src = read('admin.html');
        const at = src.indexOf('function loadModeData');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(/activeCourseKey/.test(fn), 'the loadModeData slice collapsed');
        assert.match(fn, /courseTeesInHand\(|courseFullyInHand\(/,
            'loadModeData still carries its own inline copy of the tee test');
    });
});

describe('2. A ROW BUILT BEFORE THE TEES ARRIVE GETS ITS DROPDOWN WHEN THEY DO', () => {

    test('CONTROL: with the select empty, a row gets no dropdown - the defect itself', () => {
        const sb = page();
        vm.runInContext("addPlayerRow('Early', '8');", sb);
        const rows = JSON.parse(rowsIn(sb));
        assert.equal(rows.length, 1, 'the row was not built at all');
        assert.equal(rows[0].tee, false,
            'this control is inert: a row built with an empty tee select already has a dropdown, '
            + 'so the rest of this block proves nothing');
    });

    test('THE ROWS ARE REPAIRED when the course record finally arrives', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            // THE COLD ORDER, which is the order every path actually runs in:
            // rows first, tees one network read later.
            addPlayerRow('Early', '8');
            addPlayerRow('Also Early', '12');
            var before = document.getElementById('player-list').querySelectorAll('.p-tee-input').length;
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            // The page's OWN populate step, the one handleCourseChange calls.
            syncTeeRatingFromCourse('cald', { keepSelection: true });
            var after = document.getElementById('player-list').querySelectorAll('.p-tee-input').length;
            return JSON.stringify({ before: before, after: after,
                selOptions: document.getElementById('tee-rating-select').options.length });
        })()`, sb));
        assert.equal(got.before, 0, 'the fixture is wrong: the rows already had dropdowns');
        assert.equal(got.selOptions, 3, 'the round-level select did not fill: ' + got.selOptions);
        assert.equal(got.after, 2,
            'filling the tee select left ' + got.after + ' of 2 existing rows without a dropdown - '
            + 'whichever of the rows and the tees arrives second still decides the outcome');
    });

    test('and a row built AFTER them has one too - the positive control', () => {
        const sb = page();
        const rows = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            syncTeeRatingFromCourse('cald', {});
            addPlayerRow('Late', '8');
            var list = document.getElementById('player-list');
            var rows = list.querySelectorAll('.player-row');
            var out = [];
            for (var i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('.p-tee-input');
                out.push({ tee: !!sel, options: sel && sel.options ? sel.options.length : 0 });
            }
            return JSON.stringify(out);
        })()`, sb));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].tee, true, 'a row built with the tees in hand has no dropdown');
        assert.equal(rows[0].options, 3, 'the row dropdown does not offer all three tees');
    });
});

describe('3. A PASTED ROSTER GETS TEES, AND "Name 6 Blue" SETS ONE', () => {

    test('pasted rows get a dropdown', () => {
        const sb = page();
        const rows = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            syncTeeRatingFromCourse('cald', {});
            document.getElementById('paste-players-textarea').value = 'Zack Carrano 6\\nTim Bell 11';
            commitPastedPlayers();
            var list = document.getElementById('player-list');
            var rows = list.querySelectorAll('.player-row');
            var out = [];
            for (var i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('.p-tee-input');
                out.push({ tee: !!sel, key: rows[i].getAttribute('data-tee-key') || '' });
            }
            return JSON.stringify(out);
        })()`, sb));
        assert.ok(rows.length >= 2, 'the paste added no rows: ' + JSON.stringify(rows));
        const without = rows.filter(r => !r.tee).length;
        assert.equal(without, 0, without + ' of ' + rows.length + ' pasted rows have no Tee dropdown');
    });

    test('"Zack Carrano 6 blue" puts Zack on the BLUE tee', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            syncTeeRatingFromCourse('cald', {});
            // male:0 Blue, male:1 White, female:0 Red - so a correct read of
            // "blue" is male:0 and a default would be whatever fillTeeSelect chose.
            document.getElementById('paste-players-textarea').value =
                'Zack Carrano 6 blue\\nTim Bell 11 white';
            commitPastedPlayers();
            var list = document.getElementById('player-list');
            var rows = list.querySelectorAll('.player-row');
            var out = [];
            for (var i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('.p-tee-input');
                out.push({ key: rows[i].getAttribute('data-tee-key') || '',
                           val: sel ? String(sel.value || '') : null });
            }
            return JSON.stringify({ rows: out, names: roundTeeNames() });
        })()`, sb));
        assert.deepEqual(got.names, ['Blue', 'White', 'Red'], 'the fixture tee names moved: ' + JSON.stringify(got.names));
        assert.ok(got.rows.length >= 2, 'the paste added no rows');
        assert.equal(got.rows[0].key, 'male:0',
            'the tee name in the paste was thrown away - Zack is on "' + got.rows[0].key + '" and not Blue');
        assert.equal(got.rows[1].key, 'male:1',
            'Tim is on "' + got.rows[1].key + '" and not White');
    });

    // ------------------------------------------------------------------------
    // THE REAL TEE NAMES, WHICH ARE NOT COLOURS.
    //
    // The fixture above invents tees called Blue and White, so a paste saying
    // "blue" matched and the check agreed with itself. Caledonia's six rated
    // sets are "Pintail Black", "Pintail Blue", "Pintail White"... - measured on
    // the live record 2026-10-08 - and against THOSE the feature did nothing:
    // the tee stayed in the golfer's name and everybody took the default. Found
    // on the iOS Simulator against the real database, which is the only place
    // this was visible.
    // ------------------------------------------------------------------------
    const REAL = { male: [{ name: 'Pintail Black', slope: 140, rating: 73.6, parTotal: 72 },
                          { name: 'Pintail Blue', slope: 133, rating: 71.8, parTotal: 72 },
                          { name: 'Pintail White', slope: 126, rating: 69.9, parTotal: 72 }],
                   female: [{ name: 'Pintail Green', slope: 120, rating: 70.4, parTotal: 72 }] };

    test('"Zack 6 blue" finds PINTAIL BLUE, because that is what the tee is called', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(REAL)} };
            syncTeeRatingFromCourse('cald', {});
            document.getElementById('paste-players-textarea').value =
                'Zack Carrano 6 blue\\nTim Bell 11 Pintail White';
            commitPastedPlayers();
            var list = document.getElementById('player-list');
            var rows = list.querySelectorAll('.player-row');
            var out = [];
            for (var i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('.p-tee-input');
                // BY KEY, then the option that carries it. mini-dom has no
                // selectedIndex, so reading "what is showing" that way is null
                // on every row and would make this test unfailable.
                var key = rows[i].getAttribute('data-tee-key') || '';
                var label = '';
                if (sel && sel.options) {
                    for (var k = 0; k < sel.options.length; k++) {
                        if (sel.options[k].value === key) label = String(sel.options[k].textContent || '');
                    }
                }
                out.push({ key: key, shown: label });
            }
            return JSON.stringify({ rows: out, names: roundTeeNames() });
        })()`, sb));
        assert.ok(got.names.indexOf('Pintail Blue') !== -1, 'the full tee name is gone: ' + JSON.stringify(got.names));
        assert.ok(got.names.indexOf('Blue') !== -1,
            'the colour on its own is not offered to the parser, so a tee sheet written '
            + '"Zack Carrano 6 blue" cannot work: ' + JSON.stringify(got.names));
        assert.equal(got.rows.length, 2, 'the paste did not come through');
        assert.match(got.rows[0].shown || '', /Pintail Blue/,
            'the colour did not reach the right tee - Zack is on "' + got.rows[0].shown + '"');
        // AND THE FULL NAME STILL WORKS, so the alias did not replace it.
        assert.match(got.rows[1].shown || '', /Pintail White/,
            'writing the tee out in full stopped working: "' + got.rows[1].shown + '"');
    });

    test('an AMBIGUOUS colour stays part of the name, rather than guessing a tee', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            // Two tees ending in Blue: "blue" now names neither.
            globalCourses['two'] = { name: 'Twotone', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                tees: { male: [{ name: 'Pintail Blue', slope: 133, rating: 71.8, parTotal: 72 },
                               { name: 'Heron Blue', slope: 128, rating: 70.4, parTotal: 72 }] } };
            syncTeeRatingFromCourse('two', {});
            return JSON.stringify({ names: roundTeeNames(),
                key: typeof teeKeyForTeeName === 'function' ? teeKeyForTeeName('blue') : 'MISSING',
                exact: typeof teeKeyForTeeName === 'function' ? teeKeyForTeeName('Heron Blue') : 'MISSING' });
        })()`, sb));
        assert.equal(got.names.indexOf('Blue'), -1,
            'an ambiguous colour is still offered, so a paste would be given one of two tees at random: '
            + JSON.stringify(got.names));
        assert.equal(got.key, '', 'an ambiguous colour resolved to a tee anyway: ' + got.key);
        assert.equal(got.exact, 'male:1', 'the full name stopped resolving: ' + got.exact);
    });

    test('and a golfer called Blue is still a golfer - the control that keeps this honest', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            syncTeeRatingFromCourse('cald', {});
            document.getElementById('paste-players-textarea').value = 'Mary Blue 14';
            commitPastedPlayers();
            var list = document.getElementById('player-list');
            var row = list.querySelectorAll('.player-row')[0];
            return JSON.stringify({ rows: list.querySelectorAll('.player-row').length,
                                    key: row ? (row.getAttribute('data-tee-key') || '') : null });
        })()`, sb));
        assert.equal(got.rows, 1, 'Mary Blue did not come through as one golfer');
        // Her name is not a tee instruction: a bare space before a tee name is
        // not enough, which roster-paste.js already decided and this pins at the
        // call site rather than in the parser.
        assert.notEqual(got.key, '',
            'Mary has no tee at all - the default should still apply to her');
    });
});

describe('4. A REBUILD KEEPS EVERY GOLFER ON THEIR OWN TEE', () => {

    test('the captured row carries its tee, so a rebuild can put it back', () => {
        // THE SHARED HELPER, because captureCurrentPlayerInputs reads
        // document.querySelectorAll('.player-row') and mini-dom's document-level
        // query does not reach a static element's subtree. The SCREEN check
        // drives a real format switch in Chrome; this pins the shape the
        // rebuild needs, which is what appendPlayerFrom reads back.
        const src = read('admin.html');
        const at = src.indexOf('function captureCurrentPlayerInputs');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /playerIdOfRow\(row\)/, 'the captureCurrentPlayerInputs slice collapsed');
        assert.match(fn, /rowTeeRating\(row\)|p-tee-input/,
            'captureCurrentPlayerInputs still does not read the row’s tee, so every format switch, '
            + 'deleted golfer and paste puts the whole roster back on the round’s default tee');
        // AND IT MUST BE THE SHAPE appendPlayerFrom READS: p.tee.teeKey.
        assert.match(fn, /tee: *\{|entry\.tee *=/,
            'the captured tee is not in the { tee: { teeKey } } shape appendPlayerFrom reads back');
    });

    // ------------------------------------------------------------------------
    // THE RESTORE HALF, which mini-dom can run, and ONLY that half.
    //
    // captureCurrentPlayerInputs reads document.querySelectorAll('.player-row')
    // and mini-dom's document-level query does not reach the subtree of a static
    // element, so the capture returns zero rows here on a page that has them.
    // Measured, not assumed: #player-list.querySelectorAll finds the row and
    // document.querySelectorAll does not. Teaching the harness to answer that
    // query would be asserting the mock, so the capture is driven for real in
    // tools/tee-dropdown-paths-check.js, which switches the format in Chrome and
    // reads the tee back off the rebuilt row.
    // ------------------------------------------------------------------------
    test('a rebuild puts a golfer back on the tee the capture handed over', () => {
        const sb = page();
        const got = JSON.parse(vm.runInContext(`(function () {
            globalCourses['cald'] = { name: 'Caledonia', data: [{ hole: 1, par: 4, hcpIndex: 1 }],
                                      tees: ${JSON.stringify(TEES)} };
            syncTeeRatingFromCourse('cald', {});
            // THE SHAPE THE CAPTURE PRODUCES, handed to the function the rebuild
            // uses. female:0 is the women's red - never the default, which is
            // male:0, so a dropped tee is visible rather than coincidental.
            appendPlayerFrom({ name: 'Zack', hcp: '6', tee: { teeKey: 'female:0' } }, false, 1);
            appendPlayerFrom({ name: 'Tim', hcp: '11' }, false, 2);
            var rows = document.getElementById('player-list').querySelectorAll('.player-row');
            var out = [];
            for (var i = 0; i < rows.length; i++) {
                var sel = rows[i].querySelector('.p-tee-input');
                out.push({ key: rows[i].getAttribute('data-tee-key') || '',
                           val: sel ? String(sel.value || '') : null });
            }
            return JSON.stringify(out);
        })()`, sb));
        assert.equal(got.length, 2, 'the rows were not rebuilt');
        assert.equal(got[0].key, 'female:0',
            'the rebuild put Zack on "' + got[0].key + '" instead of the red tee the capture carried');
        assert.equal(got[0].val, 'female:0', 'the dropdown does not show the tee the row claims');
        // AND THE DEFAULT STILL APPLIES to a golfer who never chose one, or this
        // would pass on a page that simply ignored the default.
        assert.equal(got[1].key, 'male:0',
            'a golfer with no tee of their own got "' + got[1].key + '" instead of the round default');
    });

});
