// ============================================================================
// THE NATIVE BUNDLE IS THE REPO, BYTE FOR BYTE - OR THIS GOES RED.
//
// TWICE NOW A FIX HAS BEEN COMMITTED, TESTED, PUSHED AND GREEN WHILE THE PHONE
// RAN THE OLD CODE.
//
//   Build 8 shipped web v71 while main was on v72.
//   Builds 14, 15, 16 AND 17 shipped the build-13 bundle. Build 17 was still
//   running the three-copy save-button restore - one alert, then a dead Save &
//   Start Round button - months of green suite behind it. The organizer had to
//   wipe the round and start over.
//
// HANDOFF.md documented the first one, in a paragraph that is accurate and did
// not prevent the second, because the failure is an OMITTED COMMAND and prose
// does not fail. This file exists so it fails.
//
// WHY SHAPE IS NOT ENOUGH. native_packaging_test.js already pins the bundle: that
// FILES_TO_SYNC is SHARED+CONSUMER, that no Tournament page leaks in, that webDir
// agrees with where the sync script writes. Every one of those assertions was TRUE
// of a bundle a day and a half stale, and stayed green through all four bad
// builds. Shape describes which files should be there. Only CONTENT can say
// whether they are the ones the repo holds.
//
// WHAT MAKES A STALE BUNDLE INVISIBLE, and why none of it can be relied on:
//   - www/ and ios/App/App/public/ are BOTH gitignored, so `git status` is clean
//     while the bundle is a day behind. The signal is identical either way.
//   - the Xcode project has ZERO shell-script build phases, so an archive cannot
//     fail on it.
//   - `npm run mobile:sync` is a separate manual command; `npm test` never called
//     anything that touched the bundle until this file.
//
// THE TWO-STEP CHAIN, AND WHICH STEP WAS MISSED. The bundle is built in two
// hops, and they fail independently:
//
//     repo root  --node sync-mobile-web.js-->  www/app  --npx cap sync ios-->  ios/App/App/public
//                                                       --npx cap sync android-->  android/app/src/main/assets/public
//
// ios/App/App/public is the file on the phone, so it is the one that decides the
// verdict. www/app is compared too, purely so a failure can NAME which hop was
// skipped instead of leaving that to be guessed.
//
// THE ANDROID BUNDLE IS A TWIN, NOT A COUSIN. `npx cap sync android` copies the
// same www/app into android/app/src/main/assets/public, and it is skipped by the
// same omitted command. Both directories are gitignored, so both are invisible
// to git status in exactly the same way. The second block below holds the
// Android copy to the same three verdicts - absent SKIPS, missing FAILS,
// differing FAILS - and adds one the iOS block states only by construction:
// that no Tournament-only file is inside the golfer's app.
//
// A MISSING BUNDLE IS NOT A STALE BUNDLE, and they must not share a verdict.
// Both directories are gitignored, so a fresh clone has neither, and failing there
// would make the suite red for everyone who has never built the app - which is the
// fastest way to teach people to ignore a red test. So:
//
//     directory absent entirely  -> SKIP, with the reason printed. Nothing can be
//                                   shipped from a bundle that does not exist.
//     directory present, a declared file missing -> FAIL. That is a broken or
//                                   half-finished sync, not a fresh clone.
//     directory present, content differs -> FAIL, naming every file.
//
// THE FILE LIST IS DERIVED, NOT TYPED. It comes from sync-mobile-web.js's own
// SHARED_SHELL and CONSUMER_SHELL declarations - the same source
// native_packaging_test.js and deployment_build_test.js read - so adding a file to
// the bundle extends this check with no edit here. A hand-written list is a second
// place to forget something, which is the failure being fixed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const SYNC_SCRIPT = 'sync-mobile-web.js';
const NATIVE = path.join(REPO_ROOT, 'ios', 'App', 'App', 'public');
const ANDROID = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'public');
const WEBDIR = path.join(REPO_ROOT, 'www', 'app');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const declared = name => {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(read(SYNC_SCRIPT));
    assert.ok(m, name + ' must be declared in ' + SYNC_SCRIPT);
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
// FILES_TO_SYNC is literally SHARED_SHELL.concat(CONSUMER_SHELL) in the script.
const FILES = declared('SHARED_SHELL').concat(declared('CONSUMER_SHELL'));
// The other product. Nothing in this list may be inside the golfer's app.
const TOURNAMENT_ONLY = declared('TOURNAMENT_SHELL').filter(f => !FILES.includes(f));

// CAPACITOR'S OWN SHIMS. `npx cap sync` writes these into the bundle; they have no
// repo twin and never will, so they are not drift. Anything else undeclared IS.
const CAPACITOR_OWN = ['cordova.js', 'cordova_plugins.js', 'capacitor.config.json'];

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const RESYNC = 'node sync-mobile-web.js && npx cap sync ios';

// Present means "the directory exists AND has files in it". An empty directory is
// not a fresh clone - something got half-deleted - so it is not allowed to skip.
const state = dir => {
    if (!fs.existsSync(dir)) return { present: false, entries: [] };
    const entries = fs.readdirSync(dir).sort();
    return { present: entries.length > 0, entries };
};
const NAT = state(NATIVE);
const AND = state(ANDROID);
const WEB = state(WEBDIR);

const ABSENT_REASON = 'ios/App/App/public/ does not exist - this tree has never run '
    + '`' + RESYNC + '`. That is a fresh clone, not a stale bundle: nothing can be '
    + 'archived from a bundle that is not there. Run the sync before building, and '
    + 'this check starts comparing content.';

// Compares one directory against the repo root and returns every disagreement.
// Returns lists rather than asserting, so one pass can report ALL of them - a
// failure naming one file out of nine sends somebody to fix one file.
function compare(dir) {
    const missing = [], differing = [];
    FILES.forEach(f => {
        const shipped = path.join(dir, f);
        if (!fs.existsSync(shipped)) { missing.push(f); return; }
        if (sha(shipped) !== sha(path.join(REPO_ROOT, f))) differing.push(f);
    });
    return { missing, differing };
}

// WHICH HOP WAS SKIPPED, DERIVED FROM BOTH DIRECTORIES.
//
// THE FIRST VERSION OF THIS LIED. It read `web.differing.length > 0 ? 'BOTH hops
// are stale' : ...` from inside a test that only runs when www/app differs - so
// the condition was true every time the sentence printed, the other branch was
// unreachable, and a control that made www/app stale while the native bundle was
// CURRENT was told both hops had failed. Confidently wrong, in the one sentence
// whose whole job is to say what to do next.
//
// It is computed from the two comparisons now, and every branch below is exercised
// by a control. A diagnosis that can only ever print one string is not a diagnosis.
function diagnose(nat, web) {
    const natBad = nat.differing.length + nat.missing.length > 0;
    const webBad = web.differing.length + web.missing.length > 0;
    if (natBad && !webBad) {
        return 'www/app is current, so `node sync-mobile-web.js` ran. '
             + '`npx cap sync ios` is the step that was skipped.';
    }
    if (natBad && webBad) {
        return 'BOTH hops are stale: neither `node sync-mobile-web.js` nor '
             + '`npx cap sync ios` has run since the repo changed.';
    }
    if (!natBad && webBad) {
        return 'The native bundle matches the repo but www/app does not, which the '
             + 'two commands run in order cannot produce. www/app was edited by hand, '
             + 'or a sync was interrupted between the hops.';
    }
    return 'Both hops are current.';
}

// ---------------------------------------------------------------------------
describe('THE NATIVE BUNDLE MATCHES THE REPO', () => {

    // POSITIVE ASSERTION FIRST. Every check below is "nothing differs", and
    // nothing differs is trivially true of an empty list. If the declared lists
    // ever parse to nothing, this file would guard nothing while reporting PASS -
    // the exact shape of inert guard this repo keeps finding.
    test('there is a bundle list to check at all', () => {
        assert.ok(FILES.length >= 20,
            'SHARED_SHELL + CONSUMER_SHELL parsed to ' + FILES.length + ' files; the '
            + 'comparison below would be vacuous. Did the declaration format change?');
        assert.ok(FILES.includes('admin.html') && FILES.includes('index.html')
            && FILES.includes('sw.js'),
            'the pages a golfer actually uses must be in the compared set');
    });

    test('ios/App/App/public carries every file the sync script declares',
        { skip: NAT.present ? false : ABSENT_REASON }, () => {
        const { missing } = compare(NATIVE);
        assert.deepEqual(missing, [],
            'the bundle EXISTS but is missing ' + missing.length + ' declared file(s): '
            + missing.join(', ') + '\nThat is a broken or half-finished sync, not a '
            + 'fresh clone. Run: ' + RESYNC);
    });

    // THE ONE THAT WOULD HAVE CAUGHT BUILDS 14 THROUGH 17.
    test('every shipped file is byte-identical to its repo twin',
        { skip: NAT.present ? false : ABSENT_REASON }, () => {
        const { differing } = compare(NATIVE);
        const detail = differing.map(f => {
            const a = sha(path.join(REPO_ROOT, f)).slice(0, 12);
            const b = sha(path.join(NATIVE, f)).slice(0, 12);
            return '    ' + f + '\n      repo   ' + a + '\n      bundle ' + b;
        }).join('\n');
        const web = WEB.present ? compare(WEBDIR) : { differing: [], missing: [] };
        assert.deepEqual(differing, [],
            '\nTHE BUNDLE ON THE PHONE IS NOT THE REPO. ' + differing.length
            + ' file(s) differ:\n' + detail
            + '\n\n  ' + (WEB.present ? diagnose({ differing, missing: [] }, web)
                                        : 'www/app is absent, so which hop failed cannot be said.')
            + '\n\n  Fix: ' + RESYNC
            + '\n  Then bump Build in Xcode, Archive, Distribute.'
            + '\n  A commit is not a release - the bundle is copied by hand, and'
            + '\n  nothing else in this repo can tell you it was not.');
    });

    // THE FIRST HOP, CHECKED ON ITS OWN.
    //
    // This one fires only when www/app itself is wrong. The commonest real failure -
    // www/app current, native bundle stale, which is builds 14 through 17 - leaves
    // THIS test green and is reported by the byte-identical test above; both carry
    // the same diagnose() sentence, so whichever goes red names the hop.
    //
    // Its own value is the case the other cannot see: www/app wrong at all, which
    // means either the sync script did not run or somebody edited generated output.
    test('www/app agrees too, so a failure names the step that was skipped',
        { skip: WEB.present ? false : 'www/app/ does not exist - same fresh-clone case as above.' }, () => {
        const web = compare(WEBDIR);
        const nat = NAT.present ? compare(NATIVE) : { differing: [], missing: [] };
        const hint = diagnose(nat, web);
        assert.deepEqual(web.differing.concat(web.missing), [],
            '\nwww/app does not match the repo (' + web.differing.length + ' differing, '
            + web.missing.length + ' missing).\n  ' + hint
            + '\n  native bundle differing: ' + nat.differing.length
            + '\n  Fix: ' + RESYNC);
    });

    // THE HUMAN TELL, PINNED. HANDOFF.md already names the service worker's cache
    // key as the fastest way to read what a build contains. It said v81 while four
    // builds shipped, so the sentence was right and nothing acted on it. This makes
    // it act.
    test('the shipped service worker carries the repo CACHE_VERSION',
        { skip: NAT.present ? false : ABSENT_REASON }, () => {
        const ver = s => (/CACHE_VERSION = '([^']+)'/.exec(s) || [])[1];
        const repo = ver(read('sw.js'));
        const shipped = ver(fs.readFileSync(path.join(NATIVE, 'sw.js'), 'utf8'));
        assert.ok(repo, 'sw.js at the repo root declares no CACHE_VERSION');
        assert.ok(shipped, 'the shipped sw.js declares no CACHE_VERSION');
        assert.equal(shipped, repo,
            '\nthe build would ship ' + shipped + ' while the repo is on ' + repo
            + '.\n  This is the tell HANDOFF.md names: read the CACHE_VERSION in'
            + '\n  ios/App/App/public/sw.js to know what a build actually contains.'
            + '\n  Fix: ' + RESYNC);
    });

    // A bundle carrying something the repo no longer ships is drift in the other
    // direction. cap sync clears the destination, so an extra file means the bundle
    // was edited by hand or a sync was interrupted.
    test('the bundle carries nothing the repo does not ship',
        { skip: NAT.present ? false : ABSENT_REASON }, () => {
        const extra = NAT.entries.filter(f => !FILES.includes(f) && !CAPACITOR_OWN.includes(f));
        assert.deepEqual(extra, [],
            'the bundle contains ' + extra.length + ' file(s) that are neither declared '
            + 'in ' + SYNC_SCRIPT + ' nor written by Capacitor: ' + extra.join(', ')
            + '\nA hand-edited bundle is exactly what this file exists to refuse. '
            + 'Run: ' + RESYNC);
    });

    // NOT PROVABLE HERE, said plainly rather than implied by silence: this compares
    // the bundle ON DISK to the repo ON DISK. It cannot know what was inside the
    // .ipa that TestFlight actually distributed - only that the next archive taken
    // from this tree will carry the current code. An archive taken, then a sync run,
    // then this test passing, still ships the old build.
    test('this file states what it cannot prove', () => {
        const src = fs.readFileSync(__filename, 'utf8');
        assert.match(src, /cannot know what was inside the/,
            'the limit of this check must stay written down in it');
    });
});

// ---------------------------------------------------------------------------
// THE ANDROID BUNDLE. Same source, same list, same three verdicts. Written as its
// own block rather than a loop over the two platforms so that a failure names
// the platform and the command in plain words, and so the iOS block above is
// byte-for-byte what it was.
// ---------------------------------------------------------------------------
const RESYNC_ANDROID = 'node sync-mobile-web.js && npx cap sync android';
const ANDROID_REL = 'android/app/src/main/assets/public/';
const ANDROID_ABSENT = ANDROID_REL + ' does not exist - this tree has never run '
    + '`' + RESYNC_ANDROID + '`. That is a fresh clone, not a stale bundle: nothing can '
    + 'be built from a bundle that is not there. Run the sync before building, and '
    + 'this check starts comparing content.';
// Capacitor writes the Cordova shims into the Android bundle too. Its config
// JSON goes one level up, into assets/, so it is not an entry here.
const CAPACITOR_OWN_ANDROID = ['cordova.js', 'cordova_plugins.js', 'capacitor.config.json'];

describe('THE ANDROID BUNDLE MATCHES THE REPO', () => {

    // POSITIVE FIRST, for the assertion below that is otherwise "none of these is
    // present": if the Tournament list parses to nothing, that check is vacuous.
    test('there is a Tournament-only list to refuse', () => {
        assert.ok(TOURNAMENT_ONLY.length >= 3,
            'TOURNAMENT_SHELL minus the Consumer bundle parsed to ' + TOURNAMENT_ONLY.length
            + ' files; the leak check below would guard nothing.');
        assert.ok(TOURNAMENT_ONLY.includes('tournament.html'),
            'the organizer console must be in the refused set');
    });

    test(ANDROID_REL + ' carries every file the sync script declares',
        { skip: AND.present ? false : ANDROID_ABSENT }, () => {
        const { missing } = compare(ANDROID);
        assert.deepEqual(missing, [],
            'the Android bundle EXISTS but is missing ' + missing.length + ' declared file(s): '
            + missing.join(', ') + '\nThat is a broken or half-finished sync, not a '
            + 'fresh clone. Run: ' + RESYNC_ANDROID);
    });

    test('every file shipped to Android is byte-identical to its repo twin',
        { skip: AND.present ? false : ANDROID_ABSENT }, () => {
        const { differing } = compare(ANDROID);
        const detail = differing.map(f => {
            const a = sha(path.join(REPO_ROOT, f)).slice(0, 12);
            const b = sha(path.join(ANDROID, f)).slice(0, 12);
            return '    ' + f + '\n      repo    ' + a + '\n      android ' + b;
        }).join('\n');
        const web = WEB.present ? compare(WEBDIR) : { differing: [], missing: [] };
        assert.deepEqual(differing, [],
            '\nTHE BUNDLE IN THE ANDROID PROJECT IS NOT THE REPO. ' + differing.length
            + ' file(s) differ:\n' + detail
            + '\n\n  ' + (WEB.present
                ? diagnose({ differing, missing: [] }, web).replace(/cap sync ios/g, 'cap sync android')
                : 'www/app is absent, so which hop failed cannot be said.')
            + '\n\n  Fix: ' + RESYNC_ANDROID
            + '\n  A commit is not a release - the bundle is copied by hand, and'
            + '\n  nothing else in this repo can tell you it was not.');
    });

    test('the service worker shipped to Android carries the repo CACHE_VERSION',
        { skip: AND.present ? false : ANDROID_ABSENT }, () => {
        const ver = s => (/CACHE_VERSION = '([^']+)'/.exec(s) || [])[1];
        const repo = ver(read('sw.js'));
        const shipped = ver(fs.readFileSync(path.join(ANDROID, 'sw.js'), 'utf8'));
        assert.ok(repo, 'sw.js at the repo root declares no CACHE_VERSION');
        assert.ok(shipped, 'the shipped sw.js declares no CACHE_VERSION');
        assert.equal(shipped, repo,
            '\nthe Android build would ship ' + shipped + ' while the repo is on ' + repo
            + '.\n  Fix: ' + RESYNC_ANDROID);
    });

    test('the Android bundle carries nothing the repo does not ship',
        { skip: AND.present ? false : ANDROID_ABSENT }, () => {
        const extra = AND.entries.filter(f => !FILES.includes(f) && !CAPACITOR_OWN_ANDROID.includes(f));
        assert.deepEqual(extra, [],
            'the Android bundle contains ' + extra.length + ' file(s) that are neither '
            + 'declared in ' + SYNC_SCRIPT + ' nor written by Capacitor: ' + extra.join(', ')
            + '\nA hand-edited bundle is exactly what this file exists to refuse. '
            + 'Run: ' + RESYNC_ANDROID);
    });

    // THE PRODUCT BOUNDARY, ON DISK. FILES_TO_SYNC is Consumer-only by declaration,
    // and the test above would also flag an undeclared file - but that one is
    // about hand-edits in general. This one says the specific thing: the
    // organizer product is not inside the golfer's app. It reads the directory,
    // not the list, so a sync script that started shipping the union would be
    // caught by the bundle it produced.
    test('no Tournament-only file ships in the Android bundle',
        { skip: AND.present ? false : ANDROID_ABSENT }, () => {
        const leaked = TOURNAMENT_ONLY.filter(f => fs.existsSync(path.join(ANDROID, f)));
        assert.deepEqual(leaked, [],
            'the golfer\'s Android app carries the Tournament product: ' + leaked.join(', ')
            + '\nThe native bundle is SHARED_SHELL + CONSUMER_SHELL, nothing else. '
            + 'Run: ' + RESYNC_ANDROID);
    });
});
