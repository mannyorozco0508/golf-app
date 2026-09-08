#!/usr/bin/env node
// ============================================================================
// WHICH ICON DOES EACH PRODUCT ACTUALLY SHIP?
//
// The Tournament PWA installs today wearing the Consumer mark. Not because
// anything is broken - because icon-192.png and icon-512.png sit in
// SHARED_SHELL, and build-shell.js hard-codes one icon list for both manifests.
// Two organizers and a golfer end up with two home-screen icons that are the
// same picture.
//
// BY CONTENT, NEVER BY FILENAME. A filename check would pass the moment
// something called tournament-icon-512.png existed, whether it held the new
// artwork, the old artwork, or a copy of the splash screen. Every assertion
// below identifies artwork by the sha256 of the bytes that actually landed in
// the output directory, and matches it against the masters at the repo root.
// The Consumer bundle is pinned to the exact digests it shipped BEFORE this
// wave, measured on the tree as it stood, so "Consumer is unchanged" is a
// statement about bytes rather than about intent.
//
//   node tools/tournament-icon-wiring-check.js
//
//   exit 0   each product ships its own mark
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// The Consumer artwork as it shipped before this wave. Digests, not names - if
// somebody renames icon-192.png the Consumer bundle still has to contain these
// exact bytes or this check fails.
const CONSUMER_BEFORE = {
    '5719179d6fc26ad325402deff46129b63af6d4c2462c4a2101f1d8cc635c4a4f': 'consumer icon 192',
    '7d3bf7c95b7cfcdaad13c88825ecaf17253ef17f6c67dd8427f840bfac5e2f89': 'consumer icon 512',
    '976628c5908a98468afff8cdea3c356ebca3c2e4aa59b1c7633d9ff51845d110': 'consumer logo-mark 256',
};
const CONSUMER_MASTER_1024 = '01d01bff01c5e497337b6ea0d1f2c68258673728cf9f94476583e3876602a112';

const TOURNAMENT_MASTERS = [
    'tournament-icon-1024.png', 'tournament-icon-512.png',
    'tournament-icon-192.png', 'tournament-icon-180.png',
];

const CONSUMER_PAGES = ['index.html', 'admin.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html', 'instructions.html',
    'shared.html'];
const TOURNAMENT_PAGES = ['tournament.html', 'tournament-scorecard.html'];
// The four that have linked the Consumer manifest since before either wave. The
// other six Consumer pages have never had one, and that is not this wave to change.
const CONSUMER_WITH_MANIFEST = ['index.html', 'admin.html', 'sidematches.html', 'skins.html'];

// The href a page declares, resolved against a directory, and parsed. Returns
// null when the name does not exist there - which is itself an answer.
function resolveManifest(dir, page) {
    const src = fs.existsSync(path.join(dir, page))
        ? fs.readFileSync(path.join(dir, page), 'utf8')
        : fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = /<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)["']/i.exec(src);
    if (!m) return null;
    const target = path.join(dir, m[1].replace(/^\.\//, ''));
    if (!fs.existsSync(target)) return null;
    try { return JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) { return null; }
}
const isTournamentManifest = m => !!m && m.name === 'GolfApp Tournaments'
    && m.start_url === './tournament.html'
    && Array.isArray(m.icons) && m.icons.length > 0
    && m.icons.every(i => /^tournament-icon-/.test(i.src) && i.purpose === 'any');
const isConsumerManifest = m => !!m && m.name === 'Rattle Golf'
    && m.icons.every(i => i.purpose === 'any maskable');

function bail(msg) {
    console.error('tournament-icon-wiring-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const readIf = p => fs.existsSync(p) ? fs.readFileSync(p) : null;

function pngHeader(buf) {
    if (!buf || buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20),
             bitDepth: buf[24], colourType: buf[25] };
}

// What is in this output directory, identified by its bytes.
function inventory(dir) {
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).sort()
        .map(f => {
            const buf = fs.readFileSync(path.join(dir, f));
            const h = pngHeader(buf);
            return { file: f, sha: sha(buf), bytes: buf.length,
                     w: h && h.w, h: h && h.h, colourType: h && h.colourType };
        });
}

function swPngs(dir) {
    const src = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
    const m = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(src);
    if (!m) bail('no SHELL_FILES in dist/' + path.basename(dir) + '/sw.js');
    return [...m[1].matchAll(/'\.\/([^']+)'/g)].map(x => x[1]).filter(f => f.endsWith('.png'));
}

(() => {
    const problems = [];

    try {
        execFileSync('node', [path.join(ROOT, 'build-shell.js')], { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
        bail('build-shell.js failed: ' + String((e.stdout || '') + (e.stderr || '')).slice(0, 400));
    }
    ['consumer', 'tournament'].forEach(p => {
        if (!fs.existsSync(path.join(DIST, p, 'manifest.json'))) bail('dist/' + p + ' was not built');
    });

    // The masters at the repo root, by content. Named here only to LOAD them;
    // every assertion afterwards compares digests.
    const masters = {};
    TOURNAMENT_MASTERS.forEach(f => {
        const buf = readIf(path.join(ROOT, f));
        masters[f] = buf ? { sha: sha(buf), ...pngHeader(buf), bytes: buf.length } : null;
    });
    const tourSha = {};
    Object.keys(masters).forEach(f => { if (masters[f]) tourSha[masters[f].sha] = f; });

    const inv = { consumer: inventory(path.join(DIST, 'consumer')),
                  tournament: inventory(path.join(DIST, 'tournament')) };
    const man = {
        consumer: JSON.parse(fs.readFileSync(path.join(DIST, 'consumer', 'manifest.json'), 'utf8')),
        tournament: JSON.parse(fs.readFileSync(path.join(DIST, 'tournament', 'manifest.json'), 'utf8')),
    };
    const sw = { consumer: swPngs(path.join(DIST, 'consumer')),
                 tournament: swPngs(path.join(DIST, 'tournament')) };

    // Resolve each manifest icon entry to the bytes actually shipped beside it.
    const resolve = (prod) => man[prod].icons.map(ic => {
        const row = inv[prod].find(r => r.file === ic.src);
        return { src: ic.src, sizes: ic.sizes, purpose: ic.purpose,
                 present: !!row, sha: row && row.sha, w: row && row.w, h: row && row.h };
    });
    const tIcons = resolve('tournament');
    const cIcons = resolve('consumer');

    const tourInDist = inv.tournament.filter(r => tourSha[r.sha]);
    const consumerArtInTournament = inv.tournament.filter(r => CONSUMER_BEFORE[r.sha]);

    const A = {
        // 1. THE FILES EXIST AND ARE THE VERIFIED ONES
        allFourMastersAtTheRepoRoot: TOURNAMENT_MASTERS.every(f => masters[f]),
        mastersAreSquareAndOpaque: TOURNAMENT_MASTERS.every(f =>
            masters[f] && masters[f].w === masters[f].h &&
            masters[f].colourType !== 6 && masters[f].colourType !== 4),
        theMasterIsExactly1024: !!masters['tournament-icon-1024.png']
            && masters['tournament-icon-1024.png'].w === 1024
            && masters['tournament-icon-1024.png'].h === 1024,

        // 2. THE TOURNAMENT BUNDLE CARRIES THE NEW ARTWORK...
        tournamentShipsItsOwn512: tourInDist.some(r => r.w === 512),
        tournamentShipsItsOwn192: tourInDist.some(r => r.w === 192),
        tournamentShipsItsOwn180: tourInDist.some(r => r.w === 180),
        // ...AND NOT THE CONSUMER MARK. By digest: a Consumer icon renamed
        // tournament-anything would still be caught here.
        tournamentCarriesNoConsumerArtwork: consumerArtInTournament.length === 0,

        // 3. CONSUMER IS BYTE-FOR-BYTE WHAT IT WAS
        consumerArtworkUnchanged:
            JSON.stringify(inv.consumer.map(r => r.sha).sort())
            === JSON.stringify(Object.keys(CONSUMER_BEFORE).sort()),
        consumerCarriesNoTournamentArtwork: !inv.consumer.some(r => tourSha[r.sha]),

        // 4. THE MANIFESTS
        tournamentManifestPurposeIsAnyOnly:
            tIcons.length > 0 && tIcons.every(i => i.purpose === 'any'),
        tournamentManifestIconsAreTheNewArtwork:
            tIcons.length > 0 && tIcons.every(i => i.present && !!tourSha[i.sha]),
        tournamentManifestSizesMatchTheBytes:
            tIcons.every(i => i.present && i.sizes === `${i.w}x${i.h}`),
        consumerManifestStillMaskable:
            cIcons.length > 0 && cIcons.every(i => i.purpose === 'any maskable'),
        consumerManifestIconsUnchanged:
            cIcons.length === 2 && cIcons.every(i => i.present && !!CONSUMER_BEFORE[i.sha]),

        // 5. THE 1024 MASTER IS IN NEITHER OUTPUT - by digest AND by dimension,
        // so a 1024 under any name is caught.
        no1024InEitherOutput:
            !inv.consumer.concat(inv.tournament).some(r =>
                r.w === 1024 || r.sha === CONSUMER_MASTER_1024
                || (masters['tournament-icon-1024.png'] && r.sha === masters['tournament-icon-1024.png'].sha)),
        // PARSED, NOT GREPPED. The first version of this assertion searched
        // sync-mobile-web.js for the string and failed on a COMMENT that says the
        // 1024 is deliberately absent - documentation reading as membership. The
        // lists are parsed the way build-shell.js parses them.
        the1024IsInNoShellList: (() => {
            const src = fs.readFileSync(path.join(ROOT, 'sync-mobile-web.js'), 'utf8');
            return ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL'].every(name => {
                const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(src);
                if (!m) bail(name + ' is not declared in sync-mobile-web.js');
                return ![...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
                    .includes('tournament-icon-1024.png');
            });
        })(),

        // 6. PRECACHE
        tournamentPrecachesItsOwnIcons: sw.tournament.length > 0
            && sw.tournament.every(f => {
                const row = inv.tournament.find(r => r.file === f);
                return row && !!tourSha[row.sha];
            }),
        consumerPrecachesOnlyConsumerArtwork: sw.consumer.every(f => {
            const row = inv.consumer.find(r => r.file === f);
            return row && !!CONSUMER_BEFORE[row.sha];
        }),

        // 7. APPLE-TOUCH-ICON, on the Tournament pages only
        bothTournamentPagesHaveAppleTouchIcon: TOURNAMENT_PAGES.every(p =>
            /<link[^>]+rel=["']apple-touch-icon["']/i.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))),
        appleTouchIconPointsAtThe180Bytes: TOURNAMENT_PAGES.every(p => {
            const m = /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i
                .exec(fs.readFileSync(path.join(ROOT, p), 'utf8'));
            if (!m) return false;
            const row = inv.tournament.find(r => r.file === m[1].replace(/^\.\//, ''));
            return !!row && row.w === 180 && !!tourSha[row.sha];
        }),
        noConsumerPageGainedOne: CONSUMER_PAGES.every(p =>
            !/apple-touch-icon/i.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))),

        // 8. THE MANIFEST LINK - RESOLVED, NOT READ AS A STRING.
        //
        // The href is not the claim. What matters is the JSON that name actually
        // opens FROM THE DIRECTORY THE PAGE LIVES IN, and the answer differs by
        // deployment: at the repo root - which is what golf-app-5a5.pages.dev
        // serves today - manifest.json is the Consumer identity. So the link is
        // resolved twice, against the live combined root AND against the built
        // Tournament output, and both have to come back Tournament.
        bothTournamentPagesLinkAManifest: TOURNAMENT_PAGES.every(p =>
            /<link[^>]+rel=["']manifest["']/i.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))),
        theLinkResolvesToTournamentAtTheLiveRoot: TOURNAMENT_PAGES.every(p =>
            isTournamentManifest(resolveManifest(ROOT, p))),
        theLinkResolvesToTournamentInTheBuiltBundle: TOURNAMENT_PAGES.every(p =>
            isTournamentManifest(resolveManifest(path.join(DIST, 'tournament'), p))),
        theResolvedIconsAreTheNewArtwork: TOURNAMENT_PAGES.every(p => {
            const m = resolveManifest(path.join(DIST, 'tournament'), p);
            return !!m && m.icons.length > 0 && m.icons.every(ic => {
                const row = inv.tournament.find(r => r.file === ic.src);
                return !!row && !!tourSha[row.sha];
            });
        }),
        theCommittedManifestMatchesWhatTheBuildGenerates:
            fs.readFileSync(path.join(ROOT, 'tournament-manifest.json'), 'utf8')
            === fs.readFileSync(path.join(DIST, 'tournament', 'manifest.json'), 'utf8'),
        // The four Consumer pages that had one still have one, pointing at the
        // Consumer manifest, and nothing else on either side gained or lost a link.
        exactlyTheFourConsumerPagesStillLinkTheConsumerManifest:
            CONSUMER_PAGES.every(p => {
                const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
                const has = /<link[^>]+rel=["']manifest["']/i.test(html);
                if (CONSUMER_WITH_MANIFEST.includes(p)) {
                    return has && isConsumerManifest(resolveManifest(ROOT, p));
                }
                return !has;
            }),
    };

    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    const report = {
        repoRootMasters: masters,
        distInventory: inv,
        manifestIcons: { tournament: tIcons, consumer: cIcons },
        swPrecachedPngs: sw,
        consumerArtworkFoundInTournamentBundle: consumerArtInTournament.map(r => r.file),
        assertions: A,
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
