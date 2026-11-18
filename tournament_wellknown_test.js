// ============================================================================
// APP-LINK ASSOCIATION FILES: CLAIM NOTHING UNTIL 2.0.6 (Manny, 2026-11-10)
//
// "Today's store apps (iOS 2.0.3/2.0.4, Android 19/23) can't show tournament
// scorecards. If any team/scorecard/tournament link is claimed, exclude those
// paths until the app ships the in-app card (2.0.6), so they keep opening in
// the browser."
//
// /.well-known/apple-app-site-association is served, and every component is
//   an EXCLUDE: /tournament-scorecard*, /tournament*, and "*". iOS 2.0.4 lists
//   applinks:tournaments.rattlegolf.com and golf-app-5a5.pages.dev, so a claim
//   here would pull team links into an app that cannot show them. It claims no
//   path on any host (test 1).
// /.well-known/assetlinks.json WAS held back (it cannot exclude a path: it
//   vouches for the whole domain, and the paths come from the app's manifest;
//   Android 23 listed /tournament-scorecard on both hosts, so serving it then
//   would have let an app that could not show team links claim them).
//   T4 (Android lane hand-off 2026-11-14, served 2026-11-17): Android 2.0.8's
//   hardpangolf.com autoVerify filter ships ONLY after Google can read this
//   file, and no shipped Android app (2.0.7, 29) lists hardpangolf.com, so the
//   file claims nothing today. It is served byte for byte as the live
//   firebaseapp.com copy, sha256 766628b5... (test 2): the Play app-signing key
//   and the upload key (keytool on the 2.0.9 AAB: the second fingerprint).
//
// THE EMAIL SIGN-IN LINK IS NOT TOUCHED: it lives on golfapp-9fb21.firebaseapp.com
// (Firebase Hosting), which nothing here serves or changes.
//
// TESTS: 5. BASELINE against live main 4cf836a4 (AASA excludes only,
// assetlinks.json NOT served, no _headers rule for it):
//
//   all 5 tests: 2 PASS / 3 FAIL / 0 cancelled.   2 + 3 = 5.   (tests 2, 3, 5 red)
//
// Earlier baseline (2026-11-10, against main-phase1 a3be2930, AASA claiming
// /tournament-scorecard*, assetlinks.json served): 3 PASS / 2 FAIL of 5.
//
// NEGATIVE CONTROLS (restored by cp from a saved copy, sha RESTORED-OK):
//   C21 the AASA's first component loses "exclude": true          test 1 CAUGHT
//   C22 assetlinks.json removed                                   test 2 CAUGHT (and 5)
//   C23 the AASA rule removed from _headers                       test 3 CAUGHT
//   C24 one hex digit of a fingerprint changed                    test 2 CAUGHT
//   C25 the assetlinks.json rule removed from _headers            test 3 CAUGHT
// ============================================================================
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const AASA = path.join(ROOT, '.well-known', 'apple-app-site-association');
const LINKS = path.join(ROOT, '.well-known', 'assetlinks.json');
const read = (f) => fs.readFileSync(f, 'utf8');

// The live firebaseapp.com file, as fetched 2026-11-10.
const LIVE_ASSETLINKS = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.rattlegolf.app', sha256_cert_fingerprints: [
        'D7:6F:BB:1A:9A:6B:80:78:83:E0:7C:CC:C4:A2:74:86:D0:AF:07:40:02:88:7E:40:C5:2C:81:E5:95:83:26:74',
        'CC:42:26:0D:1A:B3:76:D7:23:28:7A:CC:76:84:A5:56:E1:FC:AE:BC:54:01:C2:78:EB:45:9E:5A:30:83:96:8D'] } }];
const LIVE_SHA = '766628b5324e059ca8c086ef50bb308cdeb1dc43bc70d25c08b27d1fb6f99083';

// Apple's component matching for "/": '*' any run of characters, '?' one.
const aasaMatch = (pattern, p) => new RegExp('^' + pattern.split('').map((c) => (c === '*' ? '.*' : (c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))).join('') + '$').test(p);

let M = null;
before(async () => { M = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href); });

describe('P1-e association files', () => {
    test('1. the AASA: the Rattle Golf app, and every component excludes - no path is claimed', () => {
        const j = JSON.parse(read(AASA));
        const details = j.applinks && j.applinks.details;
        assert.equal(details.length, 1);
        assert.deepEqual(details[0].appIDs, ['A2Z95T64UU.com.rattlegolf.app']);
        const comps = details[0].components;
        assert.ok(comps.length >= 1, 'positive: the file has components');
        assert.ok(comps.some((c) => c['/'] === '/tournament-scorecard*' && c.exclude === true), 'team links excluded by name');
        comps.forEach((c) => assert.equal(c.exclude, true, 'a component that claims: ' + c['/']));
        const claims = (p) => comps.some((c) => !c.exclude && aasaMatch(c['/'], p));
        ['/tournament-scorecard', '/tournament-scorecard.html', '/tournament', '/tournament.html', '/', '/app', '/index.html',
            '/admin', '/admin.html', '/game.html', '/trip.html', '/__/auth/handler', '/__/auth/links'].forEach((p) =>
            assert.ok(!claims(p), 'must not claim ' + p));
    });

    test('2. assetlinks.json is served (T4), byte for byte the live firebaseapp.com file: our package, both keys', () => {
        assert.equal(fs.existsSync(LINKS), true, 'assetlinks.json is not served');
        const raw = fs.readFileSync(LINKS);
        assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), LIVE_SHA, 'not the live firebaseapp.com bytes');
        const j = JSON.parse(raw.toString('utf8'));
        assert.deepEqual(j, LIVE_ASSETLINKS, 'content drifted from the pinned statement');
        assert.equal(j.length, 1);
        assert.deepEqual(j[0].relation, ['delegate_permission/common.handle_all_urls']);
        assert.equal(j[0].target.package_name, 'com.rattlegolf.app');
        assert.equal(j[0].target.sha256_cert_fingerprints.length, 2, 'the Play app-signing key and the upload key');
        j[0].target.sha256_cert_fingerprints.forEach((f) => assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, 'fingerprint form: ' + f));
    });

    test('3. _headers serves the AASA and assetlinks.json as application/json', () => {
        const lines = read(path.join(ROOT, '_headers')).split('\n');
        const rules = {};
        let cur = null;
        lines.forEach((l) => {
            if (/^\s*#/.test(l) || !l.trim()) { if (!l.trim()) cur = null; return; }
            if (/^\S/.test(l)) { cur = l.trim(); rules[cur] = rules[cur] || {}; return; }
            const m = /^\s+([^:]+):\s*(.*)$/.exec(l);
            if (cur && m) rules[cur][m[1].trim().toLowerCase()] = m[2].trim();
        });
        assert.equal((rules['/.well-known/apple-app-site-association'] || {})['content-type'], 'application/json');
        assert.equal((rules['/.well-known/assetlinks.json'] || {})['content-type'], 'application/json');
    });

    test('4. not blocked, not routed to the Function, no redirect', () => {
        ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json'].forEach((p) => {
            assert.equal(M.isBlockedPath(p), false, p + ' is blocked');
            assert.equal(M.isAuthProxyPath(p), false);
        });
        // the dot-file rule is still live where it belongs (positive control)
        assert.equal(M.isBlockedPath('/.gitignore'), true);
        assert.equal(M.isBlockedPath('/.git/config'), true);
        const routes = JSON.parse(read(path.join(ROOT, '_routes.json')));
        const match = (rule, p) => new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(p);
        ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json'].forEach((p) =>
            assert.ok(!routes.include.some((r) => match(r, p)), p + ' would run the Function'));
        assert.ok(!fs.existsSync(path.join(ROOT, '_redirects')) || !/well-known/.test(read(path.join(ROOT, '_redirects'))), 'a redirect rule');
    });

    test('5. both files are plain JSON, no BOM, where Pages serves them (the repo root)', () => {
        [AASA, LINKS].forEach((f) => {
            const raw = fs.readFileSync(f);
            assert.notEqual(raw[0], 0xef, 'BOM in ' + f);
            assert.doesNotThrow(() => JSON.parse(raw.toString('utf8')));
        });
        assert.equal(path.extname(AASA), '', 'the AASA has no extension');
    });
});
