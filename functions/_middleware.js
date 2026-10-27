// ============================================================================
// NON-SITE FILES ANSWER 404 (tfweb-2, Manny, Oct 26)
//
// The Pages project serves the repo ROOT as the site, so every committed file
// was a public URL: /package.json, /CLAUDE.md, /database.rules.json, every
// *_test.js, /tools/..., /helpers/..., /ios/..., /android/... (measured live,
// all 200). This middleware answers 404 for those, and calls next() for
// everything else - the pages, the engine scripts, the icons, the manifests,
// sw.js, assets/ and /api/*.
//
// WHY A MIDDLEWARE + _routes.json, AND NOT A BUILD STEP OR _redirects
//   - A build step that copies only the site into an output dir would need the
//     Pages project's build settings changed in the dashboard (a live config
//     change, outside this branch), and a file missed by the copy would break
//     the site. This moves nothing: the site is served exactly as before.
//   - _redirects cannot answer 404 (only 200 rewrites and 3xx), and a rewrite to
//     a missing file lands on the SPA fallback (index.html, 200).
//   - _routes.json (repo root) limits where Functions run: "/" and "/api/*" as
//     before, plus ONLY the blocked patterns. Every other static file never
//     invokes a Function, so nothing about the site's speed or cost changes.
//     The list here and the include list there are pinned to each other by
//     site_block_tfweb2_test.js.
// ============================================================================

// Top-level folders that are not the site (some exist only on other branches).
export const BLOCKED_DIRS = [
    'tools', 'helpers', 'docs', 'scripts', 'android', 'ios', 'gps-beta',
    'firebase-functions', 'functions', 'test-runs', 'dist', 'www',
    'node_modules', '.github', '.wrangler', '.git'
];

// Top-level files that are not the site.
export const BLOCKED_FILES = [
    'package.json', 'package-lock.json', 'firebase.json', 'build-shell.js',
    'sync-mobile-web.js', 'global_courses_snapshot.json', 'capacitor.config.ts',
    '.gitignore'
];

// Top-level file patterns that are not the site.
export const BLOCKED_PATTERNS = [
    /_test\.js$/i,            // the test files
    /\.test\.js$/i,
    /\.fixture\.json$/i,      // test fixtures
    /\.tests-data\.json$/i,
    /^database\.rules.*\.json$/i,   // rules (live and rollback copies)
    /\.md$/i,                 // notes and plans
    /\.mjs$/i,
    /\.ts$/i,
    /\.swift$/i,
    /^\./                     // dot-files
];

export function isBlockedPath(pathname) {
    let p = String(pathname || '/');
    try { p = decodeURIComponent(p); } catch (e) { /* keep it raw */ }
    p = p.replace(/\/{2,}/g, '/');
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) return false;
    const first = parts[0].toLowerCase();
    if (parts.length > 1 || p.endsWith('/')) {
        if (BLOCKED_DIRS.includes(first)) return true;
    }
    if (parts.length === 1) {
        if (BLOCKED_DIRS.includes(first)) return true;   // /tools, /ios
        if (BLOCKED_FILES.includes(first)) return true;
        if (BLOCKED_PATTERNS.some((re) => re.test(parts[0]))) return true;
    }
    return false;
}

export function notFound() {
    return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
    });
}

export async function onRequest(context) {
    let pathname = '/';
    try { pathname = new URL(context.request.url).pathname; } catch (e) { /* treat as / */ }
    if (isBlockedPath(pathname)) return notFound();
    return context.next();
}
