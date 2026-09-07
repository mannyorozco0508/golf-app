#!/usr/bin/env node
// ============================================================================
// IS THERE A CUP MATCH SITTING IN A SESSION THAT DOES NOT EXIST?
//
// Until v65, the "+ Four-Ball" and "+ Singles" buttons filed every match they
// made under RYDER_DEFAULT_SESSION - 's1'. A Classic Cup's sessions are d1s1,
// d1s2, d2s1, d2s2 and d3s1, so a match added that way belonged to no session at
// all: it never appeared in a session badge, and computeRyderSessionResults never
// saw it, so it could never be scored or earn a point.
//
// v65 stops new ones being made. It cannot know about one already saved. This
// reads the real database and looks.
//
// IT ALSO REPORTS EMPTY PAIRINGS, which the save gate should always have refused
// ("fourball needs 2 per side, got 0 v 0"). If one is there anyway, the gate has a
// hole and that matters more than the orphan.
//
// READ ONLY. Every request is a GET. Nothing here writes, and nothing here can.
//
//   node tools/orphan-match-check.js ROUND1 ROUND2 ...     round codes
//   node tools/orphan-match-check.js --trip MYR1          every round in a trip
//   node tools/orphan-match-check.js --self-test          prove the detector works
//
// WHY --self-test EXISTS. A clean report from a detector that cannot detect
// anything is worse than no report: it is a false all-clear. The self-test runs
// the same findProblems() over fixtures that are known-bad and known-good, and
// refuses to pass unless it catches every bad one. Run it before believing a
// clean result - the real scan runs it first automatically and bails if it fails.
//
//   exit 0   nothing wrong found (and the detector proved itself first, and every
//            round asked about actually exists)
//   exit 1   something found - the JSON says which round, match and session
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const https = require('https');

const DB = 'https://golfapp-9fb21-default-rtdb.firebaseio.com';
const DEFAULT_SESSION = 's1';   // RYDER_DEFAULT_SESSION in ryder-cup.js

function bail(msg) {
    console.error('orphan-match-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

function getJson(path) {
    return new Promise((resolve, reject) => {
        const req = https.get(DB + path, { timeout: 20000 }, res => {
            let body = '';
            res.on('data', d => { body += d; });
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error(
                    'HTTP ' + res.statusCode + ' on ' + path + ' - ' + body.slice(0, 200)));
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('unreadable JSON from ' + path)); }
            });
        });
        req.on('timeout', () => { req.destroy(new Error('timed out on ' + path)); });
        req.on('error', reject);
    });
}

// THE DETECTOR. Pure, so the self-test can drive it without a network.
function findProblems(code, cup) {
    const out = [];
    if (!cup || typeof cup !== 'object') return out;
    const sessions = cup.sessions && typeof cup.sessions === 'object' ? cup.sessions : null;
    const known = sessions ? Object.keys(sessions) : null;
    const matches = cup.matches && typeof cup.matches === 'object' ? cup.matches : {};

    Object.keys(matches).forEach(mid => {
        const m = matches[mid] || {};
        const a = (m.playersA || []).length, b = (m.playersB || []).length;
        // A Cup with no schedule has exactly one session and everything is in it,
        // so nothing there can be orphaned. Only a scheduled Cup can strand a match.
        if (known) {
            const sid = m.sessionId || DEFAULT_SESSION;
            if (known.indexOf(sid) === -1) {
                out.push({ round: code, match: mid, kind: 'orphan-session',
                    sessionId: sid, knownSessions: known, format: m.format || null,
                    players: a + ' v ' + b,
                    detail: 'this match is filed under a session the schedule does not '
                          + 'contain, so it is invisible in every badge and never scored' });
            }
        }
        if (a === 0 || b === 0) {
            out.push({ round: code, match: mid, kind: 'empty-pairing',
                format: m.format || null, players: a + ' v ' + b,
                detail: 'an empty pairing was saved - the save gate should have refused it' });
        }
    });
    return out;
}

// ---------------------------------------------------------------------------
// PROVING THE DETECTOR BEFORE TRUSTING IT
const FIXTURES = [
    { name: 'a Classic Cup with a match stranded in s1', bad: true, cup: {
        sessions: { d1s1: {}, d1s2: {}, d2s1: {}, d2s2: {}, d3s1: {} },
        matches: { 'd1s1-m1': { sessionId: 'd1s1', format: 'foursomes',
                                playersA: ['101', '102'], playersB: ['103', '104'] },
                   m2: { sessionId: 's1', format: 'fourball',
                         playersA: ['101', '102'], playersB: ['103', '104'] } } } },
    { name: 'a match with NO sessionId at all, which defaults to s1', bad: true, cup: {
        sessions: { d1s1: {} },
        matches: { m1: { format: 'fourball', playersA: ['101'], playersB: ['103'] } } } },
    { name: 'a saved empty pairing', bad: true, cup: {
        sessions: { d1s1: {} },
        matches: { 'd1s1-m1': { sessionId: 'd1s1', format: 'fourball',
                                playersA: [], playersB: [] } } } },
    { name: 'a healthy Classic Cup', bad: false, cup: {
        sessions: { d1s1: {}, d1s2: {} },
        matches: { 'd1s1-m1': { sessionId: 'd1s1', format: 'foursomes',
                                playersA: ['101', '102'], playersB: ['103', '104'] },
                   'd1s2-m1': { sessionId: 'd1s2', format: 'fourball',
                                playersA: ['101', '102'], playersB: ['103', '104'] } } } },
    // A custom Cup has no schedule. Everything lives in the one default session,
    // so 's1' is correct there and must NOT be reported.
    { name: 'a custom Cup, where s1 is the only session there is', bad: false, cup: {
        matches: { m1: { sessionId: 's1', format: 'fourball',
                         playersA: ['101', '102'], playersB: ['103', '104'] } } } },
    { name: 'a round with no Cup on it', bad: false, cup: null }
];

function selfTest(verbose) {
    const failures = [];
    FIXTURES.forEach(f => {
        const found = findProblems('FIXTURE', f.cup).length > 0;
        if (found !== f.bad) {
            failures.push((f.bad ? 'MISSED: ' : 'FALSE ALARM: ') + f.name);
        }
        if (verbose) console.log('  ' + (found === f.bad ? 'ok  ' : 'FAIL') + '  ' + f.name);
    });
    return failures;
}

// ---------------------------------------------------------------------------
(async () => {
    const argv = process.argv.slice(2);

    if (argv[0] === '--self-test') {
        console.log('proving the detector against known-bad and known-good fixtures:');
        const f = selfTest(true);
        if (f.length) { f.forEach(x => console.error('  ' + x)); process.exit(1); }
        console.log('\nthe detector catches every bad fixture and no good one.');
        process.exit(0);
    }

    // The real scan proves the detector first. A clean report from a detector that
    // cannot detect is a false all-clear, which is worse than no report at all.
    const selfFailures = selfTest(false);
    if (selfFailures.length) {
        selfFailures.forEach(x => console.error('  ' + x));
        bail('the detector failed its own fixtures - a clean scan would mean nothing');
    }

    let codes = [];
    if (argv[0] === '--trip') {
        const trip = argv[1];
        if (!trip) bail('--trip needs a trip code');
        let rounds;
        try { rounds = await getJson('/trips/' + encodeURIComponent(trip) + '/rounds.json?shallow=true'); }
        catch (e) { bail(e.message); }
        if (!rounds) bail('trip "' + trip + '" has no rounds, or does not exist');
        codes = Object.keys(rounds);
        console.log('trip ' + trip + ' lists ' + codes.length + ' rounds: ' + codes.join(', ') + '\n');
    } else {
        codes = argv.filter(a => !a.startsWith('--'));
    }
    if (!codes.length) bail('give me round codes, or --trip <code>. '
        + 'The database rules allow reading one event at a time but not listing them, '
        + 'so the codes have to come from you.');

    const report = { scanned: [], problems: [] };
    const missing = [];
    for (const code of codes) {
        let cup, ref, top;
        try {
            // DOES THE ROUND EXIST AT ALL? Without this, a mistyped or long-deleted
            // code reads null for everything and reports CLEAN - a false all-clear,
            // which is the one thing this tool must never produce. Shallow, so it
            // costs one key list rather than the whole round.
            top = await getJson('/events/' + encodeURIComponent(code) + '.json?shallow=true');
            if (!top) { missing.push(code); continue; }
            cup = await getJson('/events/' + encodeURIComponent(code) + '/ryderCup.json');
            ref = await getJson('/events/' + encodeURIComponent(code) + '/ryderCupRef.json');
        } catch (e) { bail(e.message); }
        const sessions = cup && cup.sessions ? Object.keys(cup.sessions) : null;
        const matches = cup && cup.matches ? Object.keys(cup.matches).length : 0;
        report.scanned.push({ round: code, hasCup: !!cup,
            sessions: sessions ? sessions.length : 0, matches: matches,
            pointsAt: ref ? (ref.host + '/' + ref.sessionId) : null });
        findProblems(code, cup).forEach(p => report.problems.push(p));
    }

    // A code that is not there proves NOTHING about it, so this is exit 2 rather
    // than a clean bill of health for a round that was never read.
    if (missing.length) {
        console.log(JSON.stringify(report, null, 2));
        bail('no round exists at ' + missing.join(', ')
            + ' - mistyped, or the round was deleted. Nothing was checked for '
            + (missing.length === 1 ? 'that code.' : 'those codes.'));
    }

    report.verdict = report.problems.length ? 'FOUND' : 'CLEAN';
    console.log(JSON.stringify(report, null, 2));
    if (!report.problems.length) {
        console.log('\nNo stranded or empty matches in the rounds scanned. '
            + 'This says nothing about rounds whose codes were not given.');
    }
    process.exit(report.problems.length ? 1 : 0);
})();
