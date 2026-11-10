// ============================================================================
// P1-e: TEAM LINKS OPEN THE APP - THE TWO ASSOCIATION FILES (2026-11-10)
//
// /.well-known/apple-app-site-association  iOS universal links: the Rattle
//   Golf app (A2Z95T64UU.com.rattlegolf.app) claims /tournament-scorecard*,
//   which is every path hp-email-link-open.js's tourneyTarget() accepts
//   (release-204: /^\/tournament-scorecard(\.html)?$/ on
//   tournaments.rattlegolf.com and golf-app-5a5.pages.dev).
// /.well-known/assetlinks.json  Android app links: byte-for-byte the live
//   https://golfapp-9fb21.firebaseapp.com/.well-known/assetlinks.json
//   (fetched read-only 2026-11-10, sha256 766628b5...), as Android asked in
//   inbox/ANDROID-TOURNEY-ASSETLINKS.md.
//
// THE EMAIL SIGN-IN LINK IS NOT TOUCHED. It lives on golfapp-9fb21.firebaseapp.com
// (Firebase Hosting), whose own AASA claims /__/auth/links* - a different
// host, which nothing here serves or changes. And this file must NOT claim
// /__/auth/ on our hosts: there /__/auth/ is the web sign-in redirect proxy
// (functions/_middleware.js), and an app that claimed it would pull a
// browser's Google/Apple sign-in into the app. Test 1 holds that.
//
// SERVED AS application/json, NO REDIRECT, NOT BLOCKED: the middleware's
// isBlockedPath is false for both (the dot-file rule applies to a top-level
// FILE, and .well-known is a folder); _routes.json does not send them to the
// Function at all, so they are plain static files; _headers sets the type
// (the AASA has no extension, which Pages would serve as octet-stream);
// there is no _redirects. What only a deploy can prove: the live response.
// After the web deploy, `curl -sI https://tournaments.rattlegolf.com/.well-known/apple-app-site-association`
// must say 200 and application/json (today it says 200 text/html - the SPA
// fallback, measured 2026-11-10).
//
// TESTS: 5. BASELINE against p1-base 48121bea (the two files and _headers
// absent there; this file run with them moved aside to a scratch folder,
// then restored by cp, shas RESTORED-OK):
//
//   all 5 tests: 1 PASS / 4 FAIL / 0 cancelled.   1 + 4 = 5.
//
// The 1 that passes at baseline is test 4 (isBlockedPath and _routes.json
// already let both paths through) - it is held so a later block rule cannot
// silently take them away.
//
// NEGATIVE CONTROLS (restored by cp from a saved copy, sha RESTORED-OK):
//   C11 '.well-known' added to BLOCKED_DIRS in functions/_middleware.js  1 fail CAUGHT
//   C12 the AASA rule removed from _headers                              1 fail CAUGHT
//   C13 the AASA claims "/tournament-scorecard.html" only                1 fail CAUGHT
//   C14 one assetlinks fingerprint changed by one character              1 fail CAUGHT
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
    test('1. the AASA: the Rattle Golf app, every team-link path tourneyTarget accepts, and nothing else', () => {
        const j = JSON.parse(read(AASA));
        const details = j.applinks && j.applinks.details;
        assert.equal(details.length, 1);
        assert.deepEqual(details[0].appIDs, ['A2Z95T64UU.com.rattlegolf.app']);
        const pats = details[0].components.map((c) => c['/']);
        const claims = (p) => details[0].components.some((c) => !c.exclude && aasaMatch(c['/'], p));
        assert.ok(pats.length >= 1, 'at least one component');
        ['/tournament-scorecard', '/tournament-scorecard.html'].forEach((p) => assert.ok(claims(p), 'not claimed: ' + p));
        ['/', '/index.html', '/home.html', '/admin.html', '/tournament.html', '/tournament', '/__/auth/handler', '/__/auth/links',
            '/__/auth/action', '/__/firebase/init.json', '/api/scan', '/game.html'].forEach((p) => assert.ok(!claims(p), 'must not claim ' + p));
    });

    test('2. assetlinks.json is the live firebaseapp.com file, byte for byte', () => {
        const raw = fs.readFileSync(LINKS);
        assert.deepEqual(JSON.parse(raw.toString('utf8')), LIVE_ASSETLINKS);
        assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), LIVE_SHA);
    });

    test('3. _headers serves both as application/json', () => {
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

    test('5. both files are plain JSON, no BOM, tracked where Pages serves them (the repo root)', () => {
        [AASA, LINKS].forEach((f) => {
            const raw = fs.readFileSync(f);
            assert.notEqual(raw[0], 0xef, 'BOM in ' + f);
            assert.doesNotThrow(() => JSON.parse(raw.toString('utf8')));
        });
        assert.equal(path.extname(AASA), '', 'the AASA has no extension');
    });
});
