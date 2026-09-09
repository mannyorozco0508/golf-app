// ============================================================================
// AN EMAIL AT A DOMAIN WE DO NOT OWN - AND THE ONE THAT LOOKS IDENTICAL AND IS FINE.
//
// Manny owns rattlegolf.com. He does NOT own rattlegolf.app. Three pages hand the
// golfer support@rattlegolf.app, which bounces or, worse, reaches whoever does own
// that domain.
//
// THE WHOLE DIFFICULTY OF THIS TEST IS THAT ONE STRING IS FINE AND MUST STAY.
// "com.rattlegolf.app" is the iOS BUNDLE IDENTIFIER. A reverse-DNS bundle id is not
// a domain and does not require owning one, and it is PERMANENT once the App Store
// Connect record exists - Apple ID 6808220335. Changing it would not rename the app;
// it would create a different app and orphan the record, the TestFlight builds and
// the reviews. It appears in capacitor.config.ts, project.pbxproj, two tests that
// deliberately pin it, and four documents.
//
// SO A SUBSTRING SEARCH FOR "rattlegolf.app" IS A BROKEN TEST. It would go red on
// fourteen correct occurrences and teach whoever hits it to delete the assertion.
//
// THE DISCRIMINATION IS STRUCTURAL, not a blacklist of known-good lines: an email
// address is `local@domain`, and a bundle identifier has NO `@`. This extracts every
// address-shaped token and judges it on its DOMAIN. com.rattlegolf.app is therefore
// invisible to it by construction - not exempted, not whitelisted, just not an email.
// That is why a novel address nobody has thought of, hello@rattlegolf.app, is caught
// by the same rule with no edit here.
//
// SCOPE: every tracked text file. git ls-files rather than a directory walk, so the
// generated trees (www/, ios/App/App/public/, dist/) are out by definition and
// node_modules can never creep in.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');

const BAD_DOMAIN = 'rattlegolf.app';
const GOOD_DOMAIN = 'rattlegolf.com';
const BUNDLE_ID = 'com.rattlegolf.app';

// An address-shaped token. The local part is deliberately permissive - the point is
// to catch anything a human might type, not to validate RFC 5322.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BINARY = /\.(png|jpg|jpeg|gif|ico|pdf|zip|woff2?|ttf|icns|mp4|mov)$/i;

function trackedTextFiles() {
    const out = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').filter(f => f && !BINARY.test(f));
}

// Every address in the repo, with the file and line it sits on.
function allEmails() {
    const found = [];
    trackedTextFiles().forEach(rel => {
        let src;
        try { src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); } catch (e) { return; }
        src.split('\n').forEach((line, i) => {
            const m = line.match(EMAIL);
            if (!m) return;
            // de-duplicated per line: a mailto: link repeats the address as its text,
            // and reporting it twice makes the failure read like two problems.
            [...new Set(m)].forEach(addr => found.push({ file: rel, line: i + 1, addr }));
        });
    });
    return found;
}
const EMAILS = allEmails();
const domainOf = a => a.slice(a.lastIndexOf('@') + 1).toLowerCase();

describe('THE SUPPORT ADDRESS IS AT A DOMAIN WE OWN', () => {

    // POSITIVE FIRST. Every assertion below is "no address has this domain", which is
    // trivially true of an empty list. If the scan ever finds nothing - a broken
    // git ls-files, a changed helper, a bad regex - this file would guard nothing and
    // report PASS. That is the inert-guard shape this repo keeps finding.
    test('the scan actually found addresses to judge', () => {
        assert.ok(EMAILS.length > 0,
            'no email address was found anywhere in the repo, so every assertion below '
            + 'is vacuous. The scan is broken, not the repo.');
        assert.ok(trackedTextFiles().length > 100,
            'only ' + trackedTextFiles().length + ' tracked text files were scanned; '
            + 'that is too few for this repo and suggests the file list is wrong.');
    });

    test('no email address is at a domain we do not own', () => {
        const bad = EMAILS.filter(e => domainOf(e.addr) === BAD_DOMAIN
                                    || domainOf(e.addr).endsWith('.' + BAD_DOMAIN));
        assert.deepEqual(bad, [],
            '\n' + bad.length + ' email address(es) point at ' + BAD_DOMAIN + ', which we do '
            + 'NOT own:\n'
            + bad.map(e => '    ' + e.file + ':' + e.line + '   ' + e.addr).join('\n')
            + '\n\n  Mail sent there bounces, or reaches whoever does own that domain.'
            + '\n  The live, verified address is support@' + GOOD_DOMAIN + '.'
            + '\n  NOTE: this is about the EMAIL only. Do not touch ' + BUNDLE_ID + '.');
    });

    // THE OTHER HALF OF THE CONTRACT. Refusing the wrong domain says nothing about
    // whether the right one is actually offered - deleting the address entirely would
    // satisfy the assertion above and leave the golfer with no way to reach anybody,
    // which App Store review requires.
    test('the pages that offer a contact offer the one we own', () => {
        const CONTACT_PAGES = ['support.html', 'terms.html', 'privacy.html'];
        const missing = CONTACT_PAGES.filter(p => {
            const src = fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
            return !new RegExp('[A-Za-z0-9._%+-]+@' + GOOD_DOMAIN.replace('.', '\\.'), 'i').test(src);
        });
        assert.deepEqual(missing, [],
            'these pages carry no address at ' + GOOD_DOMAIN + ': ' + missing.join(', '));
    });

    // ---- THE BUNDLE ID IS NOT AN EMAIL, AND MUST SURVIVE ------------------
    //
    // This is the assertion that makes the test trustworthy rather than merely green.
    // It proves the rule ALLOWS com.rattlegolf.app - so nobody "fixing" the domain
    // can quietly take the bundle id with it, and nobody reading a failure above can
    // conclude the bundle id is the problem.
    test('com.rattlegolf.app is present, untouched, and NOT treated as an address', () => {
        const holders = trackedTextFiles().filter(rel => {
            try { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').includes(BUNDLE_ID); }
            catch (e) { return false; }
        });
        assert.ok(holders.length >= 5,
            'the permanent bundle id ' + BUNDLE_ID + ' should appear in the capacitor '
            + 'config, the Xcode project and the tests that pin it. Found it in only '
            + holders.length + ' file(s): ' + holders.join(', '));
        assert.ok(holders.includes('capacitor.config.ts'), 'capacitor.config.ts must declare it');
        assert.ok(holders.includes('ios/App/App.xcodeproj/project.pbxproj'),
            'the Xcode project must declare it');
        // And it is invisible to the email rule: no address anywhere ends up with the
        // bundle id as its domain.
        assert.equal(EMAILS.filter(e => e.addr.toLowerCase().includes(BUNDLE_ID)).length, 0,
            'the bundle id was parsed as part of an email address - the rule is wrong');
    });

    test('this test states what it can and cannot tell apart', () => {
        const src = fs.readFileSync(__filename, 'utf8');
        assert.match(src, /a bundle identifier has NO `@`/,
            'the discrimination this test rests on must stay written down in it');
    });
});
