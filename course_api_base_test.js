// ============================================================================
// THE COURSE PROXY'S BASE URL: '' on the web, the canonical origin in the shell
// (2026-09-19).
//
// admin.html fetched '/api/course-search?q=' and '/api/course/<id>' RELATIVE.
// In the iOS shell the page's origin is capacitor://localhost, so those resolved
// to capacitor://localhost/api/... - a path the shell does not serve - and
// native course search could never reach the proxy. courseApiBase() answers
// '' off the shell (the web path is byte-identical to before) and
// GOLF_WEB_ORIGIN (product-links.js) on it - the SAME Cloudflare proxy, no
// second path, no CDN.
//
// ONE NATIVE DETECTION. courseApiBase() reads isNativeApp() - html.is-native,
// which pwa-boot publishes - and adds no second check (the rule written above
// isNativeApp in admin.html). It is read at fetch time, on a tap, after load.
//
// HARNESS. mini-dom: window.fetch is replaced to record the URL; the online
// search is reached the way the import tests reach it (runOnlineCourseSearch is
// the row's onclick, pinned in course_import_test.js). The native arm here can
// only prove the BASE - the fetch itself is still a native no-op until the
// page commit that follows removes the guards; that commit's test drives it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('admin.html');
const ORIGIN = /const GOLF_WEB_ORIGIN = '([^']+)'/.exec(read('product-links.js'))[1];

function arrive() {
    return loadHtmlInlineScript('admin.html', ['product-links.js'], {});
}

describe('THE BASE', () => {
    test('courseApiBase(): "" on the web, GOLF_WEB_ORIGIN in the shell, read from html.is-native', () => {
        const sb = arrive();
        assert.equal(sb.courseApiBase(), '');
        sb.document.documentElement.classList.add('is-native');
        assert.equal(sb.courseApiBase(), ORIGIN);
        assert.equal(ORIGIN, 'https://golf-app-5a5.pages.dev', 'the canonical origin product-links names');
    });
    test('both fetches go through it, and nothing else in admin.html fetches /api', () => {
        assert.match(SRC, /fetch\(courseApiBase\(\) \+ '\/api\/course-search\?q=' \+ encodeURIComponent\(query\)\)/);
        assert.match(SRC, /fetch\(courseApiBase\(\) \+ '\/api\/course\/' \+ encodeURIComponent\(course\.id\)\)/);
        assert.equal((SRC.match(/fetch\('\/api\//g) || []).length, 0, 'a relative /api fetch is back');
        const fn = SRC.slice(SRC.indexOf('function courseApiBase()'), SRC.indexOf('\n    }', SRC.indexOf('function courseApiBase()')));
        assert.match(fn, /isNativeApp\(\)/, 'the one detection');
        assert.doesNotMatch(fn, /window\.Capacitor/, 'no second native check on this page');
        assert.match(fn, /GOLF_WEB_ORIGIN/);
    });
});

describe('THE WEB PATH IS UNCHANGED', () => {
    test('on the web the search still asks /api/course-search?q=... - the relative URL, byte for byte', async () => {
        const sb = arrive();
        const urls = [];
        sb.fetch = async (u) => { urls.push(String(u)); return { json: async () => ({ status: 'ok', courses: [] }) }; };
        await sb.runOnlineCourseSearch('streamsong', null);
        assert.deepEqual(urls, ['/api/course-search?q=streamsong']);
    });
    test('and the detail fetch likewise', async () => {
        const sb = arrive();
        const urls = [];
        sb.fetch = async (u) => { urls.push(String(u)); return { json: async () => ({ status: 'unavailable', reason: 'not_configured' }) }; };
        await sb.openImportConfirm({ id: 'c0000001', club_name: 'X', course_name: 'Y' });
        assert.deepEqual(urls, ['/api/course/c0000001']);
    });
});
